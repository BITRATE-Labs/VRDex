import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Emit only the read-only planner so a dry run does not require deploying write functions.
export async function buildRepairPreviewQuery(request) {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL("../convex/_instanceSessionRepair.ts", import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "sessionRepair",
    platform: "browser",
    target: "es2020",
    logLevel: "silent",
  });
  return (
    'import { query } from "convex:/_system/repl/wrappers.js";\n' +
    result.outputFiles[0].text +
    "\nexport default query({handler:ctx=>sessionRepair.previewRepair(ctx," +
    JSON.stringify(request) +
    ")});\n"
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [requestPath, queryPath] = process.argv.slice(2);
  if (!requestPath || !queryPath)
    throw Error(
      "Usage: node scripts/preview-instance-session-repair.mjs request.json query.js",
    );
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  await writeFile(queryPath, await buildRepairPreviewQuery(request));
  console.log(
    "Read-only query written. Run it with Convex runOneoffQuery on the explicitly selected deployment.",
  );
}
