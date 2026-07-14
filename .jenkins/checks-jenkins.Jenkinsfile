#!groovy
@Library('ci_scripts')
@Library('repo_jenkins_lib')
import com.amarula.build.Verification

node('docker-build') {
    def repoUrl = 'https://gerrithub.io/a/amarula/checks-jenkins'
    def credentials = 'gerrithub'
    env.JENKINS_GERRIT_REST_API_CREDENTIAL_ID = 'gerrithub'
    env.GERRIT_USER_NAME = 'amarula-git'
    env.GERRIT_MESSAGE_ON_FAIL = '1'
    def ver = new Verification(this, env, credentials)

    final def dockerImage = 'gerrit-plugin-builder:1.0'
    final def options = ['dockerImage': dockerImage, branch: 'master', 'history': true,
        intermediateDocker: true, proxyCache: true, gerritRemoteUrl: 'https://gerrithub.io']

    final def GERRIT_TAG = 'v3.14.0'
    final def GERRIT_REPO = 'https://gerrit.googlesource.com/gerrit'

    try {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            ver.build(repoUrl, [
                'Setup': {
                    sh """#!/bin/bash -el
                        # Isolate the plugin source that Jenkins checked out,
                        # clone a shallow copy of Gerrit, then symlink the
                        # plugin back to plugins/checks-jenkins.
                        if [ ! -d plugin-source ]; then
                            mkdir plugin-source
                            shopt -s dotglob nullglob
                            for item in * .*; do
                                case "\${item}" in plugin-source|.|..) continue ;; esac
                                mv "\${item}" plugin-source/
                            done
                            shopt -u dotglob nullglob
                        fi

                        if [ ! -f WORKSPACE.bzlmod ]; then
                            git clone --depth 1 --branch "${GERRIT_TAG}" \
                                "${GERRIT_REPO}" /tmp/gerrit-clone

                            shopt -s dotglob nullglob
                            for item in /tmp/gerrit-clone/* /tmp/gerrit-clone/.*; do
                                case "\${item}" in */.|*/..) continue ;; esac
                                mv "\${item}" "\${WORKSPACE}/"
                            done
                            shopt -u dotglob nullglob

                            rmdir /tmp/gerrit-clone
                        fi

                        mkdir -p plugins
                        if [ ! -e plugins/checks-jenkins ]; then
                            ln -s "\${WORKSPACE}/plugin-source" plugins/checks-jenkins
                        fi
                    """
                },

                'Build': {
                    sh """#!/bin/bash -el
                        JOBS="\${BAZEL_JOBS:-\$(nproc)}"
                        bazel build \
                            --jobs="\${JOBS}" \
                            //plugins/checks-jenkins/... \
                            //plugins/checks-jenkins/web:...
                    """
                },

                'Test': {
                    sh """#!/bin/bash -el
                        JOBS="\${BAZEL_JOBS:-\$(nproc)}"
                        bazel test \
                            --jobs="\${JOBS}" \
                            --test_output=errors \
                            --flaky_test_attempts=2 \
                            //plugins/checks-jenkins/... \
                            //plugins/checks-jenkins/web:...
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
