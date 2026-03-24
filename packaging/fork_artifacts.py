import hashlib
import json
from pathlib import Path


def build_manifest(
    release_tag,
    source_ref,
    builder_image,
    documentserver_sha,
    sdkjs_sha,
    web_apps_sha,
):
    return {
        "release_tag": release_tag,
        "source_ref": source_ref,
        "builder_image": builder_image,
        "repos": {
            "DocumentServer": documentserver_sha,
            "sdkjs": sdkjs_sha,
            "web-apps": web_apps_sha,
        },
    }


def artifact_base_name(manifest):
    return (
        "onlyoffice-fork-"
        + manifest["release_tag"]
        + "-ds-"
        + manifest["repos"]["DocumentServer"]
        + "-sdkjs-"
        + manifest["repos"]["sdkjs"]
        + "-web-apps-"
        + manifest["repos"]["web-apps"]
    )


def immutable_image_tag(manifest):
    return (
        "ds-"
        + manifest["repos"]["DocumentServer"]
        + "-sdkjs-"
        + manifest["repos"]["sdkjs"]
        + "-web-apps-"
        + manifest["repos"]["web-apps"]
    )


def artifact_file_names(manifest):
    base_name = artifact_base_name(manifest)
    return {
        "tarball": base_name + ".tar.gz",
        "manifest": base_name + ".manifest.json",
        "checksum": base_name + ".sha256",
    }


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def verify_release_assets(
    tarball_path,
    manifest_path,
    checksum_path,
    expected_release_tag,
    expected_builder_image=None,
):
    tarball_path = Path(tarball_path)
    manifest_path = Path(manifest_path)
    checksum_path = Path(checksum_path)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["release_tag"] != expected_release_tag:
        raise ValueError("Release tag mismatch")

    if expected_builder_image and manifest["builder_image"] != expected_builder_image:
        raise ValueError("Builder image mismatch")

    checksum_line = checksum_path.read_text(encoding="utf-8").strip()
    expected_checksum, expected_name = checksum_line.split("  ", 1)
    if expected_name != tarball_path.name:
        raise ValueError("Checksum file does not match tarball name")

    actual_checksum = sha256_file(tarball_path)
    if actual_checksum != expected_checksum:
        raise ValueError("Checksum mismatch")

    return manifest
