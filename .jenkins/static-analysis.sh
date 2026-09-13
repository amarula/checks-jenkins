#!/bin/bash
#
# Runs the Java static analysers over the plugin sources and writes their
# reports as XML into $RESULTS_DIR, for the verification pipeline to publish
# with recordIssues.
#
# None of these tools is part of the Gerrit build, so the pinned releases are
# fetched into $TOOLS_DIR.  In CI that directory is inside the workspace, which
# is wiped after every build, so the download repeats each run.
#
# Findings deliberately do not fail this script: the reports are published by
# recordIssues, and none of the analysers is a gate yet.  Run it locally with
#
#   RESULTS_DIR=$PWD/results BAZEL=bazelisk bash .jenkins/static-analysis.sh
#
set -uo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
RESULTS_DIR="${RESULTS_DIR:?RESULTS_DIR must be set}"
TOOLS_DIR="${TOOLS_DIR:-$PLUGIN_DIR/.static-analysis-tools}"
BAZEL="${BAZEL:-bazel}"

PMD_VERSION="${PMD_VERSION:-7.7.0}"
CHECKSTYLE_VERSION="${CHECKSTYLE_VERSION:-10.18.1}"
SPOTBUGS_VERSION="${SPOTBUGS_VERSION:-4.8.6}"

cd "$PLUGIN_DIR" || exit 1
mkdir -p "$RESULTS_DIR" "$TOOLS_DIR"

# fetch <url> <dest> — skips a file already downloaded by an earlier run.
fetch() {
    [ -f "$2" ] && return 0
    curl -fsSL -o "$2" "$1"
}

# --- PMD and CPD, which share one distribution --------------------------

PMD_ZIP="$TOOLS_DIR/pmd.zip"
if fetch "https://github.com/pmd/pmd/releases/download/pmd_releases%2F$PMD_VERSION/pmd-dist-$PMD_VERSION-bin.zip" "$PMD_ZIP"; then
    unzip -oq "$PMD_ZIP" -d "$TOOLS_DIR"
    PMD="$TOOLS_DIR/pmd-bin-$PMD_VERSION/bin/pmd"

    # PMD exits non-zero when it reports violations, which is the normal case
    # here — the exit code is not the signal, the report is.
    "$PMD" check -d src/main/java \
        -R category/java/errorprone.xml,category/java/bestpractices.xml \
        -f xml > "$RESULTS_DIR/pmd.xml" 2>"$TOOLS_DIR/pmd.log" || true

    "$PMD" cpd --minimum-tokens 100 --dir src/main/java --language java \
        --format xml > "$RESULTS_DIR/cpd.xml" 2>"$TOOLS_DIR/cpd.log" || true
else
    echo "static-analysis: pmd download failed, skipping pmd and cpd" >&2
fi

# --- Checkstyle ---------------------------------------------------------

CHECKSTYLE_JAR="$TOOLS_DIR/checkstyle.jar"
if fetch "https://github.com/checkstyle/checkstyle/releases/download/checkstyle-$CHECKSTYLE_VERSION/checkstyle-$CHECKSTYLE_VERSION-all.jar" "$CHECKSTYLE_JAR"; then
    # -o rather than a redirect: Checkstyle prints "Starting audit..." to
    # stdout, which would otherwise end up in the XML.
    java -jar "$CHECKSTYLE_JAR" -c /google_checks.xml -f xml \
        -o "$RESULTS_DIR/checkstyle.xml" src/main/java \
        2>"$TOOLS_DIR/checkstyle.log" || true
else
    echo "static-analysis: checkstyle download failed, skipping it" >&2
fi

# --- SpotBugs -----------------------------------------------------------

SPOTBUGS_TGZ="$TOOLS_DIR/spotbugs.tgz"
if fetch "https://github.com/spotbugs/spotbugs/releases/download/$SPOTBUGS_VERSION/spotbugs-$SPOTBUGS_VERSION.tgz" "$SPOTBUGS_TGZ"; then
    tar -xzf "$SPOTBUGS_TGZ" -C "$TOOLS_DIR"

    # SpotBugs reads bytecode and resolves types against the Gerrit API;
    # without it every Gerrit type is reported missing and most detectors go
    # quiet, so the report would be misleading rather than empty.  The release
    # war for the tag this tree builds against is the cheapest source of those
    # jars — if it cannot be fetched, skip the analyser and say so.
    LIBS_DIR="$TOOLS_DIR/gerrit-libs"
    if [ -z "${GERRIT_VERSION:-}" ]; then
        echo "static-analysis: GERRIT_VERSION unset, cannot fetch the gerrit API jars" >&2
    elif [ ! -d "$LIBS_DIR" ]; then
        if fetch "https://gerrit-releases.storage.googleapis.com/gerrit-$GERRIT_VERSION.war" "$TOOLS_DIR/gerrit.war"; then
            mkdir -p "$LIBS_DIR"
            unzip -joq "$TOOLS_DIR/gerrit.war" 'WEB-INF/lib/*.jar' -d "$LIBS_DIR"
        fi
    fi

    BAZEL_BIN="$("$BAZEL" info bazel-bin 2>/dev/null)"
    PLUGIN_JAR="$BAZEL_BIN/plugins/checks-jenkins/checks-jenkins.jar"

    if [ -d "$LIBS_DIR" ] && [ -f "$PLUGIN_JAR" ]; then
        java -jar "$TOOLS_DIR/spotbugs-$SPOTBUGS_VERSION/lib/spotbugs.jar" -textui \
            -xml:withMessages \
            -output "$RESULTS_DIR/spotbugs.xml" \
            -auxclasspath "$(find "$LIBS_DIR" -name '*.jar' | tr '\n' ':')" \
            "$PLUGIN_JAR" >"$TOOLS_DIR/spotbugs.log" 2>&1 || true
    elif [ ! -f "$PLUGIN_JAR" ]; then
        echo "static-analysis: $PLUGIN_JAR not built, skipping spotbugs" >&2
    else
        echo "static-analysis: no gerrit API jars for the aux classpath, skipping spotbugs" >&2
    fi
else
    echo "static-analysis: spotbugs download failed, skipping it" >&2
fi

ls -l "$RESULTS_DIR"
