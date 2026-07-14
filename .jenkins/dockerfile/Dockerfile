# Build environment for the checks-jenkins Gerrit plugin.
#
# The plugin builds inside the Gerrit source tree using Bazel, so this image
# bundles every toolchain required: Java 17, Bazel 8.6.0, Node.js 22, and
# the Chromium runtime needed for web-test-runner.
#
# Rebuild after toolchain updates:
#   docker build -t gerrit-plugin-builder:latest -f .jenkins/dockerfile/Dockerfile .

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# ── System packages ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Java toolchain
    openjdk-17-jdk-headless \
    # Native build dependencies
    build-essential \
    curl \
    git \
    gnupg \
    python3 \
    python3-distutils \
    unzip \
    zip \
    # Headless Chrome / Chromium for web-test-runner (frontend tests)
    chromium-browser \
    # Libraries that Chromium needs in a headless container
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 22 (required by Gerrit polygerrit-ui / ts_project) ────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Bazelisk (picks up .bazelversion automatically) ────────────────
RUN curl -fsSLo /usr/local/bin/bazel https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64 \
    && chmod +x /usr/local/bin/bazel

# ── Chromium launcher shim (Bazel web_test_runner expects this) ────
RUN echo '#!/bin/sh\nexec chromium-browser --no-sandbox --disable-gpu --headless=new "$@"' \
      > /usr/local/bin/chromium \
    && chmod +x /usr/local/bin/chromium

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROMIUM_BIN=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Bazel cache in a volume-friendly location ──────────────────────
ENV BAZEL_CACHE=/root/.cache/bazel
RUN mkdir -p "$BAZEL_CACHE"

WORKDIR /workspace
