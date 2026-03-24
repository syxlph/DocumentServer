ARG BASE_IMAGE=onlyoffice/documentserver:latest
FROM ${BASE_IMAGE}

ARG RELEASE_TAG=unknown
ARG IMMUTABLE_TAG=unknown

LABEL org.opencontainers.image.title="onlyoffice-fork"
LABEL org.opencontainers.image.description="Forked ONLYOFFICE DocumentServer runtime with bundled agent plugin"
LABEL org.opencontainers.image.version="${RELEASE_TAG}"
LABEL org.opencontainers.image.revision="${IMMUTABLE_TAG}"

COPY documentserver/ /var/www/onlyoffice/documentserver/
