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

                'Test': {
                    sh """#!/bin/bash -el
                        # web_test_runner and lint_test are sh_binary targets
                        # (not sh_test), so bazel test doesn't discover them.
                        # Run them directly via bazel run.
                        bazel run //plugins/checks-jenkins/web:web_test_runner
                        bazel run //plugins/checks-jenkins/web:lint_test
                    """
                }
            ], options)
        }
        if (currentBuild.result == 'FAILURE' || currentBuild.result == 'UNSTABLE') {
            explainError()
        }
    } finally {
        cleanWs()
    }
}
