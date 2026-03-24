#!/usr/bin/env python3

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

REQUIRED_FORK_SUBMODULES = ["sdkjs", "web-apps"]


def run(command, cwd=None):
    subprocess.run(command, cwd=cwd, check=True)


def capture(command, cwd=None):
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def required_fork_submodule_refs(repo_root, source_ref, github_repository, capture_command=capture):
    owner = github_repository.split("/", 1)[0]
    refs = []
    for path in REQUIRED_FORK_SUBMODULES:
        sha = capture_command(["git", "rev-parse", f"{source_ref}:{path}"], cwd=repo_root)
        refs.append({
            "path": path,
            "sha": sha,
            "url": f"https://github.com/{owner}/{path}.git",
        })
    return refs


def verify_remote_commit(url, sha, run_command=run):
    with tempfile.TemporaryDirectory(prefix="onlyoffice-fork-submodule-check-") as tmpdir:
        repo_root = Path(tmpdir)
        run_command(["git", "init"], cwd=repo_root)
        run_command(["git", "remote", "add", "origin", url], cwd=repo_root)
        try:
            run_command(["git", "fetch", "--depth=1", "origin", sha], cwd=repo_root)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"{url} does not contain required commit {sha}") from exc


def main():
    parser = argparse.ArgumentParser(description="Verify forked submodule commits are published before starting a build")
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--github-repository", required=True)
    args = parser.parse_args()

    refs = required_fork_submodule_refs(args.repo_root, args.source_ref, args.github_repository)
    for ref in refs:
        verify_remote_commit(ref["url"], ref["sha"])

    print(json.dumps({"verified": refs}, indent=2))


if __name__ == "__main__":
    main()
