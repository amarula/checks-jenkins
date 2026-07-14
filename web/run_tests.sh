#!/bin/bash
# sh_test wrapper: receives the rlocationpath of the target binary as $1
# and executes it from the runfiles tree.
set -euo pipefail
exec "${RUNFILES_DIR:-$TEST_SRCDIR}/${1}"
