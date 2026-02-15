/**
 * @license
 * Copyright (C) 2022 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  Action,
  ActionResult,
  ChangeData,
  CheckResult,
  CheckRun,
  ChecksProvider,
  ResponseCode,
  RunStatus,
  Category,
  LinkIcon,
  TagColor,
} from '@gerritcodereview/typescript-api/checks';
import { PluginApi } from '@gerritcodereview/typescript-api/plugin';

export declare interface Config {
  name: string;
  url: string;
  user: string;
  token: string;
}

export declare interface JenkinsCheckRun {
  actions: JenkinsAction[];
  attempt: number;
  change: number;
  checkDescription: string;
  checkLink: string;
  checkName: string;
  externalId: string;
  finishedTimestamp: string;
  labelName: string;
  patchset: number;
  results: CheckResult[];
  scheduledTimestamp: string;
  startedTimestamp: string;
  status: RunStatus;
  statusDesciption: string;
  statusLink: string;
}

export declare interface JenkinsAction {
  data: string;
  disabled: boolean;
  method: string;
  name: string;
  primary: boolean;
  summary: boolean;
  tooltip: string;
  url: string;
}

interface AnalysisTool {
  id: string;
  name: string;
  size: number;
  latestUrl: string;
  errorSize: number;
  highSize: number;
  normalSize: number;
}

interface AnalysisResponse {
  _class: string;
  tools: AnalysisTool[];
}

interface AnalysisIssue {
  fileName: string;
  message: string;
  severity: string;
  toString: string;
  lineStart: number;
  columnStart: number;
  columnEnd: number;
  lineEnd: number;
}

interface AnalysisReport {
  _class: string;
  issues: AnalysisIssue[];
}

export class ChecksFetcher implements ChecksProvider {
  private plugin: PluginApi;

  configs: Config[] | null;

  constructor(pluginApi: PluginApi) {
    this.plugin = pluginApi;
    this.configs = null;
  }

  async fetch(changeData: ChangeData) {
    if (this.configs === null) {
      await this.fetchConfig(changeData)
        .then(result => {
          this.configs = result;
        })
        .catch(reason => {
          throw reason;
        });
    }
    if (this.configs === null) {
      return {
        responseCode: ResponseCode.OK,
        runs: [],
      };
    }
    const checkRuns: CheckRun[] = [];
    for (const jenkins of this.configs) {
      const checks_url = `${jenkins.url}/gerrit-checks/runs?change=${changeData.changeNumber}&patchset=${changeData.patchsetNumber}`;
      const response = await this.fetchFromJenkins(jenkins, checks_url);
      if (response.status === 403) {
        // Give the user a LOGIN button that will open a new tab where they can log into Jenkins
        return {
          responseCode: ResponseCode.NOT_LOGGED_IN,
          loginCallback: () => window.open(jenkins.url),
        };
      }
      const data = await response.json();
      for (const run of data.runs) {
        const warningResults = await this.buildWarnings(jenkins, run.statusLink);
        if (warningResults.length) {
          run.results.push(...warningResults);
        }
        const testResults = await this.buildTestResults(jenkins, run.statusLink);
        if (testResults.length) {
          run.results.push(...testResults);
        }
        checkRuns.push(this.convert(jenkins, run));
      };
    }

    return {
      responseCode: ResponseCode.OK,
      runs: checkRuns,
    };
  }

  private warningNgGetCategory(tool: AnalysisTool): Category {
    if (tool.errorSize && tool.size >= tool.errorSize) {
      return Category.ERROR;
    } else if (tool.highSize && tool.size >= tool.highSize) {
      return Category.WARNING;
    } else if (tool.normalSize && tool.size >= tool.normalSize) {
      return Category.INFO;
    }
    return Category.SUCCESS;
  }

  private warningNgGetTagColor(issue: AnalysisIssue): TagColor {
    if (issue.severity == "TOTAL_ERROR" ||
      issue.severity == "NEW_ERROR" ||
      issue.severity == "DELTA_ERROR") {
      return TagColor.PURPLE;
    } else if (issue.severity == "TOTAL_HIGH" ||
      issue.severity == "NEW_HIGH" ||
      issue.severity == "DELTA_HIGH") {
      return TagColor.BROWN;
    } else if (issue.severity == "TOTAL_NORMAL" ||
      issue.severity == "NEW_NORMAL" ||
      issue.severity == "DELTA_NORMAL") {
      return TagColor.YELLOW;
    } else if (issue.severity == "TOTAL_LOW" ||
      issue.severity == "NEW_LOW" ||
      issue.severity == "DELTA_LOW") {
      return TagColor.PINK;
    }
    return TagColor.GRAY;
  }

  async buildWarnings(jenkins: Config, statusLink: string) {
    const toolsResult = await this.fetchFromJenkins(jenkins, `${statusLink}warnings-ng/api/json`);
    if (!toolsResult.ok) {
      return [];
    }

    const toolsInfo: AnalysisResponse = await toolsResult.json();
    const results: CheckResult[] = [];
    for (const tool of toolsInfo.tools) {
      if (tool.size == 0) {
        continue;
      }

      const toolResult = await this.fetchFromJenkins(jenkins, `${statusLink}${tool.id}/all/api/json?tree=issues[severity,message,toString,fileName,lineStart,columnStart,lineEnd,columnEnd]`);
      if (!toolResult.ok) {
        continue;
      }
      const warnings: AnalysisReport = await toolResult.json();

      for (const issue of warnings.issues) {
        results.push({
          show_on_unchanged_lines: false,
          category: this.warningNgGetCategory(tool),
          summary: issue.message,
          message: issue.toString,
          tags: [{
            name: `${tool.name}`,
            color: this.warningNgGetTagColor(issue),
            tooltip: issue.message
          }],
          links: [{
            url: `${tool.latestUrl}`,
            icon: LinkIcon.EXTERNAL,
            primary: true,
          },],
          codePointers: [{
            path: issue.fileName,
            range: {
              start_line: issue.lineStart,
              start_character: issue.columnStart - 1,
              end_line: issue.lineEnd,
              end_character: issue.columnEnd
            }
          }]
        });
      }
    }

    return results;
  }

  async buildTestResults(jenkins: Config, statusLink: string) {
    interface TestCase {
      className: string;
      errorDetails: string | null;
      name: string;
      status: 'PASSED' | 'FAILED' | 'SKIPPED';
    }

    interface TestSuite {
      cases: TestCase[];
    }

    interface JunitResult {
      _class: string;
      suites: TestSuite[];
    }

    const testResult = await this.fetchFromJenkins(jenkins, `${statusLink}testReport/api/json?tree=suites[cases[className,name,status,errorDetails]]`);
    if (!testResult.ok) {
      return [];
    }
    const testReport: JunitResult = await testResult.json();
    const results: CheckResult[] = [];

    const failedTests: CheckResult[] = testReport.suites.flatMap(suite =>
      suite.cases
        .filter(test => test.status === 'FAILED')
        .map(test => ({
          category: Category.ERROR,
          message: test.errorDetails ?? undefined,
          summary: `${test.className}.${test.name}`
        }))
    );

    results.push(...failedTests);

    return results;
  }

  fetchConfig(changeData: ChangeData): Promise<Config[]> {
    const pluginName = encodeURIComponent(this.plugin.getPluginName());
    return this.plugin
      .restApi()
      .get<Config[]>(
        `/projects/${encodeURIComponent(changeData.repo)}/${pluginName}~config`
      );
  }

  convert(jenkins: Config, run: JenkinsCheckRun): CheckRun {
    const convertedRun: CheckRun = {
      attempt: run.attempt,
      change: run.change,
      checkDescription: run.checkDescription,
      checkLink: run.checkLink,
      checkName: run.checkName,
      externalId: run.externalId,
      finishedTimestamp: new Date(run.finishedTimestamp),
      labelName: run.labelName,
      patchset: run.patchset,
      results: run.results,
      scheduledTimestamp: new Date(run.scheduledTimestamp),
      startedTimestamp: new Date(run.startedTimestamp),
      status: run.status,
      statusDescription: run.statusDesciption,
      statusLink: run.statusLink,
    };
    const actions: Action[] = [];
    for (const action of run.actions) {
      actions.push({
        name: action.name,
        tooltip: action.tooltip,
        primary: action.primary,
        summary: action.summary,
        disabled: action.disabled,
        callback: () => this.rerun(jenkins, action.url),
      });
    }
    convertedRun.actions = actions;
    return convertedRun;
  }

  private fetchFromJenkins(jenkins: Config, url: string): Promise<Response> {
    const PROXY_URL = '/a/plugins/checks-jenkins/proxy-trigger';
    const jenkinsUrl = jenkins.url
    const jenkinsAuth = `${jenkins.user}:${jenkins.token}`

    if (!jenkins.user || !jenkins.token) {
      const options: RequestInit = { credentials: 'include' };
      return fetch(url, options);
    }

    const dst = new URL(url);
    const extractPath = `${dst.pathname.substring(1)}${dst.search}`;

    const options: RequestInit = {
      method: 'POST',
      headers: {
        'X-Jenkins-Server': jenkinsUrl,
        'X-Jenkins-Auth': jenkinsAuth,
        'X-Jenkins-UrlPath': extractPath,
      },
      body: url
    };

    return fetch(PROXY_URL, options);
  }

  private rerun(jenkins: Config, url: string): Promise<ActionResult> {
    return this.fetchFromJenkins(jenkins, url)
      .then(_ => {
        return {
          message: 'Run triggered.',
          shouldReload: true,
        };
      })
      .catch(e => {
        return { message: `Triggering the run failed: ${e.message}` };
      });
  }
}
