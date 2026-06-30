/**
 * @license
 * Copyright (C) 2024 The Android Open Source Project
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
import './test/test-setup';
import {assert} from '@open-wc/testing';
import {
  ChecksFetcher,
  Config,
  JenkinsCheckRun,
} from './fetcher';
import {
  Category,
  RunStatus,
  TagColor,
} from '@gerritcodereview/typescript-api/checks';
import {PluginApi} from '@gerritcodereview/typescript-api/plugin';

function makeFetcher(): ChecksFetcher {
  return new ChecksFetcher({
    getPluginName: () => 'checks-jenkins',
    restApi: () => ({
      post: () => Promise.resolve(),
    }),
  } as unknown as PluginApi);
}

function makeTool(overrides: Partial<{
  errorSize: number; highSize: number; normalSize: number; lowSize: number;
  size: number;
}> = {}) {
  return {
    id: 'tool1',
    name: 'Test Tool',
    size: 0,
    latestUrl: 'http://jenkins/tool1',
    errorSize: 0,
    highSize: 0,
    lowSize: 0,
    normalSize: 0,
    ...overrides,
  };
}

suite('ChecksFetcher.warningNgGetCategory', () => {
  let fetcher: ChecksFetcher;

  setup(() => {
    fetcher = makeFetcher();
  });

  test('returns ERROR when size >= errorSize', () => {
    const tool = makeTool({errorSize: 10, size: 10});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.ERROR);
  });

  test('returns WARNING when size >= highSize but below errorSize', () => {
    const tool = makeTool({errorSize: 20, highSize: 10, size: 10});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.WARNING);
  });

  test('returns INFO when size >= normalSize but below highSize', () => {
    const tool = makeTool({highSize: 20, normalSize: 10, size: 10});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.INFO);
  });

  test('returns INFO when size >= lowSize but below normalSize', () => {
    const tool = makeTool({normalSize: 20, lowSize: 10, size: 10});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.INFO);
  });

  test('returns SUCCESS when size is below all thresholds', () => {
    const tool = makeTool({errorSize: 100, highSize: 50, size: 5});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.SUCCESS);
  });

  test('returns SUCCESS when thresholds are zero', () => {
    const tool = makeTool({size: 5});
    assert.equal((fetcher as any).warningNgGetCategory(tool), Category.SUCCESS);
  });
});

suite('ChecksFetcher.warningNgGetTagColor', () => {
  let fetcher: ChecksFetcher;

  setup(() => {
    fetcher = makeFetcher();
  });

  test('returns PURPLE for ERROR severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'ERROR'}),
      TagColor.PURPLE
    );
  });

  test('returns PURPLE for TOTAL_ERROR severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'TOTAL_ERROR'}),
      TagColor.PURPLE
    );
  });

  test('returns PURPLE for NEW_ERROR severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'NEW_ERROR'}),
      TagColor.PURPLE
    );
  });

  test('returns PURPLE for DELTA_ERROR severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'DELTA_ERROR'}),
      TagColor.PURPLE
    );
  });

  test('returns BROWN for HIGH severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'HIGH'}),
      TagColor.BROWN
    );
  });

  test('returns BROWN for TOTAL_HIGH severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'TOTAL_HIGH'}),
      TagColor.BROWN
    );
  });

  test('returns YELLOW for NORMAL severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'NORMAL'}),
      TagColor.YELLOW
    );
  });

  test('returns YELLOW for DELTA_NORMAL severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'DELTA_NORMAL'}),
      TagColor.YELLOW
    );
  });

  test('returns PINK for LOW severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'LOW'}),
      TagColor.PINK
    );
  });

  test('returns PINK for NEW_LOW severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'NEW_LOW'}),
      TagColor.PINK
    );
  });

  test('returns GRAY for unknown severity', () => {
    assert.equal(
      (fetcher as any).warningNgGetTagColor({severity: 'UNKNOWN'}),
      TagColor.GRAY
    );
  });
});

suite('ChecksFetcher.convert', () => {
  let fetcher: ChecksFetcher;

  setup(() => {
    fetcher = makeFetcher();
  });

  test('converts JenkinsCheckRun to CheckRun with all fields', () => {
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1,
      change: 123,
      checkDescription: 'Test check',
      checkLink: 'http://jenkins/check/1',
      checkName: 'Code Coverage',
      externalId: 'ext-1',
      finishedTimestamp: '2024-06-15T10:30:00Z',
      labelName: 'Verified',
      patchset: 5,
      results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:05:00Z',
      status: RunStatus.COMPLETED,
      statusDescription: 'All good',
      statusLink: 'http://jenkins/status/1',
      actions: [],
    };
    const config: Config = {
      name: 'my-jenkins',
      url: 'http://jenkins',
      user: 'admin',
    };

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.equal(result.attempt, 1);
    assert.equal(result.change, 123);
    assert.equal(result.checkDescription, 'Test check');
    assert.equal(result.checkLink, 'http://jenkins/check/1');
    assert.equal(result.checkName, 'Code Coverage');
    assert.equal(result.externalId, 'ext-1');
    assert.equal(result.labelName, 'Verified');
    assert.equal(result.patchset, 5);
    assert.equal(result.status, RunStatus.COMPLETED);
    assert.equal(result.statusDescription, 'All good');
    assert.equal(result.statusLink, 'http://jenkins/status/1');
    assert.instanceOf(result.finishedTimestamp, Date);
    assert.instanceOf(result.scheduledTimestamp, Date);
    assert.instanceOf(result.startedTimestamp, Date);
    assert.deepEqual(result.results, []);
    assert.deepEqual(result.actions, []);
  });

  test('converts actions with rerun callback', () => {
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: '', externalId: '', finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun',
        tooltip: 'Trigger rerun',
        primary: true,
        summary: false,
        disabled: false,
        method: 'POST',
        data: '',
        url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].name, 'Rerun');
    assert.equal(result.actions[0].tooltip, 'Trigger rerun');
    assert.isTrue(result.actions[0].primary);
    assert.isFalse(result.actions[0].summary);
    assert.isFalse(result.actions[0].disabled);
  });

  test('converts timestamps to Date objects', () => {
    const ts = '2024-06-15T10:30:00Z';
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: '', externalId: '', finishedTimestamp: ts,
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: ts,
      startedTimestamp: ts,
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.equal(result.finishedTimestamp.getTime(), new Date(ts).getTime());
    assert.equal(result.startedTimestamp.getTime(), new Date(ts).getTime());
    assert.equal(result.scheduledTimestamp.getTime(), new Date(ts).getTime());
  });
});
