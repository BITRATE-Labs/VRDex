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
        assert.ok(step.run.indexOf('configure-ubuntu-mirror.mjs') >= 0);
        assert.ok(step.run.indexOf('configure-ubuntu-mirror.mjs') < step.run.indexOf('playwright install'));
      }
    }
  }
  assert.equal(installs, 13);
  const helper = await readFile('.github/scripts/configure-ubuntu-mirror.mjs', 'utf8');
  assert.match(helper, /priority:1/);
  assert.doesNotMatch(helper, /allow-unauthenticated|AllowInsecureRepositories|Check-Valid-Until=false|trusted=yes/);
});
