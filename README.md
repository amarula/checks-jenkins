
# checks-jenkins

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Gerrit Plugin](https://img.shields.io/badge/Gerrit-Plugin-blue.svg)](https://www.gerritcodereview.com/)

`checks-jenkins` is a Gerrit plugin that implements the [Gerrit Checks API](https://gerrit-review.googlesource.com/Documentation/pg-plugin-checks-api.html) specifically for **Jenkins CI**.
It surfaces Jenkins build statuses, logs, and test results directly within the Gerrit change screen, providing a seamless CI/CD feedback loop for developers.

## 🚀 Features

- **Real-time Status**: Monitor Jenkins build progress (Pending, Running, Success, Failure) within the Gerrit UI.
- **Detailed Feedback**: Provides links to build artifacts, warnings-ng reports, and test failures.
- **Rerun Triggers**: Directly trigger a Jenkins job rerun from the Gerrit interface.
- **Streamlined Workflow**: Reduces the need to leave Gerrit to check CI status on the Jenkins dashboard.

## 🛠 Prerequisites

- **Gerrit**: 3.x or higher.
- **Jenkins**: A running instance with the [Checks API Plugin](https://plugins.jenkins.io/gerrit-checks-api/) installed.
- **Core Checks Plugin**: This plugin requires the standard Gerrit `checks` plugin to be installed.

## 📦 Installation

1. **Build the plugin**:
    Using Bazel (standard Gerrit plugin build system):
    ```bash
    bazel build plugins/checks-jenkins:checks-jenkins
    ```
2. **Deploy to Gerrit**:
    Copy the .jar file to your Gerrit installation's plugin directory:
    ```bash
    cp bazel-bin/checks-jenkins.jar /path/to/gerrit/plugins/
    ```
3. **Reload the plugin**:
   Waiting automatic reload or:
   ```bash
   ssh -p 29418 user@gerrit-host gerrit plugin reload checks-jenkins
   ```

## ⚙️ Configuration

1. **Generate a Jenkins token**
   ```bash
   [plugin "checks-jenkins"]
       jenkinsUrl = [https://jenkins.example.com/](https://jenkins.example.com/)
       username = gerrit-ci-user
       token = your-jenkins-api-token
   ```

## 🤝 Contributing

Contributions are welcome! This project is maintained by Amarula Solutions.

- Fork the repository.
- Create a feature branch (git checkout -b feature/improvement).
- Commit your changes.
- Push to the branch and open a Pull Request.

## 📄 License

This project is licensed under the Apache License, Version 2.0. See the LICENSE file for more information.
