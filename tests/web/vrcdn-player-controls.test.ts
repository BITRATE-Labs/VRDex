import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("legacy controls omit dead audio, preserve saved-mode recovery and native audio choices", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { VrcdnPlayerControls } from "./src/components/media/vrcdn-player-controls.tsx";
    const base = { label: "Stream", connected: true, fullscreen: false, muted: false, paused: false, volume: 1, volumeSettable: true,
      onModeChange() {}, onToggleFullscreen() {}, onToggleMute() {}, onTogglePlay() {}, onVolumeChange() {} };
    console.log(JSON.stringify([
      { mode: "video", audioAvailable: false, pipSupported: true },
      { mode: "audio", audioAvailable: false },
      { mode: "video", audioAvailable: true },
    ].map(props => renderToStaticMarkup(createElement(VrcdnPlayerControls, { ...base, ...props })))));
  `], { cwd: path.resolve("apps/web"), encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.json" } });
  const [legacy, recovery, native] = JSON.parse(output);
  assert.doesNotMatch(legacy, /Audio only|Playback mode/);
  assert.match(legacy, /Picture in picture/);
  assert.match(recovery, />Video</);
  assert.doesNotMatch(recovery, /Audio only/);
  assert.match(native, />Video</);
  assert.match(native, />Audio only</);
});
