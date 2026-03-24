#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import modal
import requests

try:
    from build_config import resolve_builder_image
except ModuleNotFoundError:
    # Modal imports the entrypoint file in isolation inside the remote container,
    # so sibling helper modules are not guaranteed to be present there.
    def resolve_builder_image(environ, config_path=None):
        if config_path is None:
            config_path = Path(__file__).with_name(".builder-image")

        builder_image = environ.get("ONLYOFFICE_BUILDER_IMAGE", "").strip()
        if builder_image:
            return builder_image

        if config_path.is_file():
            builder_image = config_path.read_text(encoding="utf-8").strip()
            if builder_image:
                return builder_image

        raise RuntimeError("ONLYOFFICE_BUILDER_IMAGE must be set")

APP_NAME = "onlyoffice-fork-build"
GITHUB_API = "https://api.github.com"
REQUIRED_AUX_REPOS = {
    "onlyoffice.github.io": "https://github.com/ONLYOFFICE/onlyoffice.github.io.git",
    "document-templates": "https://github.com/ONLYOFFICE/document-templates.git",
    "document-formats": "https://github.com/ONLYOFFICE/document-formats.git",
    "document-server-integration": "https://github.com/ONLYOFFICE/document-server-integration.git",
}


def _image():
    builder_image = resolve_builder_image(os.environ)
    registry_username = os.environ.get("BUILDER_REGISTRY_USERNAME")
    registry_password = os.environ.get("BUILDER_REGISTRY_PASSWORD")
    registry_secret = None
    if registry_username and registry_password:
        registry_secret = modal.Secret.from_dict({
            "REGISTRY_USERNAME": registry_username,
            "REGISTRY_PASSWORD": registry_password,
        })

    return modal.Image.from_registry(
        builder_image,
        add_python="3.11",
        secret=registry_secret,
    ).pip_install("requests")


def _secrets():
    github_token = os.environ.get("GITHUB_TOKEN")
    if not github_token:
        return []
    return [modal.Secret.from_dict({"GITHUB_TOKEN": github_token})]


app = modal.App(APP_NAME)


def run(command, cwd=None, env=None):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def capture(command, cwd=None, env=None):
    return subprocess.check_output(command, cwd=cwd, env=env, text=True).strip()


def ensure_release(session, repository, release_tag):
    response = session.get(f"{GITHUB_API}/repos/{repository}/releases/tags/{release_tag}")
    if response.status_code == 404:
        create = session.post(
            f"{GITHUB_API}/repos/{repository}/releases",
            json={
                "tag_name": release_tag,
                "name": release_tag,
                "draft": False,
                "prerelease": True,
                "generate_release_notes": False,
            },
        )
        create.raise_for_status()
        return create.json()

    response.raise_for_status()
    return response.json()


def upload_asset(session, upload_url, asset_path):
    params = {"name": asset_path.name}
    with asset_path.open("rb") as stream:
        response = session.post(
            upload_url.split("{", 1)[0],
            params=params,
            headers={"Content-Type": "application/octet-stream"},
            data=stream,
        )
        response.raise_for_status()


def prepare_workspace(work_root, repo_url, source_ref):
    work_root.mkdir(parents=True, exist_ok=True)
    source_root = work_root / "source"
    run(["git", "clone", repo_url, str(source_root)])
    run(["git", "checkout", source_ref], cwd=source_root)
    run(["git", "submodule", "update", "--init", "--recursive"], cwd=source_root)

    build_root = Path("/build_tools")
    for name in ["server", "sdkjs", "web-apps", "core", "core-fonts", "dictionaries", "sdkjs-plugins"]:
        target = build_root / name
        if target.exists() or target.is_symlink():
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            else:
                target.unlink()
        os.symlink(source_root / name, target, target_is_directory=True)

    for name, clone_url in REQUIRED_AUX_REPOS.items():
        target = build_root / name
        if target.exists():
            shutil.rmtree(target)
        run(["git", "clone", "--depth", "1", clone_url, str(target)])

    return source_root


@app.function(image=_image(), secrets=_secrets(), timeout=60 * 60 * 4, cpu=8, memory=32768)
def build_artifact(repo_url, source_ref, release_tag, github_repository):
    builder_image = resolve_builder_image(os.environ)
    github_token = os.environ["GITHUB_TOKEN"]
    with tempfile.TemporaryDirectory(prefix="onlyoffice-fork-build-") as tmpdir:
        work_root = Path(tmpdir)
        source_root = prepare_workspace(work_root, repo_url, source_ref)
        build_root = Path("/build_tools")
        env = os.environ.copy()
        env["PRODUCT_VERSION"] = (build_root / "version").read_text(encoding="utf-8").strip()

        run(
            [
                "./tools/linux/python3/bin/python3",
                "./configure.py",
                "--sysroot",
                "1",
                "--clean",
                "1",
                "--update",
                "0",
                "--module",
                "server",
                "--platform",
                "linux_64",
                "--qt-dir",
                str(build_root / "tools/linux/qt_build/Qt-5.9.9"),
            ],
            cwd=build_root,
            env=env,
        )
        run(["./tools/linux/python3/bin/python3", "./make.py"], cwd=build_root, env=env)

        runtime_dir = build_root / "out/linux_64/onlyoffice/documentserver"
        if not (runtime_dir / "sdkjs-plugins/agent-plugin/config.json").is_file():
            raise RuntimeError("Bundled agent-plugin was not assembled into the deployed runtime")

        output_dir = work_root / "release-assets"
        run(
            [
                "./tools/linux/python3/bin/python3",
                str(source_root / "packaging/create_release_assets.py"),
                "--runtime-dir",
                str(runtime_dir),
                "--output-dir",
                str(output_dir),
                "--release-tag",
                release_tag,
                "--source-ref",
                source_ref,
                "--builder-image",
                builder_image,
                "--documentserver-sha",
                capture(["git", "rev-parse", "HEAD"], cwd=source_root),
                "--sdkjs-sha",
                capture(["git", "rev-parse", "HEAD"], cwd=source_root / "sdkjs"),
                "--web-apps-sha",
                capture(["git", "rev-parse", "HEAD"], cwd=source_root / "web-apps"),
            ],
            cwd=build_root,
            env=env,
        )

        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {github_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })

        release = ensure_release(session, github_repository, release_tag)
        upload_url = release["upload_url"]
        existing_assets = {asset["name"]: asset["url"] for asset in release.get("assets", [])}
        for asset_path in sorted(output_dir.iterdir()):
            if asset_path.name in existing_assets:
                delete = session.delete(existing_assets[asset_path.name])
                delete.raise_for_status()
            upload_asset(session, upload_url, asset_path)

        return {
            "release_tag": release_tag,
            "uploaded_assets": sorted(asset.name for asset in output_dir.iterdir()),
        }


@app.local_entrypoint()
def main(source_ref: str, release_tag: str, github_repository: str, repo_url: str = ""):
    if not repo_url:
        github_token = os.environ.get("GITHUB_TOKEN")
        if github_token:
            repo_url = f"https://x-access-token:{github_token}@github.com/{github_repository}.git"
        else:
            repo_url = f"https://github.com/{github_repository}.git"
    result = build_artifact.remote(repo_url, source_ref, release_tag, github_repository)
    print(json.dumps(result, indent=2))
