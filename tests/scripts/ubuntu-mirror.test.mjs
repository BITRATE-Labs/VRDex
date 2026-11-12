import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp, mkdir, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {configureUbuntuMirror} from "../../.github/scripts/configure-ubuntu-mirror.mjs";
test("Ubuntu mirror prep handles direct and mirror-list sources without changing signature policy", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"vrdex-apt-"));
  try {
    await mkdir(path.join(root,"sources.list.d"));
    await writeFile(path.join(root,"sources.list"),"deb http://azure.archive.ubuntu.com/ubuntu noble main universe\n");
    const original="Types: deb\nURIs: https://security.ubuntu.com/ubuntu/\nSuites: noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n";
    await writeFile(path.join(root,"sources.list.d/ubuntu.sources"),original);
    await writeFile(path.join(root,"sources.list.d/custom.list"),"deb https://example.invalid/packages stable main\n");
    await writeFile(path.join(root,"apt-mirrors.txt"),"http://azure.archive.ubuntu.com/ubuntu/\nhttps://archive.ubuntu.com/ubuntu/\nhttps://azure.archive.ubuntu.com.example.invalid/ubuntu/\n");
    await configureUbuntuMirror(root);
    await configureUbuntuMirror(root);
    assert.equal(await readFile(path.join(root,"sources.list"),"utf8"),"deb https://mirrors.edge.kernel.org/ubuntu/ noble main universe\n");
    assert.equal(await readFile(path.join(root,"sources.list.d/ubuntu.sources"),"utf8"),original.replace("https://security.ubuntu.com/ubuntu/","https://mirrors.edge.kernel.org/ubuntu/"));
    const mirrors=await readFile(path.join(root,"apt-mirrors.txt"),"utf8");
    assert.equal(mirrors.split("https://mirrors.edge.kernel.org/ubuntu/").length-1,1);
    assert.match(mirrors,/priority:1/);
    assert.match(mirrors,/https:\/\/azure\.archive\.ubuntu\.com\.example\.invalid\/ubuntu\//);
    assert.doesNotMatch(mirrors,/^http:\/\/azure\.archive\.ubuntu\.com\//m);
    assert.equal(await readFile(path.join(root,"sources.list.d/custom.list"),"utf8"),"deb https://example.invalid/packages stable main\n");
  } finally { assert.ok(root.startsWith(path.join(tmpdir(),"vrdex-apt-"))); await rm(root,{recursive:true,force:true}); }
});

test("Ubuntu mirror lists handle absence, empty files, missing final newlines and duplicates", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"vrdex-apt-"));
  const file=path.join(root,"apt-mirrors.txt");
  const preferred="https://mirrors.edge.kernel.org/ubuntu/\tpriority:1";
  const fallback="https://archive.ubuntu.com/ubuntu/";
  try {
    await configureUbuntuMirror(root);
    await assert.rejects(readFile(file),{code:"ENOENT"});
    for(const initial of ["",fallback,`https://azure.archive.ubuntu.com/ubuntu/\n${fallback}\n`,`${preferred}\n${preferred}\n`]) {
      await writeFile(file,initial);
      await configureUbuntuMirror(root);
      const first=await readFile(file,"utf8");
      assert.equal(first.split("\n").filter(line=>line===preferred).length,1);
      assert.doesNotMatch(first,/azure\.archive/);
      if(initial.split("\n").some(line=>line===fallback))assert.ok(first.split("\n").some(line=>line===fallback));
      await configureUbuntuMirror(root);
      assert.equal(await readFile(file,"utf8"),first);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
