/** The retained shell supplies chrome height; media keeps this slot's responsive width. */
export function PlaybackInlinePlaceholder({ twitch = false }: { twitch?: boolean }) {
  return <div aria-hidden="true">
    <div className={twitch ? undefined : "aspect-video"} style={{
      display: "var(--event-playback-picture-display, block)",
      height: twitch ? "var(--event-playback-picture-height, 300px)" : undefined,
    }} />
    <div style={{ height: "var(--event-playback-chrome-height, 152px)" }} />
  </div>;
}
