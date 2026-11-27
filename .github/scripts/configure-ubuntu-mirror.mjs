import {readFile,writeFile,readdir,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const mirror="https://archive.ubuntu.com/ubuntu/";
const replacedMirrors=new Set(["archive.ubuntu.com","azure.archive.ubuntu.com","mirrors.edge.kernel.org"].flatMap(host=>["http","https"].map(protocol=>`${protocol}://${host}/ubuntu`)));
async function readOptional(file) {
  try { return await readFile(file,"utf8"); }
  catch(error) { if(error.code==="ENOENT") return null; throw error; }
}
export async function configureUbuntuMirror(root) {
  await mkdir(path.join(root,"apt.conf.d"),{recursive:true});
  await writeFile(path.join(root,"apt.conf.d/99-vrdex-ci-acquire"),'Acquire::http::Timeout "15";\nAcquire::https::Timeout "15";\nAcquire::Retries "1";\n');
  const mirrorFile=path.join(root,"apt-mirrors.txt");
  const current=await readOptional(mirrorFile);
  if(current!==null) {
    const remaining=current.split(/\r?\n/).filter(line=>{
      try {
        const url=new URL(line.trim().split(/\s+/)[0]);
        const regionalUbuntu=["http:","https:"].includes(url.protocol)&&/^[a-z0-9-]+\.ec2\.archive\.ubuntu\.com$/.test(url.hostname)&&["/ubuntu","/ubuntu/"].includes(url.pathname);
        return !replacedMirrors.has(url.href.replace(/\/$/,""))&&!regionalUbuntu;
      } catch { return true; }
    }).join("\n");
    await writeFile(mirrorFile,`${mirror}\tpriority:1\n${remaining}`);
  }
  let entries=[];
  try { entries=await readdir(path.join(root,"sources.list.d")); }
  catch(error) { if(error.code!=="ENOENT") throw error; }
  const files=[path.join(root,"sources.list"),...entries.filter(name=>/\.(list|sources)$/.test(name)).map(name=>path.join(root,"sources.list.d",name))];
  for(const file of files) {
    const source=await readOptional(file);
    if(source===null) continue;
    let updated=source.replace(/https?:\/\/(?:(?:azure\.archive|archive|security)\.ubuntu\.com|[a-z0-9-]+\.ec2\.archive\.ubuntu\.com|mirrors\.edge\.kernel\.org)\/ubuntu\/?(?=\s|$)/g,mirror);
    // FFmpeg and Playwright dependencies use Ubuntu packages; the runner's Microsoft feed can return 403.
    if(file.endsWith(".list")) {
      updated=updated.replace(/^([ \t]*deb(?:-src)?[ \t]+(?:\[[^\]\r\n]+\][ \t]+)?https:\/\/packages\.microsoft\.com\/ubuntu\/26\.04\/prod\/?[ \t]+resolute(?=[ \t]|$)[^\r\n]*)/gm,"# $1");
    } else {
      updated=updated.split(/(\r?\n[ \t]*\r?\n)/).map(stanza=>{
        if(!/^URIs:[ \t]+https:\/\/packages\.microsoft\.com\/ubuntu\/26\.04\/prod\/?[ \t]*\r?$/im.test(stanza)) return stanza;
        if(!/^Suites:[ \t]+resolute[ \t]*\r?$/im.test(stanza)) return stanza;
        return /^Enabled:/im.test(stanza) ? stanza.replace(/^Enabled:[^\r\n]*/im,"Enabled: no") : `Enabled: no\n${stanza}`;
      }).join("");
    }
    if(updated!==source) await writeFile(file,updated);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await configureUbuntuMirror("/etc/apt");
  console.log("Ubuntu mirror configured; signature and suite settings retained.");
  console.log(await readOptional("/etc/apt/apt-mirrors.txt") ?? "No mirror list; configured source files remain in use.");
}
