"use strict";

const OPTIONAL_JOBS = ["build-storybook", "playwright-public-smoke", "playwright-data-flow", "broadcast-native-acceptance", "playwright-hosted-data-flow", "playwright-public-preview", "storybook-component-preview", "playwright-image-diff", "storybook-image-diff"];

// Unknown application changes retain broad coverage; narrow only known surfaces.
const SURFACES = [
  { name: "timeline", path: /^(apps\/web\/(src\/(app\/(?:page\.tsx|_components\/(timeline\/|home-browse-provider\.))|lib\/timeline\/)|e2e\/(home-timeline|home-discovery|homepage-search))|tests\/web\/timeline-)/,
    flows: "(?:home-timeline|home-discovery|homepage-search).*\\.flow\\.spec\\.ts", public: "home-timeline\\.visual\\.spec\\.ts|public-routes\\.(?:visual|snapshots)\\.spec\\.ts" },
  { name: "player", path: /^apps\/web\/(src\/(components\/media\/|lib\/(?:event-playback|event-lineup|native-hls|now-playing|playback-|media-element)|app\/_components\/event-(?:compact-player|playback|watch-surface|live-watch|lineup-player))|e2e\/(mobile-hls|event-lineup-live|native-trial-routing|event-playback))/,
    media: true, storybook: true, public: "(?:public-routes|media-kit)\\.(?:visual|snapshots)\\.spec\\.ts" },
  { name: "profiles", path: /^apps\/web\/(src\/(app\/(?:(?:profiles?|people|\[slug\])\/|_components\/(?:profile-|public-profile-links))|components\/profile|lib\/profile)|e2e\/(?:profile-|public-media-details|media-contribution))/,
    claimAuth: true, storybook: true, flows: "(?:profile-|media-contribution|public-media-details).*\\.flow\\.spec\\.ts", public: "(?:public-routes|media-kit)\\.(?:visual|snapshots)\\.spec\\.ts" },
  { name: "events", path: /^apps\/web\/(src\/(app\/(?:(?:events|\[communitySlug\]\/events)\/|_components\/event-)|lib\/event-(?:editor|detail)|components\/event)|e2e\/event-(?!broadcast|host))/,
    claimAuth: true, flows: "event-.*\\.flow\\.spec\\.ts", public: "(?:public-routes|event-editor|event-held-imports)\\.(?:visual|snapshots)\\.spec\\.ts" },
  { name: "storybook", path: /^apps\/web\/(src\/(?:.*\.stories\.|lib\/timeline\/(?:plan-actions|preferences)\.ts$)|\.storybook\/|e2e\/.*storybook)/,
    storybook: true },
];

function coreCoverage(files, full) {
  const tooling = file => (!file.includes("/") && !file.endsWith(".md")) || file.startsWith("scripts/");
  return {
    scripts: full || files.some(file => tooling(file) || /^(\.github\/|tests\/scripts\/|workers\/|packages\/|convex\/)/.test(file)),
    restream: full || files.some(file => tooling(file) || /^(workers\/restream\/|apps\/discord-gateway\/|packages\/|convex\/(?:_?eventMedia|schema|migrations)|tests\/(?:backend|scripts)\/.*(?:broadcast|restream|captured-transport|event-media)|infra\/terraform\/(?:restream-worker|media-relay)\/|\.github\/)/.test(file)),
  };
}

function selectCoverage({ eventName, labels, files }) {
  const full = eventName === "pull_request" && labels.some(label => label.name === "ci:full");
  const visuals = eventName === "pull_request" && (full || labels.some(label => label.name === "ci:visuals"));
  const browsers = eventName === "pull_request" && (visuals || labels.some(label => label.name === "ci:browsers"));
  const core = coreCoverage(files, full || eventName !== "pull_request");
  const selected = new Set();
  const flows = new Set();
  const previews = new Set();
  let broad = full;
  let media = false;
  let storybook = false;
  let claimAuth = false;
  if (browsers) {
    for (const file of files) {
      if (/^apps\/web\/.*(?:broadcast|host-view|\/host\/|\/account\/|\/auth|\/clerk|profile-(?:claim|private-record|link-verification)|claim|invit|member|ownership|role|permission|verification|operator|stream-settings)/.test(file)) { broad = true; continue; }
      const surfaces = SURFACES.filter(area => area.path.test(file));
      for (const surface of surfaces) {
        if (surface.flows) flows.add(surface.flows);
        if (surface.public) previews.add(surface.public);
        media ||= Boolean(surface.media);
        storybook ||= Boolean(surface.storybook);
        claimAuth ||= Boolean(surface.claimAuth);
      }
      if (!surfaces.length && !/^(docs\/|tests\/web\/|[^/]+\.md$)/.test(file)) {
        broad = true;
      }
    }
    if (files.length === 0) broad = true;
    if (broad) {
      flows.clear(); flows.add(".*");
      previews.clear(); previews.add(".*");
      media = true; storybook = true;
      selected.add("playwright-public-smoke");
      selected.add("playwright-hosted-data-flow");
      selected.add("broadcast-native-acceptance");
    }
    if (flows.size || media) selected.add("playwright-data-flow");
    if (storybook) { selected.add("build-storybook"); selected.add("storybook-component-preview"); }
    if (previews.size) selected.add("playwright-public-preview");
    if (visuals && previews.size) selected.add("playwright-image-diff");
    if (visuals && storybook) selected.add("storybook-image-diff");
  }
  return { browsers, visuals, full, jobs: OPTIONAL_JOBS.filter(job => selected.has(job)),
    flows: flows.size > 0, flowPattern: [...flows].join("|"), publicPattern: [...previews].join("|"),
    media, claimAuth: browsers && (broad || claimAuth), analytics: browsers && broad, ...core };
}

module.exports = { OPTIONAL_JOBS, selectCoverage };
