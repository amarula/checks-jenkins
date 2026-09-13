#!/bin/bash

set -euo pipefail

# $1 is the web-test-runner binary, $2 the Gerrit-provided config.  We do not
# pass $2 to --config directly: wtr-config.mjs imports it and adds our JUnit
# reporter on top, so the plain Gerrit config stays the source of truth.
export WTR_GERRIT_CONFIG="$2"

args=(
  --config 'plugins/checks-jenkins/web/wtr-config.mjs'
  --dir 'plugins/checks-jenkins/web/_bazel_ts_out_tests'
  --test-files 'plugins/checks-jenkins/web/_bazel_ts_out_tests/*_test.js'
  --ts-config='plugins/checks-jenkins/web/tsconfig.json'
)

# Coverage is opt-in in web-test-runner.  Its report directory is
# WTR_COVERAGE_DIR, which wtr-config.mjs hands to the reporters, so enabling
# it and pointing it somewhere useful are the same decision.
if [[ -n "${WTR_COVERAGE_DIR:-}" ]]; then
  args+=(--coverage)
fi

./$1 "${args[@]}"
