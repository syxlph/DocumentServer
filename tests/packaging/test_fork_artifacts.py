import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packaging"))

import fork_artifacts


class ForkArtifactsTests(unittest.TestCase):
    def test_build_manifest_and_asset_names_include_pinned_refs(self):
        manifest = fork_artifacts.build_manifest(
            release_tag="v0.1.0-agent.1",
            source_ref="refs/heads/agent-plugin",
            builder_image="ghcr.io/example/onlyoffice-builder:20260324",
            documentserver_sha="19dfbbe7",
            sdkjs_sha="3f5d86f09a",
            web_apps_sha="4d56c3e655",
        )

        self.assertEqual(manifest["release_tag"], "v0.1.0-agent.1")
        self.assertEqual(manifest["builder_image"], "ghcr.io/example/onlyoffice-builder:20260324")
        self.assertEqual(manifest["repos"]["sdkjs"], "3f5d86f09a")
        self.assertEqual(
            fork_artifacts.artifact_base_name(manifest),
            "onlyoffice-fork-v0.1.0-agent.1-ds-19dfbbe7-sdkjs-3f5d86f09a-web-apps-4d56c3e655",
        )
        self.assertEqual(
            fork_artifacts.immutable_image_tag(manifest),
            "ds-19dfbbe7-sdkjs-3f5d86f09a-wa-4d56c3e655-af602135c6ee",
        )

    def test_immutable_image_tag_stays_docker_safe_for_full_shas(self):
        manifest = fork_artifacts.build_manifest(
            release_tag="v0.1.0-agent.20260325.2",
            source_ref="agent-plugin",
            builder_image="ghcr.io/syxlph/onlyoffice-builder:20260324-51516e6",
            documentserver_sha="e8e77fde2d070737561e93aa20fb68f64b6a2f69",
            sdkjs_sha="3f5d86f09a01a63ca7435ded67481c1b67a0786d",
            web_apps_sha="4d56c3e6557659afa6498affb21a029e6624ce3a",
        )

        tag = fork_artifacts.immutable_image_tag(manifest)

        self.assertLessEqual(len(tag), 128)
        self.assertRegex(tag, r"^ds-[0-9a-f]{12}-sdkjs-[0-9a-f]{12}-wa-[0-9a-f]{12}-[0-9a-f]{12}$")

    def test_verify_release_assets_checks_checksum_and_expected_metadata(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            tarball = root / "runtime.tar.gz"
            manifest_path = root / "manifest.json"
            checksum_path = root / "runtime.sha256"

            tarball.write_bytes(b"runtime")
            manifest = fork_artifacts.build_manifest(
                release_tag="v0.1.0-agent.1",
                source_ref="refs/heads/agent-plugin",
                builder_image="ghcr.io/example/onlyoffice-builder:20260324",
                documentserver_sha="19dfbbe7",
                sdkjs_sha="3f5d86f09a",
                web_apps_sha="4d56c3e655",
            )
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            checksum_path.write_text(
                hashlib.sha256(tarball.read_bytes()).hexdigest() + "  " + tarball.name + "\n",
                encoding="utf-8",
            )

            verified = fork_artifacts.verify_release_assets(
                tarball_path=tarball,
                manifest_path=manifest_path,
                checksum_path=checksum_path,
                expected_release_tag="v0.1.0-agent.1",
            )

            self.assertEqual(verified["repos"]["web-apps"], "4d56c3e655")

    def test_verify_release_assets_rejects_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            tarball = root / "runtime.tar.gz"
            manifest_path = root / "manifest.json"
            checksum_path = root / "runtime.sha256"

            tarball.write_bytes(b"runtime")
            manifest = fork_artifacts.build_manifest(
                release_tag="v0.1.0-agent.1",
                source_ref="refs/heads/agent-plugin",
                builder_image="ghcr.io/example/onlyoffice-builder:20260324",
                documentserver_sha="19dfbbe7",
                sdkjs_sha="3f5d86f09a",
                web_apps_sha="4d56c3e655",
            )
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            checksum_path.write_text("deadbeef  runtime.tar.gz\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                fork_artifacts.verify_release_assets(
                    tarball_path=tarball,
                    manifest_path=manifest_path,
                    checksum_path=checksum_path,
                    expected_release_tag="v0.1.0-agent.1",
                )


if __name__ == "__main__":
    unittest.main()
