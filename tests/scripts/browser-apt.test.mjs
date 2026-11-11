import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

test('every browser dependency install prepares mirrors within a bounded step', async () => {
  let installs = 0;
  for (const file of ['baseline-checks.yml', 'deployed-health.yml', 'staging-deploy.yml']) {
    const workflow = parse(await readFile(`.github/workflows/${file}`, 'utf8'), { uniqueKeys: true });
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.run?.includes('playwright install --with-deps')) continue;
        installs++;
        assert.equal(step['timeout-minutes'], 10, `${file}: ${step.name}`);
        assert.ok(step.run.indexOf('prepare-browser-apt.sh') >= 0);
        assert.ok(step.run.indexOf('prepare-browser-apt.sh') < step.run.indexOf('playwright install'));
      }
    }
  }
  assert.equal(installs, 12);
  const helper = await readFile('.github/scripts/prepare-browser-apt.sh', 'utf8');
  assert.match(helper, /priority:1/);
  assert.match(helper, /grep -Fxq/);
  assert.match(helper, /cat "\$mirrors"/);
  assert.doesNotMatch(helper, /allow-unauthenticated|AllowInsecureRepositories|Check-Valid-Until=false|trusted=yes/);
});
