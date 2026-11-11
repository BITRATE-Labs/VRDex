import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('mirror preparation executes safely for absent, empty, unterminated and repeated lists', {skip:process.platform==='win32'}, async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'vrdex-apt-'));
  const mirrors=path.join(dir,'mirrors.txt');
  const helper=path.resolve('.github/scripts/prepare-browser-apt.sh');
  const preferred='https://mirrors.edge.kernel.org/ubuntu/\tpriority:1';
  try {
    await writeFile(path.join(dir,'sudo'),'#!/bin/sh\nexec "$@"\n',{mode:0o700});
    const prepare=()=>execFileSync('bash',[helper,mirrors],{encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
    assert.match(prepare(),/no APT mirror list/);
    await assert.rejects(readFile(mirrors),{code:'ENOENT'});
    for(const initial of ['', 'https://archive.ubuntu.com/ubuntu', 'https://azure.archive.ubuntu.com/ubuntu\nhttps://archive.ubuntu.com/ubuntu\n', `${preferred}\n${preferred}\n`]) {
      await writeFile(mirrors,initial);
      prepare();
      const first=await readFile(mirrors,'utf8');
      assert.equal(first.split('\n').filter(line=>line===preferred).length,1);
      assert.doesNotMatch(first,/azure\.archive/);
      if(initial.includes('https://archive.ubuntu.com'))assert.ok(first.split('\n').includes('https://archive.ubuntu.com/ubuntu'));
      prepare();
      assert.equal(await readFile(mirrors,'utf8'),first);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
