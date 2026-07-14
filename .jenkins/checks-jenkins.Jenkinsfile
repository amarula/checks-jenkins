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
                        echo "==> WORKSPACE=\${WORKSPACE}"
                        echo "==> PWD=\$(pwd)"
                        echo "==> Contents before setup:"
                        ls -la || true
                        echo "==> End of listing"

                        # Isolate the plugin source that Jenkins checked out,
                        # clone a shallow copy of Gerrit, then symlink the
                        # plugin back to plugins/checks-jenkins.
                        if [ ! -d plugin-source ]; then
                            echo "==> Creating plugin-source"
                            mkdir plugin-source
                            shopt -s dotglob nullglob
                            for item in * .*; do
                                case "\${item}" in plugin-source|.|..) continue ;; esac
                                if [ -e "\${item}" ]; then
                                    echo "==> Moving '\${item}' → plugin-source/"
                                    mv "\${item}" plugin-source/
                                fi
                            done
                            shopt -u dotglob nullglob
                            echo "==> plugin-source contents:"
                            ls -la plugin-source/ || true
                        fi

                        if [ ! -f WORKSPACE.bzlmod ]; then
                            echo "==> Cloning Gerrit ${GERRIT_TAG}..."
                            git clone --depth 1 --branch "${GERRIT_TAG}" \
                                "${GERRIT_REPO}" /tmp/gerrit-clone

                            echo "==> Moving Gerrit tree into WORKSPACE"
                            shopt -s dotglob nullglob
                            for item in /tmp/gerrit-clone/* /tmp/gerrit-clone/.*; do
                                case "\${item}" in */.|*/..) continue ;; esac
                                if [ -e "\${item}" ]; then
                                    mv "\${item}" "\${WORKSPACE}/"
                                fi
                            done
                            shopt -u dotglob nullglob

                            rmdir /tmp/gerrit-clone
                            echo "==> WORKSPACE after Gerrit clone:"
                            ls -la "\${WORKSPACE}/" || true
                        fi

                        echo "==> Creating plugins symlink"
                        mkdir -p plugins
                        if [ ! -e plugins/checks-jenkins ]; then
                            ln -s "\${WORKSPACE}/plugin-source" plugins/checks-jenkins
                        fi
                        echo "==> plugins/ contents:"
                        ls -la plugins/ || true
                        echo "==> Setup complete"
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
