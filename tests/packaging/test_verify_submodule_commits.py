import subprocess
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packaging"))

import verify_submodule_commits


class VerifySubmoduleCommitsTests(unittest.TestCase):
    def test_required_fork_submodule_refs_reads_pinned_gitlinks(self):
        responses = {
            "refs/heads/agent-plugin:sdkjs": "3f5d86f09a01a63ca7435ded67481c1b67a0786d",
            "refs/heads/agent-plugin:web-apps": "4d56c3e6557659afa6498affb21a029e6624ce3a",
        }

        def fake_capture(command, cwd=None):
            self.assertEqual(cwd, Path("/repo"))
            self.assertEqual(command[:3], ["git", "rev-parse", command[2]])
            return responses[command[2]]

        refs = verify_submodule_commits.required_fork_submodule_refs(
            Path("/repo"),
            "refs/heads/agent-plugin",
            "syxlph/DocumentServer",
            capture_command=fake_capture,
        )

        self.assertEqual(
            refs,
            [
                {
                    "path": "sdkjs",
                    "sha": "3f5d86f09a01a63ca7435ded67481c1b67a0786d",
                    "url": "https://github.com/syxlph/sdkjs.git",
                },
                {
                    "path": "web-apps",
                    "sha": "4d56c3e6557659afa6498affb21a029e6624ce3a",
                    "url": "https://github.com/syxlph/web-apps.git",
                },
            ],
        )

    def test_verify_remote_commit_fetches_exact_sha(self):
        calls = []

        def fake_run(command, cwd=None):
            calls.append((command, cwd))

        verify_submodule_commits.verify_remote_commit(
            "https://github.com/syxlph/sdkjs.git",
            "3f5d86f09a01a63ca7435ded67481c1b67a0786d",
            run_command=fake_run,
        )

        self.assertEqual(calls[0][0], ["git", "init"])
        self.assertEqual(calls[1][0], ["git", "remote", "add", "origin", "https://github.com/syxlph/sdkjs.git"])
        self.assertEqual(
            calls[2][0],
            ["git", "fetch", "--depth=1", "origin", "3f5d86f09a01a63ca7435ded67481c1b67a0786d"],
        )

    def test_verify_remote_commit_raises_clear_error(self):
        def fake_run(command, cwd=None):
            if command[:2] == ["git", "fetch"]:
                raise subprocess.CalledProcessError(128, command)

        with self.assertRaisesRegex(
            RuntimeError,
            "https://github.com/syxlph/sdkjs.git does not contain required commit 3f5d86f09a01a63ca7435ded67481c1b67a0786d",
        ):
            verify_submodule_commits.verify_remote_commit(
                "https://github.com/syxlph/sdkjs.git",
                "3f5d86f09a01a63ca7435ded67481c1b67a0786d",
                run_command=fake_run,
            )


if __name__ == "__main__":
    unittest.main()
