import importlib.util
import sys
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
        fake_modal.App = FakeApp
        fake_requests = types.ModuleType("requests")

        previous_modal = sys.modules.get("modal")
        previous_requests = sys.modules.get("requests")
        try:
            sys.modules["modal"] = fake_modal
            sys.modules["requests"] = fake_requests
            FakeImageModule.calls = []

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


if __name__ == "__main__":
    unittest.main()
