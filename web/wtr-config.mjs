/**
 * Wrapper config for @web/test-runner.
 *
 * Imports the Gerrit-provided web-test-runner.config.mjs and adds our custom
 * JUnit reporter.  The path to the Gerrit config must be set in the
 * WTR_GERRIT_CONFIG environment variable — web_test_runner.sh sets it from the
 * Bazel-provided location ($2).
 */

import { pathToFileURL } from 'url';
import { junitReporter } from './junit-reporter.mjs';

const gerritConfigPath = process.env.WTR_GERRIT_CONFIG;
if (!gerritConfigPath) {
  throw new Error('WTR_GERRIT_CONFIG must be set to the Gerrit web-test-runner.config.mjs path');
}

const { default: baseConfig } = await import(pathToFileURL(gerritConfigPath).href);

export default {
  ...baseConfig,
  coverageConfig: {
    ...baseConfig.coverageConfig,
    reporters: [
      ...(baseConfig.coverageConfig?.reporters || ['lcov']),
      'cobertura',
    ],
  },
  reporters: [...(baseConfig.reporters || []), junitReporter()],
};
