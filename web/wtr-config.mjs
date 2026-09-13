/**
 * Wrapper config for @web/test-runner.
 *
 * Imports the Gerrit-provided web-test-runner.config.mjs and adds our custom
 * JUnit reporter.  The path to the Gerrit config must be set in the
 * WTR_GERRIT_CONFIG environment variable — web_test_runner.sh sets it from the
 * Bazel-provided location ($2).
 *
 * Coverage is opted into with --coverage, which web_test_runner.sh adds only
 * when WTR_COVERAGE_DIR is set.  Its reports then go to that directory rather
 * than to web-test-runner's default one, which under bazel run sits inside the
 * runfiles tree and would never reach the workspace.
 */

import { pathToFileURL } from 'url';
import { junitReporter } from './junit-reporter.mjs';

const gerritConfigPath = process.env.WTR_GERRIT_CONFIG;
if (!gerritConfigPath) {
  throw new Error('WTR_GERRIT_CONFIG must be set to the Gerrit web-test-runner.config.mjs path');
}

const { default: baseConfig } = await import(pathToFileURL(gerritConfigPath).href);

const coverageDir = process.env.WTR_COVERAGE_DIR;

export default {
  ...baseConfig,
  coverageConfig: {
    ...baseConfig.coverageConfig,
    ...(coverageDir ? { reportDir: coverageDir } : {}),
    // Everything the runner loads is instrumented, dependencies included, so
    // without this the report is mostly chai and mocha.  The tests are left
    // out too: the number should describe the plugin's sources.
    exclude: [
      ...(baseConfig.coverageConfig?.exclude || ['**/node_modules/**']),
      '**/*_test.js',
    ],
    // lcov is web-test-runner's default and is what the pipeline publishes.
    // Cobertura is deliberately not requested: v8-to-istanbul emits one
    // <method> per function, and colliding function names inside a class make
    // the report unparseable for consumers that build a class/method tree.
  },
  reporters: [...(baseConfig.reporters || []), junitReporter()],
};
