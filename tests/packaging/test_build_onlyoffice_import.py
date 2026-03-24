import importlib.util
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path


class FakeImageHandle:
    def __init__(self, ref):
        self.ref = ref

    def pip_install(self, *_packages):
        return self


class FakeImageModule:
    calls = []

    @classmethod
    def from_registry(cls, ref, add_python=None, secret=None):
        cls.calls.append({
            "ref": ref,
            "add_python": add_python,
            "secret": secret,
        })
        return FakeImageHandle(ref)


class FakeSecretModule:
    @staticmethod
    def from_dict(payload):
        return payload


class FakeVolumeHandle:
    def commit(self):
        return None

    def reload(self):
        return None


class FakeVolumeModule:
    calls = []

    @classmethod
    def from_name(cls, name, create_if_missing=False):
        cls.calls.append({
            "name": name,
            "create_if_missing": create_if_missing,
        })
        return FakeVolumeHandle()


class FakeApp:
    def __init__(self, _name):
        self.name = _name

    def function(self, **_kwargs):
        def decorator(fn):
            return fn

        return decorator

    def local_entrypoint(self):
        def decorator(fn):
            return fn

        return decorator


class BuildOnlyofficeImportTests(unittest.TestCase):
    def _import_module(self):
        module_path = Path(__file__).resolve().parents[2] / "modal" / "build_onlyoffice.py"
        fake_modal = types.ModuleType("modal")
        fake_modal.is_local = lambda: False
        fake_modal.Image = FakeImageModule
        fake_modal.Secret = FakeSecretModule
        fake_modal.Volume = FakeVolumeModule
        fake_modal.App = FakeApp
        fake_requests = types.ModuleType("requests")

        previous_modal = sys.modules.get("modal")
        previous_requests = sys.modules.get("requests")
        try:
            sys.modules["modal"] = fake_modal
            sys.modules["requests"] = fake_requests
            FakeImageModule.calls = []
            FakeVolumeModule.calls = []

            spec = importlib.util.spec_from_file_location("test_build_onlyoffice_remote", module_path)
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None
            spec.loader.exec_module(module)

            return module
        finally:
            if previous_modal is not None:
                sys.modules["modal"] = previous_modal
            else:
                sys.modules.pop("modal", None)

            if previous_requests is not None:
                sys.modules["requests"] = previous_requests
            else:
                sys.modules.pop("requests", None)

    def test_remote_import_uses_placeholder_image_without_local_builder_state(self):
        module = self._import_module()

        self.assertEqual(FakeImageModule.calls[0]["ref"], module.PLACEHOLDER_REMOTE_IMAGE)

    def test_required_submodule_urls_uses_upstream_for_unforked_repos(self):
        module = self._import_module()

        urls = module.required_submodule_urls("syxlph/DocumentServer")

        self.assertEqual(urls["core"], "https://github.com/ONLYOFFICE/core.git")
        self.assertEqual(urls["core-fonts"], "https://github.com/ONLYOFFICE/core-fonts.git")
        self.assertEqual(urls["dictionaries"], "https://github.com/ONLYOFFICE/dictionaries.git")
        self.assertEqual(urls["server"], "https://github.com/ONLYOFFICE/server.git")
        self.assertEqual(urls["sdkjs"], "https://github.com/syxlph/sdkjs.git")
        self.assertEqual(urls["web-apps"], "https://github.com/syxlph/web-apps.git")

    def test_remote_import_declares_named_cache_volume(self):
        module = self._import_module()

        self.assertEqual(FakeVolumeModule.calls[0]["name"], module.CACHE_VOLUME_NAME)
        self.assertTrue(FakeVolumeModule.calls[0]["create_if_missing"])

    def test_workspace_repo_target_uses_sibling_layout(self):
        module = self._import_module()

        self.assertEqual(module.workspace_repo_target(Path("/build_tools"), "core"), Path("/core"))
        self.assertEqual(module.workspace_repo_target(Path("/build_tools"), "sdkjs"), Path("/sdkjs"))
        self.assertEqual(module.workspace_repo_target(Path("/build_tools"), "onlyoffice.github.io"), Path("/onlyoffice.github.io"))

    def test_ensure_mirror_removes_partial_clone_on_failure(self):
        module = self._import_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            cache_root = Path(tmpdir)

            def fake_run(command, cwd=None, env=None):
                target = Path(command[-1])
                target.mkdir(parents=True, exist_ok=True)
                raise subprocess.CalledProcessError(128, command)

            original_run = module.run
            module.run = fake_run
            try:
                with self.assertRaises(subprocess.CalledProcessError):
                    module.ensure_mirror(cache_root, "web-apps", "https://github.com/example/web-apps.git")
            finally:
                module.run = original_run

            self.assertFalse((cache_root / "mirrors" / "web-apps.git").exists())


if __name__ == "__main__":
    unittest.main()
