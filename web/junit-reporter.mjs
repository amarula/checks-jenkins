/**
 * Custom @web/test-runner reporter that writes JUnit XML.
 *
 * The path to the output file is read from the WTR_JUNIT_OUTPUT environment
 * variable.  The module is referenced from wtr-config.mjs, which merges it into
 * the Gerrit-provided web-test-runner config.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Walk a TestSuiteResult tree, collecting test cases (leaf nodes). */
function collectTestCases(suite, cases = []) {
  if (suite.tests) {
    for (const t of suite.tests) {
      cases.push({ suite: suite.name, ...t });
    }
  }
  if (suite.suites) {
    for (const s of suite.suites) {
      collectTestCases(s, cases);
    }
  }
  return cases;
}

function toJUnitXml(sessions) {
  const cases = [];
  for (const session of sessions) {
    if (session.testResults) {
      collectTestCases(session.testResults, cases);
    }
  }

  let total = 0, passed = 0, failed = 0, skipped = 0;
  let testCasesXml = '';

  for (const tc of cases) {
    total++;
    const name = esc(tc.name);
    const classname = esc(tc.suite || 'unknown');
    const time = tc.duration != null ? (tc.duration / 1000).toFixed(3) : '0';

    if (tc.skipped) {
      skipped++;
      testCasesXml += `    <testcase name="${name}" classname="${classname}" time="${time}"><skipped/></testcase>\n`;
    } else if (!tc.passed) {
      failed++;
      const errMsg = tc.error ? esc(tc.error.message || String(tc.error)) : '';
      testCasesXml += `    <testcase name="${name}" classname="${classname}" time="${time}">\n`;
      testCasesXml += `      <failure message="${errMsg}">${errMsg}</failure>\n`;
      testCasesXml += `    </testcase>\n`;
    } else {
      passed++;
      testCasesXml += `    <testcase name="${name}" classname="${classname}" time="${time}"/>\n`;
    }
  }

  const totalTime = cases.reduce((s, c) => s + (c.duration || 0), 0) / 1000;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="Web Tests" tests="${total}" failures="${failed}" errors="0" skipped="${skipped}" time="${totalTime.toFixed(3)}">`,
    testCasesXml,
    '</testsuite>',
  ].join('\n');
}

export function junitReporter() {
  return {
    name: 'junit-reporter',

    onTestRunFinished({ testRun, sessions }) {
      const xml = toJUnitXml(sessions);
      const outPath = process.env.WTR_JUNIT_OUTPUT;
      if (outPath) {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, xml, 'utf-8');
      }
    },
  };
}
