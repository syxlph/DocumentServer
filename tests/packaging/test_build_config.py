import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "modal"))

import build_config


class BuildConfigTests(unittest.TestCase):
    def test_resolve_builder_image_prefers_environment(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / ".builder-image"
            config_path.write_text("ghcr.io/example/from-file:tag\n", encoding="utf-8")

            builder_image = build_config.resolve_builder_image(
                {"ONLYOFFICE_BUILDER_IMAGE": "ghcr.io/example/from-env:tag"},
                config_path=config_path,
            )

            self.assertEqual(builder_image, "ghcr.io/example/from-env:tag")

    def test_resolve_builder_image_falls_back_to_config_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / ".builder-image"
            config_path.write_text("ghcr.io/example/from-file:tag\n", encoding="utf-8")

            builder_image = build_config.resolve_builder_image({}, config_path=config_path)

            self.assertEqual(builder_image, "ghcr.io/example/from-file:tag")

    def test_resolve_builder_image_requires_env_or_config(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / ".builder-image"

            with self.assertRaisesRegex(RuntimeError, "ONLYOFFICE_BUILDER_IMAGE must be set"):
                build_config.resolve_builder_image({}, config_path=config_path)


if __name__ == "__main__":
    unittest.main()
