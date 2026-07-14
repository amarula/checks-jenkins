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
#
# Google Chrome is installed first because its .deb declares all the
# graphical runtime libraries (libasound, libatk, libcups, libdrm,
# libgbm, libgtk-3, libnss, libxkbcommon, etc.) as dependencies, so
# they are pulled in automatically.  This avoids hand-maintaining the
# package names which differ across Ubuntu releases.
#
# curl and ca-certificates are installed in a separate step because the
# base Ubuntu image does not include curl, and we need it to download
# the Chrome .deb.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /tmp/google-chrome.deb \
      https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/google-chrome.deb \
    && rm -f /tmp/google-chrome.deb \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk-headless \
    build-essential \
    curl \
    git \
    gnupg \
    python3 \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 22 (required by Gerrit polygerrit-ui / ts_project) ────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Bazelisk (picks up .bazelversion automatically) ────────────────
RUN curl -fsSLo /usr/local/bin/bazel https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64 \
    && chmod +x /usr/local/bin/bazel

# ── Chrome launcher shim (Bazel web_test_runner expects "chromium" on PATH) ──
RUN echo '#!/bin/sh\nexec google-chrome-stable --no-sandbox --disable-gpu --headless=new "$@"' \
      > /usr/local/bin/chromium \
    && chmod +x /usr/local/bin/chromium

ENV CHROME_BIN=/usr/bin/google-chrome-stable \
    CHROMIUM_BIN=/usr/bin/google-chrome-stable \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Bazel cache in a volume-friendly location ──────────────────────
ENV BAZEL_CACHE=/root/.cache/bazel
RUN mkdir -p "$BAZEL_CACHE"

WORKDIR /workspace
