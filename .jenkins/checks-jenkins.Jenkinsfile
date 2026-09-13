#!groovy
@Library('ci_scripts')
@Library('repo_jenkins_lib')
import com.amarula.build.Verification

node('android-build') {
    def repoUrl = 'https://gerrithub.io/a/amarula/checks-jenkins'
    def credentials = 'gerrithub'
    env.JENKINS_GERRIT_REST_API_CREDENTIAL_ID = 'gerrithub'
    env.GERRIT_USER_NAME = 'amarula-git'
    env.GERRIT_MESSAGE_ON_FAIL = '1'
    def ver = new Verification(this, env, credentials)

    final def dockerImage = 'gerrit-plugin-builder:1.0'
    final def options = ['dockerImage': dockerImage, branch: 'master', 'history': true,
        intermediateDocker: false, proxyCache: false, gerritRemoteUrl: 'https://gerrithub.io']

    final def GERRIT_TAG = 'v3.14.0'
    final def GERRIT_REPO = 'https://gerrit.googlesource.com/gerrit'

    // Where the verification stages drop their JUnit reports.  Written inside
    // the container, read back by the junit step below: the workspace is
    // mounted at the same path on the host, so the file the stages create is
    // the file Jenkins publishes.  Kept as a literal string so that the shell
    // — not Groovy — expands WORKSPACE.
    final def RESULTS_DIR = '${WORKSPACE}/results'

    try {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            ver.build(repoUrl, [
                'Setup': {
                    sh """#!/bin/bash -el
                        # Jenkins (via the Verification class) checks the plugin
                        # out into a subdirectory of WORKSPACE named after the
                        # repo — that is PWD.  We must:
                        #   1. Move the plugin source aside into plugin-source/.
                        #   2. Clone Gerrit into WORKSPACE (the *parent* of PWD).
                        #   3. Symlink plugin-source/ → WORKSPACE/plugins/checks-jenkins
                        #      so Bazel finds //plugins/checks-jenkins.
                        if [ ! -d plugin-source ]; then
                            mkdir plugin-source
                            shopt -s dotglob nullglob
                            for item in * .*; do
                                case "\${item}" in plugin-source|.|..) continue ;; esac
                                if [ -e "\${item}" ]; then
                                    mv "\${item}" plugin-source/
                                fi
                            done
                            shopt -u dotglob nullglob
                        fi

                        if [ ! -f "\${WORKSPACE}/WORKSPACE.bzlmod" ]; then
                            git clone --depth 1 --branch "${GERRIT_TAG}" \
                                --recurse-submodules --shallow-submodules \
                                "${GERRIT_REPO}" /tmp/gerrit-clone

                            shopt -s dotglob nullglob
                            for item in /tmp/gerrit-clone/* /tmp/gerrit-clone/.*; do
                                case "\${item}" in */.|*/..) continue ;; esac
                                if [ -e "\${item}" ]; then
                                    mv "\${item}" "\${WORKSPACE}/"
                                fi
                            done
                            shopt -u dotglob nullglob

                            rmdir /tmp/gerrit-clone
                        fi

                        # Symlink into Gerrit's existing plugins/ directory at
                        # the workspace root — Bazel resolves //plugins/... from
                        # WORKSPACE, not from PWD.
                        ln -sfn "\${PWD}/plugin-source" "\${WORKSPACE}/plugins/checks-jenkins"
                    """
                },

                'Build': {
                    sh """#!/bin/bash -el
                        JOBS="\${BAZEL_JOBS:-\$(nproc)}"
                        bazel build \
                            --jobs="\${JOBS}" \
                            //plugins/checks-jenkins/...
                    """
                },

                'Lint': {
                    sh """#!/bin/bash -el
                        mkdir -p "${RESULTS_DIR}"

                        # lint_test is the eslint gate plugin_eslint() declares
                        # in web/BUILD.  Bazel writes the JUnit XML on its own,
                        # at bazel-testlogs/<package>/<target>/test.xml, whether
                        # the test passes or fails.
                        #
                        # That path is a symlink into the container's output
                        # base, which does not resolve on the host, so copy the
                        # report out as a real file — the same reason the Build
                        # stage copies the jar with cp -L rather than archiving
                        # the symlink.
                        #
                        # The failure is held back until after the copy so a
                        # lint error still produces a report; it is then
                        # re-raised to fail the stage, as it does locally.
                        bazel test //plugins/checks-jenkins/web:lint_test
                        if [ "$?" -eq 0 ]; then
                            cp -L "\${WORKSPACE}/bazel-testlogs/plugins/checks-jenkins/web/lint_test/test.xml" \
                                "${RESULTS_DIR}/lint.xml"
                        fi
                    """
                },

                'Test': {
                    sh """#!/bin/bash -el
                        mkdir -p "${RESULTS_DIR}"

                        # Read by web/junit-reporter.mjs, which
                        # web/wtr-config.mjs merges into the Gerrit config.
                        # The report is written on test-run-finished, so it
                        # survives a failing test run.
                        export WTR_JUNIT_OUTPUT="${RESULTS_DIR}/web-tests.xml"

                        # web_test_runner is sh_binary targets
                        # (not sh_test), so bazel test doesn't discover them.
                        # Run them directly via bazel run.
                        bazel run //plugins/checks-jenkins/web:web_test_runner
                    """
                }
            ], options)
        }

        // Publish both reports after the stages, not inside them, so a stage
        // that fails still gets its results reported: each report is written
        // before its command exits.  allowEmptyResults keeps a build that
        // never reached a report — a failure in Setup — from failing here on
        // top of its real error.
        junit testResults: 'results/*.xml', allowEmptyResults: true

        if (currentBuild.result == 'FAILURE' || currentBuild.result == 'UNSTABLE') {
            explainError()
        }
    } finally {
        cleanWs()
    }
}
