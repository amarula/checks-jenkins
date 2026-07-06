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

  test('disables rerun when runKey is in triggeredReruns', () => {
    (fetcher as any).triggeredReruns.set('test-job#1', Date.now());
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: 'Test', externalId: 'test-job#1',
      finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.RUNNING, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun', tooltip: 'Trigger rerun',
        primary: true, summary: false, disabled: false,
        method: 'POST', data: '', url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.isTrue(result.actions[0].disabled);
    assert.equal(result.actions[0].tooltip, 'Run already triggered');
  });

  test('disables rerun on all runs when any run is active', () => {
    (fetcher as any).triggeredReruns.set('other-job#2', Date.now());
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: 'Test', externalId: 'test-job#1',
      finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun', tooltip: 'Trigger rerun',
        primary: true, summary: false, disabled: false,
        method: 'POST', data: '', url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.isTrue(result.actions[0].disabled);
    assert.equal(result.actions[0].tooltip, 'A pipeline job is currently running');
  });

  test('does not disable rerun when triggeredReruns is empty', () => {
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: 'Test', externalId: 'test-job#1',
      finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun', tooltip: 'Trigger rerun',
        primary: true, summary: false, disabled: false,
        method: 'POST', data: '', url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.isFalse(result.actions[0].disabled);
    assert.equal(result.actions[0].tooltip, 'Trigger rerun');
  });

  test('preserves Jenkins-side disabled flag', () => {
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: 'Test', externalId: 'test-job#1',
      finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun', tooltip: 'Trigger rerun',
        primary: true, summary: false, disabled: true,
        method: 'POST', data: '', url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.isTrue(result.actions[0].disabled);
  });

  test('stale triggeredReruns entry still disables button (TTL cleanup in fetch)', () => {
    // A key older than TTL will still disable convert — the TTL cleanup
    // only runs in fetch().  Convert sees any key in the map regardless
    // of age, which is the safe default (better to keep disabled than
    // accidentally re-enable).
    const stale = Date.now() - 120_000;
    (fetcher as any).triggeredReruns.set('stale-job#1', stale);
    const jenkinsRun: JenkinsCheckRun = {
      attempt: 1, change: 123, checkDescription: '', checkLink: '',
      checkName: 'Test', externalId: 'stale-job#1',
      finishedTimestamp: '2024-06-15T10:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-06-15T10:00:00Z',
      startedTimestamp: '2024-06-15T10:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [{
        name: 'Rerun', tooltip: 'Trigger rerun',
        primary: true, summary: false, disabled: false,
        method: 'POST', data: '', url: 'http://jenkins/job/build',
      }],
    };
    const config: Config = {name: 'my-jenkins', url: 'http://jenkins', user: ''};

    const result = (fetcher as any).convert(config, 'my-repo', jenkinsRun);

    assert.isTrue(result.actions[0].disabled);
  });
});

suite('ChecksFetcher tree naming', () => {
  let fetcher: ChecksFetcher;
  const TREE = '\u{1F333}';  // 🌳
  const LEAF = '\u{1F343}';  // 🍃

  function makeRun(overrides: Partial<JenkinsCheckRun> = {}): JenkinsCheckRun {
    return {
      attempt: 1, change: 1, checkDescription: '', checkLink: '',
      checkName: 'Default', externalId: '',
      finishedTimestamp: '2024-01-01T00:00:00Z',
      labelName: '', patchset: 1, results: [],
      scheduledTimestamp: '2024-01-01T00:00:00Z',
      startedTimestamp: '2024-01-01T00:00:00Z',
      status: RunStatus.COMPLETED, statusDescription: '', statusLink: '',
      actions: [],
      ...overrides,
    };
  }

  setup(() => {
    fetcher = makeFetcher();
  });

  test('single direct run with no children keeps original name', () => {
    const runs = [makeRun({checkName: 'Build', externalId: 'build#1'})];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, 'Build');
  });

  test('single direct run with children gets tree emoji', () => {
    const runs = [
      makeRun({checkName: 'Build', externalId: 'build#1'}),
      makeRun({checkName: 'Test', externalId: '{"parent":"build#1","run":"test#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, `01 ${TREE} Build`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Test`);
  });

  test('depth chain A→B→C gets correct numbering', () => {
    const runs = [
      makeRun({checkName: 'A', externalId: 'a#1'}),
      makeRun({checkName: 'B', externalId: '{"parent":"a#1","run":"b#2"}'}),
      makeRun({checkName: 'C', externalId: '{"parent":"b#2","run":"c#3"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, `01 ${TREE} A`);
    assert.equal(runs[1].checkName, `02 ${TREE} B`);
    assert.equal(runs[2].checkName, `03 ${LEAF} C`);
  });

  test('parallel children at same depth get the same number', () => {
    const runs = [
      makeRun({checkName: 'Parent', externalId: 'parent#1'}),
      makeRun({checkName: 'Child1', externalId: '{"parent":"parent#1","run":"child1#2"}'}),
      makeRun({checkName: 'Child2', externalId: '{"parent":"parent#1","run":"child2#3"}'}),
      makeRun({checkName: 'Child3', externalId: '{"parent":"parent#1","run":"child3#4"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, `01 ${TREE} Parent`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Child1`);
    assert.equal(runs[2].checkName, `02 ${LEAF} Child2`);
    assert.equal(runs[3].checkName, `02 ${LEAF} Child3`);
  });

  test('empty externalId keeps original name unchanged', () => {
    const runs = [makeRun({checkName: 'Orphan', externalId: ''})];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, 'Orphan');
  });

  test('undefined externalId keeps original name unchanged', () => {
    const runs = [makeRun({checkName: 'NoId'})];
    delete (runs[0] as any).externalId;
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, 'NoId');
  });

  test('malformed JSON externalId keeps original name when no dependencies', () => {
    const runs = [makeRun({checkName: 'Weird', externalId: 'not-really-json}'})];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, 'Weird');
  });

  test('broken parent chain keeps original name when no real dependencies', () => {
    const runs = [
      makeRun({checkName: 'Child', externalId: '{"parent":"ghost#1","run":"child#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // parent "ghost#1" not in the list → no real dependency, keep original name
    assert.equal(runs[0].checkName, 'Child');
  });

  test('empty runs array is a no-op', () => {
    (fetcher as any).computeTreeNames([]);
    // No throw = pass
  });

  test('independent runs without shared keys keep original names', () => {
    const runs = [
      makeRun({checkName: 'Standalone', externalId: 'standalone#1'}),
      makeRun({checkName: 'Other', externalId: 'other#1'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, 'Standalone');
    assert.equal(runs[1].checkName, 'Other');
  });

  test('runs without externalId keep original names while others get prefixed and sorted', () => {
    const runs = [
      makeRun({checkName: 'Keep Me', externalId: ''}),
      makeRun({checkName: 'Parent', externalId: 'parent#1'}),
      makeRun({checkName: 'Child', externalId: '{"parent":"parent#1","run":"child#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // In-graph runs sorted by depth first, non-graph runs last
    assert.equal(runs[0].checkName, `01 ${TREE} Parent`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Child`);
    assert.equal(runs[2].checkName, 'Keep Me');
  });

  test('independent run in same batch as parent-child keeps original name at end', () => {
    const runs = [
      makeRun({checkName: 'Parent', externalId: 'parent#1'}),
      makeRun({checkName: 'Child', externalId: '{"parent":"parent#1","run":"child#2"}'}),
      makeRun({checkName: 'Standalone', externalId: 'standalone#1'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    assert.equal(runs[0].checkName, `01 ${TREE} Parent`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Child`);
    assert.equal(runs[2].checkName, 'Standalone');
  });

  test('sorts runs by depth when Jenkins returns them out of order', () => {
    const runs = [
      makeRun({checkName: 'Child', externalId: '{"parent":"parent#1","run":"child#2"}'}),
      makeRun({checkName: 'Parent', externalId: 'parent#1'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // Parent (depth 0) before Child (depth 1) regardless of input order
    assert.equal(runs[0].checkName, `01 ${TREE} Parent`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Child`);
  });

  test('sort is stable within same depth', () => {
    const runs = [
      makeRun({checkName: 'Parent', externalId: 'parent#1'}),
      makeRun({checkName: 'ChildB', externalId: '{"parent":"parent#1","run":"childB#3"}'}),
      makeRun({checkName: 'ChildA', externalId: '{"parent":"parent#1","run":"childA#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // Parent first, then children in original order (B before A — stable)
    assert.equal(runs[0].checkName, `01 ${TREE} Parent`);
    assert.equal(runs[1].checkName, `02 ${LEAF} ChildB`);
    assert.equal(runs[2].checkName, `02 ${LEAF} ChildA`);
  });

  test('two separate trees are grouped by tree then by depth', () => {
    const runs = [
      makeRun({checkName: 'Pipeline-A', externalId: 'pipeA#1'}),
      makeRun({checkName: 'Downstream-A2', externalId: '{"parent":"pipeA#1","run":"dsA2#3"}'}),
      makeRun({checkName: 'Downstream-A1', externalId: '{"parent":"pipeA#1","run":"dsA1#2"}'}),
      makeRun({checkName: 'Pipeline-B', externalId: 'pipeB#1'}),
      makeRun({checkName: 'Downstream-B1', externalId: '{"parent":"pipeB#1","run":"dsB1#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // Tree 1 (pipeA): root + its leaves, sorted by depth
    assert.equal(runs[0].checkName, `01 ${TREE} Pipeline-A`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Downstream-A2`);
    assert.equal(runs[2].checkName, `02 ${LEAF} Downstream-A1`);
    // Tree 2 (pipeB): root + its leaf, separate group
    assert.equal(runs[3].checkName, `01 ${TREE} Pipeline-B`);
    assert.equal(runs[4].checkName, `02 ${LEAF} Downstream-B1`);
  });

  test('two separate trees interleaved in input are grouped correctly', () => {
    const runs = [
      makeRun({checkName: 'Pipeline-A', externalId: 'pipeA#1'}),
      makeRun({checkName: 'Pipeline-B', externalId: 'pipeB#1'}),
      makeRun({checkName: 'Downstream-A1', externalId: '{"parent":"pipeA#1","run":"dsA1#2"}'}),
      makeRun({checkName: 'Downstream-B1', externalId: '{"parent":"pipeB#1","run":"dsB1#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // Tree 1 (pipeA) grouped together
    assert.equal(runs[0].checkName, `01 ${TREE} Pipeline-A`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Downstream-A1`);
    // Tree 2 (pipeB) grouped together
    assert.equal(runs[2].checkName, `01 ${TREE} Pipeline-B`);
    assert.equal(runs[3].checkName, `02 ${LEAF} Downstream-B1`);
  });

  test('three separate trees preserve their groups', () => {
    const runs = [
      makeRun({checkName: 'Tree1-Root', externalId: 't1#1'}),
      makeRun({checkName: 'Tree3-Root', externalId: 't3#1'}),
      makeRun({checkName: 'Tree2-Root', externalId: 't2#1'}),
      makeRun({checkName: 'Tree1-Leaf', externalId: '{"parent":"t1#1","run":"t1l#2"}'}),
      makeRun({checkName: 'Tree3-Leaf', externalId: '{"parent":"t3#1","run":"t3l#2"}'}),
      makeRun({checkName: 'Tree2-Leaf', externalId: '{"parent":"t2#1","run":"t2l#2"}'}),
    ];
    (fetcher as any).computeTreeNames(runs);
    // Tree 1 (first root in input order)
    assert.equal(runs[0].checkName, `01 ${TREE} Tree1-Root`);
    assert.equal(runs[1].checkName, `02 ${LEAF} Tree1-Leaf`);
    // Tree 3 (second root encountered in input)
    assert.equal(runs[2].checkName, `01 ${TREE} Tree3-Root`);
    assert.equal(runs[3].checkName, `02 ${LEAF} Tree3-Leaf`);
    // Tree 2 (third root encountered in input)
    assert.equal(runs[4].checkName, `01 ${TREE} Tree2-Root`);
    assert.equal(runs[5].checkName, `02 ${LEAF} Tree2-Leaf`);
  });
});
