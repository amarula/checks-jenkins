Jenkins Checks Configuration
============================

Jenkins servers can be configured for a project by adding a file called
`checks-jenkins.config` to the `refs/meta/config` branch of a project.

File `checks-jenkins.config`
----------------------------

For each Jenkins instance a section with a unique name has to be added.

jenkins.NAME.url
: Base URL of Jenkins including protocol, e.g. https://gerrit-ci.gerritforge.com

jenkins.NAME.user
: Username of the Jenkins user.

jenkins.NAME.token
: API token of the Jenkins user.

Coverage Configuration
----------------------

Code coverage integration can be enabled per Jenkins instance by adding a
`coverage` key to the instance section. When enabled, line-level coverage
annotations appear in the diff view, coverage percentage columns appear in the
file list, and low-coverage warnings are shown in the checks panel.
Requires the Jenkins Code Coverage API plugin to be installed on the Jenkins
server. Defaults to `false`.

jenkins.NAME.coverage
: When set to `true`, enables the code coverage integration for this Jenkins
  instance.
