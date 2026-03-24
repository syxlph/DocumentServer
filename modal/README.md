# Modal Build Flow

This folder contains the source-build entrypoint for the forked ONLYOFFICE image pipeline.

## Inputs

- `ONLYOFFICE_BUILDER_IMAGE`
- `GITHUB_TOKEN`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

## Entry Point

Run the Modal artifact build locally:

```bash
export ONLYOFFICE_BUILDER_IMAGE=ghcr.io/<owner>/onlyoffice-builder:<tag>
export GITHUB_TOKEN=<github token with contents:write>
export BUILDER_REGISTRY_USERNAME=<ghcr username>
export BUILDER_REGISTRY_PASSWORD=<ghcr token if the builder image is private>
printf '%s\n' "$ONLYOFFICE_BUILDER_IMAGE" > modal/.builder-image
modal run modal/build_onlyoffice.py \
  --source-ref agent-plugin \
  --release-tag v0.1.0-agent.1 \
  --github-repository <owner>/DocumentServer
```

The script:

1. launches a Modal function inside the pinned builder image
   The builder image can come from `ONLYOFFICE_BUILDER_IMAGE` or `modal/.builder-image`.
2. clones `DocumentServer` at the requested ref and initializes submodules
3. clones the auxiliary upstream repos required by `build_tools`
4. runs the source build with `build_tools`
5. creates a runtime tarball, manifest, and checksum
6. uploads those files to the target GitHub Release
