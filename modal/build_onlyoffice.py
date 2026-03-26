#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import modal

PLACEHOLDER_REMOTE_IMAGE = "docker.io/library/debian:bookworm-slim"
CACHE_VOLUME_NAME = "onlyoffice-fork-build-cache"
CACHE_MOUNT_PATH = Path("/cache")
CACHE_ROOT = CACHE_MOUNT_PATH / "onlyoffice-fork"
MIRROR_ROOT = CACHE_ROOT / "mirrors"

if modal.is_local():
    from build_config import resolve_builder_image
else:
    resolve_builder_image = None

APP_NAME = "onlyoffice-fork-build"
GITHUB_API = "https://api.github.com"
REQUIRED_AUX_REPOS = {
    "onlyoffice.github.io": "https://github.com/ONLYOFFICE/onlyoffice.github.io.git",
    "document-templates": "https://github.com/ONLYOFFICE/document-templates.git",
    "document-formats": "https://github.com/ONLYOFFICE/document-formats.git",
    "document-server-integration": "https://github.com/ONLYOFFICE/document-server-integration.git",
}
REQUIRED_SUBMODULE_PATHS = ["core", "core-fonts", "dictionaries", "sdkjs", "server", "web-apps"]
BOOST_CACHE_REPO = "https://github.com/boostorg/boost.git"
BOOST_CACHE_TAG = "boost-1.72.0"
BOOST_CACHE_DIRNAME = "boost_1_72_0"
BUILD_CACHE_VOLUME = modal.Volume.from_name(CACHE_VOLUME_NAME, create_if_missing=True)


def _local_builder_image():
    if not modal.is_local():
        return None

    return resolve_builder_image(os.environ)


def _image():
    builder_image = _local_builder_image()
    registry_username = os.environ.get("BUILDER_REGISTRY_USERNAME")
    registry_password = os.environ.get("BUILDER_REGISTRY_PASSWORD")
    registry_secret = None
    if registry_username and registry_password:
        registry_secret = modal.Secret.from_dict({
            "REGISTRY_USERNAME": registry_username,
            "REGISTRY_PASSWORD": registry_password,
        })

    if not builder_image:
        # The remote worker imports this module again inside the already-selected
        # container image, so import-time image resolution must not depend on
        # local files or runner-only environment variables there.
        return modal.Image.from_registry(PLACEHOLDER_REMOTE_IMAGE, add_python="3.11")

    return modal.Image.from_registry(
        builder_image,
        add_python="3.11",
        secret=registry_secret,
    )


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


def require_github_token(env):
    github_token = env.get("GITHUB_TOKEN")
    if not github_token:
        raise RuntimeError("GITHUB_TOKEN is required for the Modal artifact build.")
    return github_token


def git_status_lines(repo_root, capture_command=capture):
    output = capture_command(["git", "status", "--short"], cwd=repo_root)
    return [line for line in output.splitlines() if line.strip()]


def github_api_request(method, url, github_token, payload=None, headers=None, data=None):
    request_headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "onlyoffice-fork-build",
    }
    if headers:
        request_headers.update(headers)

    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    elif data is not None:
        body = data

    req = urllib_request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib_request.urlopen(req) as response:
            return response.status, dict(response.headers), response.read()
    except urllib_error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def ensure_release(github_token, repository, release_tag):
    status, _headers, body = github_api_request(
        "GET",
        f"{GITHUB_API}/repos/{repository}/releases/tags/{release_tag}",
        github_token,
    )
    if status == 404:
        create_status, _create_headers, create_body = github_api_request(
            "POST",
            f"{GITHUB_API}/repos/{repository}/releases",
            github_token,
            payload={
                "tag_name": release_tag,
                "name": release_tag,
                "draft": False,
                "prerelease": True,
                "generate_release_notes": False,
            },
        )
        if create_status >= 400:
            raise RuntimeError(
                f"Failed to create release {release_tag}: {create_status} {create_body.decode('utf-8', 'replace')}"
            )
        return json.loads(create_body.decode("utf-8"))

    if status >= 400:
        raise RuntimeError(
            f"Failed to fetch release {release_tag}: {status} {body.decode('utf-8', 'replace')}"
        )
    return json.loads(body.decode("utf-8"))


def delete_asset(github_token, asset_url):
    status, _headers, body = github_api_request("DELETE", asset_url, github_token)
    if status >= 400:
        raise RuntimeError(f"Failed to delete asset: {status} {body.decode('utf-8', 'replace')}")


def upload_asset(github_token, upload_url, asset_path):
    upload_base = upload_url.split("{", 1)[0]
    upload_target = f"{upload_base}?{urllib_parse.urlencode({'name': asset_path.name})}"
    with asset_path.open("rb") as stream:
        status, _headers, body = github_api_request(
            "POST",
            upload_target,
            github_token,
            headers={"Content-Type": "application/octet-stream"},
            data=stream.read(),
        )
    if status >= 400:
        raise RuntimeError(
            f"Failed to upload asset {asset_path.name}: {status} {body.decode('utf-8', 'replace')}"
        )


def ensure_mirror(cache_root, cache_name, clone_url):
    mirror_root = cache_root / "mirrors"
    mirror_root.mkdir(parents=True, exist_ok=True)
    mirror_path = mirror_root / f"{cache_name}.git"

    try:
        if mirror_path.exists():
            run(["git", "remote", "set-url", "origin", clone_url], cwd=mirror_path)
            run(["git", "fetch", "--prune", "--tags", "origin"], cwd=mirror_path)
        else:
            run(["git", "clone", clone_url, str(mirror_path)])
    except subprocess.CalledProcessError:
        if mirror_path.exists():
            shutil.rmtree(mirror_path)
        raise

    return mirror_path


def clone_from_mirror(mirror_path, target_path):
    if target_path.exists():
        shutil.rmtree(target_path)
    run(["git", "clone", str(mirror_path), str(target_path)])


def remove_path(target):
    if target.exists() or target.is_symlink():
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink()


def workspace_repo_target(build_root, repo_name):
    return build_root.parent / repo_name


def workspace_source_build_tools_target(source_root):
    return source_root / "build_tools"


def workspace_contract_paths(build_root, source_root):
    paths = [("build-root", build_root), ("source-build-tools", workspace_source_build_tools_target(source_root))]
    for name in REQUIRED_SUBMODULE_PATHS + ["sdkjs-plugins"]:
        paths.append((f"repo:{name}", workspace_repo_target(build_root, name)))
    for name in sorted(REQUIRED_AUX_REPOS):
        paths.append((f"aux:{name}", workspace_repo_target(build_root, name)))
    return paths


def validate_workspace_contract(build_root, source_root):
    missing = [
        {"name": name, "path": str(path)}
        for name, path in workspace_contract_paths(build_root, source_root)
        if not path.exists()
    ]
    if missing:
        raise RuntimeError(
            "Modal workspace contract is incomplete: "
            + json.dumps({"build_root": str(build_root), "source_root": str(source_root), "missing": missing})
        )


def boost_cache_source_path(cache_root):
    return cache_root / "third_party" / BOOST_CACHE_DIRNAME


def ensure_cached_boost_source(cache_root, run_command=run):
    cache_path = boost_cache_source_path(cache_root)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.exists():
        return cache_path

    try:
        run_command(
            [
                "git",
                "clone",
                "--recursive",
                "--depth=1",
                BOOST_CACHE_REPO,
                str(cache_path),
                "-b",
                BOOST_CACHE_TAG,
            ]
        )
    except subprocess.CalledProcessError:
        if cache_path.exists():
            shutil.rmtree(cache_path)
        raise

    return cache_path


def populate_boost_source(cache_root, source_root, run_command=run):
    cached_boost = ensure_cached_boost_source(cache_root, run_command=run_command)
    target = source_root / "core" / "Common" / "3dParty" / "boost" / BOOST_CACHE_DIRNAME
    remove_path(target)
    shutil.copytree(cached_boost, target, symlinks=True)
    return target


def required_submodule_urls(github_repository):
    owner = github_repository.split("/", 1)[0]
    return {
        "core": "https://github.com/ONLYOFFICE/core.git",
        "core-fonts": "https://github.com/ONLYOFFICE/core-fonts.git",
        "dictionaries": "https://github.com/ONLYOFFICE/dictionaries.git",
        "sdkjs": f"https://github.com/{owner}/sdkjs.git",
        "server": "https://github.com/ONLYOFFICE/server.git",
        "web-apps": f"https://github.com/{owner}/web-apps.git",
    }


def prepare_workspace(work_root, repo_url, source_ref, github_repository):
    work_root.mkdir(parents=True, exist_ok=True)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    source_root = work_root / "source"
    documentserver_mirror = ensure_mirror(CACHE_ROOT, "documentserver", repo_url)
    submodule_urls = required_submodule_urls(github_repository)
    for path, url in submodule_urls.items():
        ensure_mirror(CACHE_ROOT, path, url)
    for name, clone_url in REQUIRED_AUX_REPOS.items():
        ensure_mirror(CACHE_ROOT, name, clone_url)

    BUILD_CACHE_VOLUME.commit()

    clone_from_mirror(documentserver_mirror, source_root)
    run(["git", "remote", "set-url", "origin", repo_url], cwd=source_root)
    run(["git", "fetch", "--prune", "origin"], cwd=source_root)
    run(["git", "checkout", source_ref], cwd=source_root)

    for path in REQUIRED_SUBMODULE_PATHS:
        mirror_uri = (MIRROR_ROOT / f"{path}.git").resolve().as_uri()
        run(["git", "submodule", "set-url", path, mirror_uri], cwd=source_root)

    run(["git", "submodule", "sync", "--"] + REQUIRED_SUBMODULE_PATHS, cwd=source_root)
    run(
        ["git", "-c", "protocol.file.allow=always", "submodule", "update", "--init", "--"] + REQUIRED_SUBMODULE_PATHS,
        cwd=source_root,
    )

    build_root = Path("/build_tools")
    source_build_tools = workspace_source_build_tools_target(source_root)
    remove_path(source_build_tools)
    os.symlink(build_root, source_build_tools, target_is_directory=True)

    for name in ["server", "sdkjs", "web-apps", "core", "core-fonts", "dictionaries", "sdkjs-plugins"]:
        remove_path(build_root / name)
        target = workspace_repo_target(build_root, name)
        remove_path(target)
        os.symlink(source_root / name, target, target_is_directory=True)

    for name, clone_url in REQUIRED_AUX_REPOS.items():
        remove_path(build_root / name)
        target = workspace_repo_target(build_root, name)
        clone_from_mirror(MIRROR_ROOT / f"{name}.git", target)

    validate_workspace_contract(build_root, source_root)
    return source_root


@app.function(image=_image(), secrets=_secrets(), timeout=60 * 60 * 4, volumes={str(CACHE_MOUNT_PATH): BUILD_CACHE_VOLUME})
def build_artifact(repo_url, source_ref, release_tag, github_repository, builder_image):
    BUILD_CACHE_VOLUME.reload()
    github_token = require_github_token(os.environ)
    with tempfile.TemporaryDirectory(prefix="onlyoffice-fork-build-") as tmpdir:
        work_root = Path(tmpdir)
        source_root = prepare_workspace(work_root, repo_url, source_ref, github_repository)
        boost_source = populate_boost_source(CACHE_ROOT, source_root)
        BUILD_CACHE_VOLUME.commit()
        build_root = Path("/build_tools")
        env = os.environ.copy()
        env["PRODUCT_VERSION"] = (build_root / "version").read_text(encoding="utf-8").strip()
        boost_status_before = git_status_lines(boost_source)
        print(json.dumps({
            "event": "boost-source-status-before-build",
            "path": str(boost_source),
            "status": boost_status_before,
        }))

        try:
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
        finally:
            boost_status_after = git_status_lines(boost_source)
            print(json.dumps({
                "event": "boost-source-status-after-build",
                "path": str(boost_source),
                "status": boost_status_after,
                "changed": boost_status_after != boost_status_before,
            }))

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

        release = ensure_release(github_token, github_repository, release_tag)
        upload_url = release["upload_url"]
        existing_assets = {asset["name"]: asset["url"] for asset in release.get("assets", [])}
        for asset_path in sorted(output_dir.iterdir()):
            if asset_path.name in existing_assets:
                delete_asset(github_token, existing_assets[asset_path.name])
            upload_asset(github_token, upload_url, asset_path)

        return {
            "release_tag": release_tag,
            "uploaded_assets": sorted(asset.name for asset in output_dir.iterdir()),
        }


@app.local_entrypoint()
def main(source_ref: str, release_tag: str, github_repository: str, repo_url: str = ""):
    builder_image = _local_builder_image()
    if not builder_image:
        raise RuntimeError("ONLYOFFICE_BUILDER_IMAGE must be set for local Modal invocation")
    github_token = require_github_token(os.environ)

    if not repo_url:
        repo_url = f"https://x-access-token:{github_token}@github.com/{github_repository}.git"
    result = build_artifact.remote(repo_url, source_ref, release_tag, github_repository, builder_image)
    print(json.dumps(result, indent=2))
