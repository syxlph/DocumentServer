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
2. declares a named Modal Volume for git mirrors and lets Modal create it automatically on first use
3. refreshes cached repo mirrors from that Volume instead of recloning everything from scratch on every ephemeral app run
4. clones `DocumentServer` at the requested ref and initializes required submodules from the cached mirrors
5. clones the auxiliary upstream repos required by `build_tools` from the cached mirrors
6. runs the source build with `build_tools`
7. creates a runtime tarball, manifest, and checksum
8. uploads those files to the target GitHub Release
