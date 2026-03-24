#!/usr/bin/env python3

import argparse
import json
import tarfile
from pathlib import Path

import fork_artifacts


def parse_args():
    parser = argparse.ArgumentParser(description="Create ONLYOFFICE fork release assets")
    parser.add_argument("--runtime-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--release-tag", required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--builder-image", required=True)
    parser.add_argument("--documentserver-sha", required=True)
    parser.add_argument("--sdkjs-sha", required=True)
    parser.add_argument("--web-apps-sha", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    runtime_dir = Path(args.runtime_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = fork_artifacts.build_manifest(
        release_tag=args.release_tag,
        source_ref=args.source_ref,
        builder_image=args.builder_image,
        documentserver_sha=args.documentserver_sha,
        sdkjs_sha=args.sdkjs_sha,
        web_apps_sha=args.web_apps_sha,
    )
    asset_names = fork_artifacts.artifact_file_names(manifest)

    tarball_path = output_dir / asset_names["tarball"]
    manifest_path = output_dir / asset_names["manifest"]
    checksum_path = output_dir / asset_names["checksum"]

    with tarfile.open(tarball_path, "w:gz") as archive:
        archive.add(runtime_dir, arcname="documentserver")

    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    checksum = fork_artifacts.sha256_file(tarball_path)
    checksum_path.write_text(f"{checksum}  {tarball_path.name}\n", encoding="utf-8")

    print(json.dumps({
        "tarball": str(tarball_path),
        "manifest": str(manifest_path),
        "checksum": str(checksum_path),
        "immutable_image_tag": fork_artifacts.immutable_image_tag(manifest),
    }, indent=2))


if __name__ == "__main__":
    main()
