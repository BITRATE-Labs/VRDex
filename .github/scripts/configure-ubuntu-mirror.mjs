import {readFile,writeFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const mirror="https://mirrors.edge.kernel.org/ubuntu/";
async function readOptional(file) {
  try { return await readFile(file,"utf8"); }
  catch(error) { if(error.code==="ENOENT") return null; throw error; }
}
export async function configureUbuntuMirror(root) {
  const mirrorFile=path.join(root,"apt-mirrors.txt");
  const current=await readOptional(mirrorFile);
  if(current!==null) {
    const remaining=current.split(/\r?\n/).filter(line=>!line.includes("azure.archive.ubuntu.com")&&!line.startsWith(mirror)).join("\n");
    await writeFile(mirrorFile,`${mirror}\tpriority:1\n${remaining}`);
  }
  let entries=[];
  try { entries=await readdir(path.join(root,"sources.list.d")); }
  catch(error) { if(error.code!=="ENOENT") throw error; }
  const files=[path.join(root,"sources.list"),...entries.filter(name=>/\.(list|sources)$/.test(name)).map(name=>path.join(root,"sources.list.d",name))];
  for(const file of files) {
    const source=await readOptional(file);
    if(source===null) continue;
    const updated=source.replace(/https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?/g,mirror);
    if(updated!==source) await writeFile(file,updated);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await configureUbuntuMirror("/etc/apt");
  console.log("Ubuntu mirror configured; signature and suite settings retained.");
}
