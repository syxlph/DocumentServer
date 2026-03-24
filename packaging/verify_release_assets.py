#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import fork_artifacts


def parse_args():
    parser = argparse.ArgumentParser(description="Verify ONLYOFFICE fork release assets")
    parser.add_argument("--asset-dir", required=True)
    parser.add_argument("--expected-release-tag", required=True)
    parser.add_argument("--expected-builder-image")
    parser.add_argument("--github-output")
    return parser.parse_args()


def find_single(asset_dir, suffix):
    matches = sorted(Path(asset_dir).glob(suffix))
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one asset matching {suffix}, found {len(matches)}")
    return matches[0]


def main():
    args = parse_args()
    asset_dir = Path(args.asset_dir)
    tarball = find_single(asset_dir, "*.tar.gz")
    manifest = find_single(asset_dir, "*.manifest.json")
    checksum = find_single(asset_dir, "*.sha256")

    verified = fork_artifacts.verify_release_assets(
        tarball_path=tarball,
        manifest_path=manifest,
        checksum_path=checksum,
        expected_release_tag=args.expected_release_tag,
        expected_builder_image=args.expected_builder_image,
    )

    output = {
        "tarball": str(tarball),
        "manifest": str(manifest),
        "checksum": str(checksum),
        "release_tag": verified["release_tag"],
        "immutable_image_tag": fork_artifacts.immutable_image_tag(verified),
    }

    if args.github_output:
        github_output = Path(args.github_output)
        with github_output.open("a", encoding="utf-8") as stream:
            for key, value in output.items():
                stream.write(f"{key}={value}\n")

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
