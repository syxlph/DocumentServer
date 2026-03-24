from pathlib import Path


BUILDER_IMAGE_CONFIG = Path(__file__).with_name(".builder-image")


def resolve_builder_image(environ, config_path=BUILDER_IMAGE_CONFIG):
    builder_image = environ.get("ONLYOFFICE_BUILDER_IMAGE", "").strip()
    if builder_image:
        return builder_image

    if config_path.is_file():
        builder_image = config_path.read_text(encoding="utf-8").strip()
        if builder_image:
            return builder_image

    raise RuntimeError("ONLYOFFICE_BUILDER_IMAGE must be set")
