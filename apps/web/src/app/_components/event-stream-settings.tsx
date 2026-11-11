"use client";
import { useRef, useState } from "react";
import type { FunctionArgs } from "convex/server";
import type { api } from "@convex-generated-api";
import { VIDEO_PROFILES } from "../../../../../workers/restream/broadcast-profiles.mjs";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
export type StreamSettings = Omit<
  FunctionArgs<typeof api.eventMediaSettings.configure>,
  "currentSlug"
>;
export function EventStreamSettings({
  settings,
  embedded = false,
  activeSettings,
  canControl,
  onSave,
}: {
  embedded?: boolean;
  settings: StreamSettings;
  activeSettings?: StreamSettings;
  canControl: boolean;
  onSave: (settings: StreamSettings) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<StreamSettings | undefined>();
  const value = draft ?? settings,
    profile = VIDEO_PROFILES[value.videoPreset];
  // shortcut: only 720p30/320 is qualified, expand choices with the capacity map.
  const supported = value.videoPreset === "720p30" && value.audioBitrateKbps === 320;
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const lock = useRef(false);
  function choose(height: number, rate: number) {
    const preset = Object.keys(VIDEO_PROFILES).find(
      (key) => key === `${height}p${rate}`,
    );
    if (
      preset &&
      (preset === "480p30" ||
        preset === "480p60" ||
        preset === "720p30" ||
        preset === "720p60" ||
        preset === "1080p30" ||
        preset === "1080p60")
    )
      setDraft({ ...value, videoPreset: preset });
  }
  return (
    <section className="space-y-4">
      {!embedded && <h2 className="text-xl font-semibold">Stream settings</h2>}
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-muted">Active</dt>
          <dd>
            {activeSettings
              ? `${activeSettings.videoPreset} · ${activeSettings.audioBitrateKbps} kbps`
              : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Next start</dt>
          <dd>
            {settings.videoPreset} · {settings.audioBitrateKbps} kbps
          </dd>
        </div>
      </dl>
      <fieldset
        disabled={!canControl || busy}
        className="flex flex-wrap items-end gap-4"
      >
        <Field>
          Resolution
          <Select
            value={profile.height}
            onChange={(event) => {
              if (event.target.value === "720") choose(720, profile.frameRate);
            }}
          >
            {[480, 720, 1080].map((height) => (
              <option key={height} value={height} disabled={height !== 720}>
                {height}p
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Frame rate
          <Select
            value={profile.frameRate}
            onChange={(event) => {
              if (event.target.value === "30") choose(profile.height, 30);
            }}
          >
            {[30, 60].map((rate) => (
              <option key={rate} value={rate} disabled={rate !== 30}>
                {rate} fps
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Audio bitrate
          <Select
            value={value.audioBitrateKbps}
            onChange={(event) => {
              if (event.target.value === "320") setDraft({ ...value, audioBitrateKbps: 320 });
            }}
          >
            <option value="160" disabled>160 kbps</option>
            <option value="320">320 kbps</option>
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={!supported}
          onClick={async () => {
            if (lock.current || !canControl || !supported) return;
            lock.current = true;
            setBusy(true);
            setFailed(false);
            try {
              await onSave(value);
              setDraft(undefined);
            } catch {
              setFailed(true);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          Save settings
        </Button>
      </fieldset>
      <p className="text-sm text-muted">Stereo · 48 kHz · Twitch: 160 kbps</p>
      {failed ? <p role="status">Save failed</p> : null}
    </section>
  );
}
