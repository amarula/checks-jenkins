load("//tools/bzl:plugin.bzl", "gerrit_plugin")
load("//tools/js:eslint.bzl", "plugin_eslint")
load("//tools/bzl:js.bzl", "gerrit_js_bundle", "web_test_runner")
load("@npm//@bazel/typescript:index.bzl", "ts_config", "ts_project")

package_group(
    name = "visibility",
    packages = ["//plugins/checks-jenkins/..."],
)

package(default_visibility = [":visibility"])

ts_config(
    name = "tsconfig",
    src = "tsconfig.json",
    deps = [
        "//plugins:tsconfig-plugins-base.json",
    ],
)

ts_project(
    name = "checks-jenkins-ts",
    srcs = glob(
        ["**/*.ts"],
        exclude = ["**/*test*"],
    ),
    incremental = True,
    out_dir = "_bazel_ts_out",
    tsc = "//tools/node_tools:tsc-bin",
    tsconfig = ":tsconfig",
    deps = [
        "@plugins_npm//@gerritcodereview/typescript-api",
        "@plugins_npm//lit",
    ],
)

gerrit_js_bundle(
    name = "checks-jenkins",
    srcs = [":checks-jenkins-ts"],
    entry_point = "_bazel_ts_out/plugin.js",
)

ts_project(
    name = "checks-jenkins-ts-tests",
    srcs = glob(["**/*.ts"]),
    incremental = True,
    out_dir = "_bazel_ts_out_tests",
    tsc = "//tools/node_tools:tsc-bin",
    tsconfig = ":tsconfig",
    deps = [
        "@plugins_npm//:node_modules",
        "@ui_dev_npm//:node_modules",
        "@plugins_npm//@gerritcodereview/typescript-api",
        "@plugins_npm//lit",
    ],
)

web_test_runner(
    name = "web_test_runner",
    srcs = ["web_test_runner.sh"],
    data = [
        ":checks-jenkins-ts-tests",
        ":tsconfig",
        "@plugins_npm//:node_modules",
        "@ui_dev_npm//:node_modules",
    ],
)

# Creates lint_test and lint_bin rules.
plugin_eslint()

# ── Test wrappers ────────────────────────────────────────────────────
#
# Gerrit's web_test_runner macro and plugin_eslint() produce sh_binary
# targets, which bazel test does not discover.  We wrap each one in a
# thin sh_test so that bazel test //plugins/checks-jenkins/... picks
# them up.  run_tests.sh resolves the binary via its rlocationpath in
# the Bazel runfiles tree and delegates to it.
#
# $(rlocationpath) includes the workspace name (_main) prefix so the
# path resolves correctly at test time; $(rootpath) strips it.

sh_test(
    name = "web_tests",
    srcs = ["run_tests.sh"],
    args = ["$(rlocationpath :web_test_runner)"],
    data = [":web_test_runner"],
)

sh_test(
    name = "web_lint",
    srcs = ["run_tests.sh"],
    args = ["$(rlocationpath :lint_bin)"],
    data = [":lint_bin"],
)
