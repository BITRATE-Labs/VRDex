import { execFileSync } from "node:child_process";
import path from "node:path";
import { it } from "node:test";

it("groups distinct VRCDN addresses and keeps explicit previews without duplication", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { PublicProfileLinks } from "./src/app/_components/public-profile-links.tsx";
    const link = (label, url) => ({ label, url, type: "vrcdn", source: "owner_authored" });
    const canonicalPreview = "https://panel.vrcdn.live/preview/test-first";
    const separatePreview = "https://panel.vrcdn.live/preview/test-separate";
    const html = renderToStaticMarkup(createElement(PublicProfileLinks, { links: [
      link("VRCDN", "vrcdn:test-first"),
      link("VRCDN", "https://stream.vrcdn.live/live/test-first.live.ts"),
      link("VRCDN", "vrcdn:test-second"),
      link("Live preview", canonicalPreview),
      link("Duplicate preview", canonicalPreview),
      link("Separate preview", separatePreview),
      link("Legacy stream", "https://example.invalid/listen"),
    ] }));
    assert.ok(html.includes('aria-label="VRCDN · test-first"'));
    assert.ok(html.includes('aria-label="VRCDN · test-second"'));
    assert.equal(html.split('href="' + canonicalPreview + '"').length - 1, 1);
    assert.equal(html.split('href="' + separatePreview + '"').length - 1, 1);
    assert.ok(html.includes('aria-label="Live preview"'));
    assert.ok(!html.includes("Duplicate preview"));
    assert.ok(html.includes("rtspt://stream.vrcdn.live/<wbr/>live/<wbr/>test-first"));
    const textHtml = html.replaceAll("<wbr/>", "");
    assert.equal(textHtml.split(">rtspt://stream.vrcdn.live/live/test-first</code>").length - 1, 1);
    assert.ok(textHtml.includes(">https://example.invalid/listen</code>"));
  `], {
    cwd: path.resolve("apps/web"), encoding: "utf8",
    env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.json" },
  });
});
