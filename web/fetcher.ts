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
import { cacheService } from './request-cache-service';
import { RequestKey } from './index-db';

export declare interface Config {
  name: string;
  url: string;
  user: string;
}

export interface ProxyInput {
  jenkinsname: string;
  urlpath: string;
  method: string;
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

interface ErrorResponse {
  _class: string;
  explanation?: string;
}

export class ChecksFetcher implements ChecksProvider {
  private plugin: PluginApi;

  configs: Config[] | null;

  constructor(pluginApi: PluginApi) {
    this.plugin = pluginApi;
    this.configs = null;
  }

  private async toJson(response: Response) {
    try {
      if (response.status != undefined) {
        return await response.json();
      } else {
        const val: string = response.toString();
        return JSON.parse(val);
      }
    } catch {
        return null;
    }
  }

  async fetch(changeData: ChangeData) {
    await this.fetchConfig(changeData)
      .then(result => {
        this.configs = result;
      })
      .catch(reason => {
        throw reason;
      });

    if (this.configs === null || this.configs.length === 0) {
      return {
        responseCode: ResponseCode.OK,
        runs: [],
      };
    }
    const checkRuns: CheckRun[] = [];
    for (const jenkins of this.configs) {
      const checks_url = `${jenkins.url}/gerrit-checks/runs?change=${changeData.changeNumber}&patchset=${changeData.patchsetNumber}`;
      const response = await (async () => {
        try {
          return await this.fetchFromJenkins(jenkins, changeData.repo, checks_url, "GET");
        } catch (e) {
          return null;
        }
      })();
      if (response == null || (response.status != undefined && response.status === 403)) {
        // Give the user a LOGIN button that will open a new tab where they can log into Jenkins
        return {
          responseCode: ResponseCode.NOT_LOGGED_IN,
          loginCallback: () => window.open(jenkins.url),
        };
      }
      const data = await this.toJson(response);
      if (data == null) {
        continue;
      }
      if (!data?.runs || !Array.isArray(data.runs)) {
        continue;
      }
      const runEntries = Object.entries(data.runs);
      const totalRuns: number = runEntries.length;
      if (totalRuns == 0) {
        continue;
      }
      const key: RequestKey = [jenkins.name, changeData.changeNumber, changeData.patchsetNumber, totalRuns]

      for (const run of data.runs) {
        if (run.status === RunStatus.COMPLETED) {
          if (!run.results) {
            run.results = [];
          }
          const errorResult: boolean = run.results.find((result: CheckResult) => result.category === Category.ERROR);
          if (errorResult) {
            const errorMessage = await this.explainBuildFailure(jenkins, changeData, run.statusLink);
            if (errorMessage) {
              const lines = errorMessage.split('\n');
              const parsedSummary = lines[0].trim();
              const detailedMessage = lines.slice(1).join('\n').trim();
              const markdownMessage = detailedMessage
                ? `\`\`\`text\n${detailedMessage}\n\`\`\``
                : 'No additional details provided.';

              if (!run.results) {
                run.results = [];
              }

              run.results.push({
                category: Category.ERROR,
                summary: parsedSummary,
                message: markdownMessage
              });
            }
          }
        }
      }

      const cachedData: CheckRun[] = await cacheService.get(key);
      if (cachedData === null || cachedData === undefined || cachedData.length == 0) {
        let warningsData: CheckRun[] = [];
        let hasData: Boolean = false;
        for (const run of data.runs) {
          if (run.status === RunStatus.COMPLETED) {
            const runWarningResults = await this.buildWarnings(jenkins, changeData, run.statusLink, run.attempt);
            if (runWarningResults.length) {
              warningsData.push(...runWarningResults);
              hasData = true;
            }
            const runTestResults = await this.buildTestResults(jenkins, changeData, run.statusLink, run.attempt);
            if (runTestResults.length) {
              warningsData.push(...runTestResults);
              hasData = true;
            }
          }
        }
        if (hasData === true) {
          await cacheService.put(key, warningsData.slice());
          checkRuns.push(...warningsData.slice());
        }
        warningsData = [];
      } else {
        checkRuns.push(...cachedData);
      }

      for (const run of data.runs) {
        checkRuns.push(this.convert(jenkins, changeData.repo, run));
      }
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

  async buildWarnings(jenkins: Config, changeData: ChangeData, statusLink: string, attempt: number) {

    const toolsResult = await (async () => {
      try {
        return await this.fetchFromJenkins(jenkins, changeData.repo, `${statusLink}warnings-ng/api/json`, "GET");
      } catch (e) {
        return null;
      }
    })();

    if (toolsResult === null || (toolsResult.ok != undefined && !toolsResult.ok)) {
      return [];
    }

    const toolsInfo: AnalysisResponse = await this.toJson(toolsResult);
    if (toolsInfo === null) {
      return [];
    }
    const checkRuns: CheckRun[] = [];

    for (const tool of toolsInfo.tools) {
      const toolsResult = await (async() => {
        try {
          return await this.fetchFromJenkins(jenkins, changeData.repo,
            `${statusLink}${tool.id}/all/api/json?tree=issues[severity,message,toString,fileName,lineStart,columnStart,lineEnd,columnEnd]`, "GET");
        } catch(e) {
          return null;
        }
      })();

      if (toolsResult === null || (toolsResult.ok != undefined && !toolsResult.ok)) {
        continue;
      }

      const warnings: AnalysisReport = await this.toJson(toolsResult);
      if (warnings === null) {
        continue;
      }
      let results: CheckResult[] = [];

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

      checkRuns.push({
        change: changeData.changeNumber,
        patchset: changeData.patchsetNumber,
        checkName: `${tool.name}`,
        status: RunStatus.COMPLETED,
        statusLink: `${tool.latestUrl}`,
        attempt: attempt,
        actions: [],
        results: results.slice(),
      })

      results = [];
    }

    return checkRuns;
  }

  async buildTestResults(jenkins: Config, changeData: ChangeData, statusLink: string, attempt: number) {
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

    const testResult = await (async () => {
      try {
        return await this.fetchFromJenkins(jenkins, changeData.repo,
          `${statusLink}testReport/api/json?tree=suites[cases[className,name,status,errorDetails]]`, "GET");
      } catch (e) {
        return null;
      }
    })();

    if (testResult === null || (testResult.ok != undefined && !testResult.ok)) {
      return [];
    }

    const testReport: JunitResult = await this.toJson(testResult);
    if (testReport === null) {
      return [];
    }
    const results: CheckResult[] = [];

    const failedTests: CheckResult[] = testReport.suites.flatMap(suite =>
      suite.cases
        .filter(test => test.status === 'FAILED')
        .map(test => ({
          show_on_unchanged_lines: false,
          category: Category.ERROR,
          message: test.errorDetails ?? undefined,
          summary: `${test.className}.${test.name}`
        }))
    );

    if (!failedTests.length) {
      return [];
    }

    results.push(...failedTests);
    const checkRuns: CheckRun[] = [];
    checkRuns.push({
      change: changeData.changeNumber,
      patchset: changeData.patchsetNumber,
      checkName: "JUnit",
      status: RunStatus.COMPLETED,
      statusLink: `${statusLink}testReport`,
      attempt: attempt,
      actions: [],
      results: results,
    })

    return checkRuns;
  }

  async explainBuildFailure(jenkins: Config, changeData: ChangeData, statusLink: string) {
    const errorResult = await (async () => {
      try {
        return await this.fetchFromJenkins(jenkins, changeData.repo, `${statusLink}error-explanation/api/json`, "GET");
      } catch (e) {
        return null;
      }
    })();

    if (errorResult === null || (errorResult.ok != undefined && !errorResult.ok)) {
      return null;
    }

    const errorInfo: ErrorResponse = await this.toJson(errorResult);
    if (errorInfo === null) {
      return null;
    }
    return errorInfo.explanation;
  }

  fetchConfig(changeData: ChangeData): Promise<Config[]> {
    const pluginName = encodeURIComponent(this.plugin.getPluginName());
    return this.plugin
      .restApi()
      .get<Config[]>(
        `/projects/${encodeURIComponent(changeData.repo)}/${pluginName}~config`
      );
  }

  convert(jenkins: Config, repo: string, run: JenkinsCheckRun): CheckRun {
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
        callback: () => this.rerun(jenkins, repo, action.url + "/index"),
      });
    }
    convertedRun.actions = actions;
    return convertedRun;
  }

  private fetchFromJenkins(jenkins: Config, repo: string, url: string, method: string): Promise<Response> {
    if (!jenkins.user) {
      const options: RequestInit = { credentials: 'include' };
      return fetch(url, options);
    }

    const dst = new URL(url);
    const extractPath = `${dst.pathname.substring(1)}${dst.search}`;
    const pluginName = encodeURIComponent(this.plugin.getPluginName());
    const payload: ProxyInput = {
      jenkinsname: jenkins.name,
      urlpath: encodeURI(extractPath),
      method: method,
    };
    return this.plugin.restApi().post(
      `/projects/${encodeURIComponent(repo)}/${pluginName}~proxy-trigger`,
      payload
    );
  }

  private rerun(jenkins: Config, repo: string, url: string): Promise<ActionResult> {
    return this.fetchFromJenkins(jenkins, repo, url, "POST")
      .then(_ => {
        return {
          message: 'Run triggered.',
          shouldReload: true,
        };
      })
      .catch(e => {
        const msg: string = e.message;
        /* Redirect that is not to be considered as error */
        if (msg.includes('302')) {
          return {
            message: 'Run triggered.',
            shouldReload: true,
          }
        }
        return { message: `Triggering the run failed: ${e.message}` };
      });
  }
}
