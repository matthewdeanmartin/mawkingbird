# syntax=docker/dockerfile:1
ARG DISTRO=ubuntu
FROM rust:1.97.1-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3 AS rust-toolchain

FROM ubuntu:24.04@sha256:2198e4c65076e9cb0b3d695219df667c0e3b0072da64ca3c2648aca17dcecaf5 AS ubuntu
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates build-essential pkg-config libwebkit2gtk-4.1-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev file python3 \
    && rm -rf /var/lib/apt/lists/*

FROM fedora:44@sha256:15da97ed9aa94dd3d92c3925eb89520f6c80e07ea7ee24cba848d1f8b6912b3e AS fedora
RUN dnf install -y gcc gcc-c++ make pkgconf-pkg-config webkit2gtk4.1-devel \
    openssl-devel libappindicator-gtk3-devel librsvg2-devel file python3 \
    ca-certificates && dnf clean all

FROM ${DISTRO} AS build
ARG DISTRO
ARG TARGETARCH
ARG BUILD_JOBS=6
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH
ENV CARGO_BUILD_JOBS=${BUILD_JOBS}
COPY --from=rust-toolchain /usr/local/rustup /usr/local/rustup
COPY --from=rust-toolchain /usr/local/cargo /usr/local/cargo
WORKDIR /work
# Fetch only when dependency manifests change. No fake source/placeholder build.
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/
RUN mkdir -p src-tauri/src && printf 'fn main() {}\n' > src-tauri/src/main.rs
RUN --mount=type=cache,id=mawkingbird-${DISTRO}-registry,target=/usr/local/cargo/registry,sharing=locked \
    cargo fetch --locked --manifest-path src-tauri/Cargo.toml
COPY src-tauri/ src-tauri/
COPY scripts/check-unsafe.py scripts/check-unsafe.py
# Supply the actual prebuilt shared Angular frontend as a separate named context.
COPY --from=frontend / /work/.frontend/
RUN test -s .frontend/browser/index.html && test -s .frontend/provenance.json
# Never share compiled GTK/linker objects across distributions or architectures.
# Copy output out of the mount: caches are not part of the resulting image.
RUN --mount=type=cache,id=mawkingbird-${DISTRO}-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=mawkingbird-${DISTRO}-${TARGETARCH}-target,target=/work/src-tauri/target,sharing=locked \
    find src-tauri/src -name '*.rs' -exec touch {} + && touch src-tauri/build.rs && \
    python3 scripts/check-unsafe.py && \
    cargo test --release --locked --manifest-path src-tauri/Cargo.toml && \
    cargo build --release --locked --manifest-path src-tauri/Cargo.toml && \
    mkdir /out && cp src-tauri/target/release/mawkingbird-native /out/ && \
    cp .frontend/provenance.json src-tauri/Cargo.lock /out/ && \
    file /out/mawkingbird-native > /out/binary.txt && \
    ldd /out/mawkingbird-native > /out/linked-libraries.txt && \
    ! grep -q 'not found' /out/linked-libraries.txt
FROM scratch AS artifacts
COPY --from=build /out/ /
