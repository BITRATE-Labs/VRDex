"use strict";
const { OPTIONAL_JOBS, selectCoverage } = require("./ci-scopes.cjs");

const CORE_JOBS = ["lint-web", "verify-docs", "verify-api-mcp", "typecheck-web", "typecheck-backend", "verify-backend-local", "restream-local-checks", "build-web"];
const BROWSER_JOBS = ["playwright-public-smoke", "playwright-data-flow", "broadcast-native-acceptance", "playwright-hosted-data-flow", "playwright-public-preview", "storybook-component-preview"];
const COMPARISON_JOBS = new Set(["playwright-image-diff", "storybook-image-diff"]);

function broadcastRelevant(files) {
  return files.some(file => !/^(apps\/web\/(src\/(app\/_components\/timeline\/|lib\/timeline\/)|e2e\/home-timeline)|docs\/|tests\/web\/|[^/]+\.md$)/.test(file));
}

function selectEvidence(eventName, labels) {
  const { browsers, visuals } = selectCoverage({ eventName, labels, files: [] });
  return { browsers, visuals };
}

function evaluateVerification({ needs, artifacts }) {
  const errors = [];
  const selection = needs["visual-selection"];
  const outputs = selection?.outputs;
  let jobs = null;
  try {
    const parsed = JSON.parse(outputs?.jobs);
    if (Array.isArray(parsed) && parsed.every(job => OPTIONAL_JOBS.includes(job)) && new Set(parsed).size === parsed.length) jobs = parsed;
  } catch { /* Missing or malformed job selection fails verification below. */ }
  const validSelection = selection?.result === "success"
    && ["browsers", "visuals", "full", "flows", "media", "claimAuth", "analytics", "scripts", "restream"].every(flag => ["true", "false"].includes(outputs?.[flag]))
    && !(outputs.visuals === "true" && outputs.browsers !== "true")
    && jobs !== null && (outputs.browsers === "true" || jobs.length === 0)
    && (outputs.visuals === "true" || !jobs.some(job => COMPARISON_JOBS.has(job)))
    && (outputs.flows !== "true" || Boolean(outputs.flowPattern))
    && (!jobs.includes("playwright-public-preview") || Boolean(outputs.publicPattern))
    && (outputs.full !== "true" || (outputs.browsers === "true" && outputs.visuals === "true" && jobs.length === OPTIONAL_JOBS.length && outputs.flowPattern === ".*" && outputs.publicPattern === ".*"
      && ["scripts", "restream", "flows", "media", "claimAuth", "analytics"].every(flag => outputs[flag] === "true")));
  const browsers = validSelection ? outputs.browsers === "true" : null;
  const visuals = validSelection ? outputs.visuals === "true" : null;
  if (!validSelection) errors.push("Browser/visual selection is missing, invalid or inconsistent.");
  const available = new Set(artifacts.filter(artifact => !artifact.expired).map(artifact => artifact.name));
  function requireSuccess(job, artifactRequired = false) {
    if (needs[job]?.result !== "success") errors.push(`${job} must succeed; received ${needs[job]?.result || "unknown"}.`);
    if (artifactRequired && !available.has(job)) errors.push(`${job} has no current run artifact.`);
  }
  function requireSkip(job, coverage) {
    if (needs[job]?.result !== "skipped") errors.push(`${job} must skip when ${coverage} are not selected.`);
  }
  for (const job of CORE_JOBS) requireSuccess(job);
  if (validSelection) for (const job of OPTIONAL_JOBS) {
    if (jobs.includes(job)) requireSuccess(job, job !== "build-storybook");
    else requireSkip(job, "relevant changes");
  }
  return { browsers, visuals, errors, jobs: validSelection ? jobs : null };
}

function checkReviewCaptures(directory, selected) {
  const fs = require("node:fs");
  const count = fs.existsSync(directory)
    ? fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith(".png")).length
    : 0;
  if (selected && count === 0) throw new Error("No review screenshots were generated for a selected capture run.");
  if (!selected && count > 0) throw new Error("Review screenshots were written while capture was disabled.");
  return count;
}

module.exports = { CORE_JOBS, BROWSER_JOBS, COMPARISON_JOBS, selectEvidence, evaluateVerification, checkReviewCaptures, broadcastRelevant };

if (require.main === module) {
  const fs = require("node:fs");
  if (process.argv[2] === "--broadcast") {
    const { execFileSync } = require("node:child_process");
    const base = process.env.BASE_SHA;
    if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Exact broadcast comparison base required.");
    const files = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
    const enabled = process.env.FORCE_FULL === "true" || broadcastRelevant(files);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${enabled}\n`);
    console.log(enabled ? "Broadcast-related changes: native acceptance selected." : "No broadcast-related changes: native acceptance not selected.");
  } else if (process.argv[2] === "--check-captures") {
    const value = process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS;
    if (!["true", "false"].includes(value)) throw new Error("Capture selection must be explicitly true or false in CI.");
    const count = checkReviewCaptures(process.argv[3], value === "true");
    console.log(`Review PNGs: ${count}; capture selected: ${value}`);
  } else {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const { execFileSync } = require("node:child_process");
    const base = process.env.BASE_SHA;
    if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Exact CI comparison base required.");
    const files = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
    const coverage = selectCoverage({ eventName: process.env.GITHUB_EVENT_NAME, labels: event.pull_request?.labels || [], files });
    for (const [key, value] of Object.entries(coverage)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      "## CI coverage", "",
      `Full suite: ${coverage.full ? "yes" : "no"}.`,
      `Selected optional jobs: ${coverage.jobs.join(", ") || "none"}.`,
      `Flow file pattern: \`${coverage.flowPattern || "not selected"}\`.`,
      `Script contracts: ${coverage.scripts ? "selected" : "not selected"}. Native restream: ${coverage.restream ? "selected" : "not selected"}.`, "",
    ].join("\n"));
    console.log(JSON.stringify({ ...coverage, changedFiles: files.length }));
  }
}
