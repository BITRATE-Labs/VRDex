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
    await writeFile(path.join(root,"apt-mirrors.txt"),"http://azure.archive.ubuntu.com/ubuntu/\nhttps://mirrors.edge.kernel.org/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\nhttps://azure.archive.ubuntu.com.example.invalid/ubuntu/\n");
    await writeFile(path.join(root,"sources.list.d/previous.list"),"deb https://mirrors.edge.kernel.org/ubuntu/ noble main\n");
    await writeFile(path.join(root,"sources.list.d/ec2.sources"),original.replace("https://security.ubuntu.com/ubuntu/","http://us-east-2.ec2.archive.ubuntu.com/ubuntu/"));
    const regional="http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://us-east-2.ec2.archive.ubuntu.com.example.invalid/ubuntu/\n";
    await writeFile(path.join(root,"apt-mirrors.txt"),(await readFile(path.join(root,"apt-mirrors.txt"),"utf8"))+regional);
    await mkdir(path.join(root,"apt.conf.d"));
    await writeFile(path.join(root,"apt.conf.d/20-custom"),"Custom::Setting true;\n");
    const microsoftList="deb [signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/26.04/prod resolute main\n";
    const olderMicrosoft="deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n";
    const microsoftSources="Types: deb\nURIs: https://packages.microsoft.com/ubuntu/26.04/prod/\nSuites: resolute\nComponents: main\nSigned-By: /usr/share/keyrings/microsoft-prod.gpg\n";
    await writeFile(path.join(root,"sources.list.d/microsoft.list"),microsoftList+olderMicrosoft);
    await writeFile(path.join(root,"sources.list.d/microsoft.sources"),microsoftSources+"\n"+original);
    await configureUbuntuMirror(root);
    await configureUbuntuMirror(root);
    assert.equal(await readFile(path.join(root,"sources.list"),"utf8"),"deb https://archive.ubuntu.com/ubuntu/ noble main universe\n");
    assert.equal(await readFile(path.join(root,"sources.list.d/ubuntu.sources"),"utf8"),original.replace("https://security.ubuntu.com/ubuntu/","https://archive.ubuntu.com/ubuntu/"));
    assert.equal(await readFile(path.join(root,"sources.list.d/previous.list"),"utf8"),"deb https://archive.ubuntu.com/ubuntu/ noble main\n");
    assert.equal(await readFile(path.join(root,"sources.list.d/ec2.sources"),"utf8"),original.replace("https://security.ubuntu.com/ubuntu/","https://archive.ubuntu.com/ubuntu/"));
    const mirrors=await readFile(path.join(root,"apt-mirrors.txt"),"utf8");
    assert.equal(mirrors.split("https://archive.ubuntu.com/ubuntu/").length-1,1);
    assert.doesNotMatch(mirrors,/mirrors\.edge\.kernel\.org/);
    assert.match(mirrors,/https:\/\/security\.ubuntu\.com\/ubuntu\/\tpriority:3/);
    assert.match(mirrors,/priority:1/);
    assert.match(mirrors,/https:\/\/azure\.archive\.ubuntu\.com\.example\.invalid\/ubuntu\//);
    assert.doesNotMatch(mirrors,/^http:\/\/azure\.archive\.ubuntu\.com\//m);
    assert.doesNotMatch(mirrors,/^http:\/\/us-east-2\.ec2\.archive\.ubuntu\.com\//m);
    assert.match(mirrors,/us-east-2\.ec2\.archive\.ubuntu\.com\.example\.invalid/);
    assert.equal(await readFile(path.join(root,"sources.list.d/custom.list"),"utf8"),"deb https://example.invalid/packages stable main\n");
    assert.equal(await readFile(path.join(root,"sources.list.d/microsoft.list"),"utf8"),"# "+microsoftList+olderMicrosoft);
    assert.equal(await readFile(path.join(root,"sources.list.d/microsoft.sources"),"utf8"),"Enabled: no\n"+microsoftSources+"\n"+original.replace("https://security.ubuntu.com/ubuntu/","https://archive.ubuntu.com/ubuntu/"));

    assert.equal(await readFile(path.join(root,"apt.conf.d/20-custom"),"utf8"),"Custom::Setting true;\n");
  } finally { assert.ok(root.startsWith(path.join(tmpdir(),"vrdex-apt-"))); await rm(root,{recursive:true,force:true}); }
});

test("Ubuntu mirror lists handle absence, empty files, missing final newlines and duplicates", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"vrdex-apt-"));
  const file=path.join(root,"apt-mirrors.txt");
  const preferred="https://archive.ubuntu.com/ubuntu/\tpriority:1";
  const fallback="https://security.ubuntu.com/ubuntu/";
  try {
    await configureUbuntuMirror(root);
    await assert.rejects(readFile(file),{code:"ENOENT"});
    assert.equal(await readFile(path.join(root,"apt.conf.d/99-vrdex-ci-acquire"),"utf8"),'Acquire::http::Timeout "15";\nAcquire::https::Timeout "15";\nAcquire::Retries "1";\n');
    for(const initial of ["",fallback,`https://azure.archive.ubuntu.com/ubuntu/\n${fallback}\n`,`${preferred}\n${preferred}\n`,`https://mirrors.edge.kernel.org/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\n`]) {
      await writeFile(file,initial);
      await configureUbuntuMirror(root);
      const first=await readFile(file,"utf8");
      assert.equal(first.split("\n").filter(line=>line===preferred).length,1);
      assert.doesNotMatch(first,/azure\.archive/);
      if(initial.split("\n").some(line=>line===fallback))assert.ok(first.split("\n").some(line=>line===fallback));
      await configureUbuntuMirror(root);
      assert.equal(await readFile(file,"utf8"),first);
    }
  } finally {assert.ok(root.startsWith(path.join(tmpdir(),"vrdex-apt-")));await rm(root,{recursive:true,force:true});}
});
