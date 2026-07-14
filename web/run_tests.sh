#!/bin/bash
# sh_test wrapper: resolves the web_test_runner binary in the Bazel
# runfiles tree and executes it.  The binary is passed as the first
# argument via $(rootpath) so its runfiles path is unambiguous.
set -euo pipefail
exec "${RUNFILES_DIR:-$TEST_SRCDIR}/${1}"
