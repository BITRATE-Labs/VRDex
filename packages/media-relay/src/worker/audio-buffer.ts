/** Audio rehearsal storage has no scratch files. Reject before retaining bytes. */
export function createAudioBuffer({
  maxSegmentBytes = 128 * 1024,
  maxBytes = 1024 * 1024,
  maxSegments = 9,
  clock = Date.now,
}: { maxSegmentBytes?: number; maxBytes?: number; maxSegments?: number; clock?: () => number } = {}) {
  if (![maxSegmentBytes, maxBytes, maxSegments].every(value => Number.isSafeInteger(value) && value > 0) ||
      maxSegmentBytes > 512 * 1024 || maxBytes > 4 * 1024 * 1024 || maxSegments > 16)
    throw Error("Invalid audio buffer limits");
  const segments = new Map<string, Buffer>();
  let visible = new Set<string>(), playlist: Buffer | undefined, total = 0, closed = false, publishedAt = 0;
  return {
    maxSegmentBytes,
    put(name: string, bytes: Buffer) {
      if (closed) throw Error("Audio buffer closed");
      if (!/^audio-[0-9]{1,12}\.ts$/.test(name)) throw Error("Invalid audio segment");
      const previous = segments.get(name);
      if (previous) {
        if (!previous.equals(bytes)) throw Error("Audio segments are immutable");
        return;
      }
      if (!bytes.length || bytes.length > maxSegmentBytes || total + bytes.length > maxBytes || segments.size >= maxSegments)
        throw Error("Audio buffer limit exceeded");
      segments.set(name, Buffer.from(bytes));
      total += bytes.length;
    },
    publish(text: string) {
      if (closed) throw Error("Audio buffer closed");
      const lines = text.trim().split(/\r?\n/);
      const names = lines.filter(line => line && !line.startsWith("#"));
      if (Buffer.byteLength(text) > 16384 || !text.startsWith("#EXTM3U\n") || !names.length || names.length > maxSegments - 1 ||
          lines.some(line => line.startsWith("#") && !/^(?:#EXTM3U|#EXT-X-VERSION:[3-7]|#EXT-X-TARGETDURATION:[1-4]|#EXT-X-MEDIA-SEQUENCE:[0-9]{1,12}|#EXTINF:[0-4](?:\.[0-9]{1,6})?,|#EXT-X-ENDLIST|#EXT-X-INDEPENDENT-SEGMENTS)$/.test(line)) ||
          !lines.some(line => /^#EXT-X-TARGETDURATION:/.test(line)) ||
          names.some(name => { const index = lines.indexOf(name); return !/^#EXTINF:(?:[0-4](?:\.[0-9]{1,6})?),$/.test(lines[index - 1] ?? ""); }) ||
          names.some(name => !/^audio-[0-9]{1,12}\.ts$/.test(name) || !segments.has(name)) || new Set(names).size !== names.length)
        throw Error("Invalid audio playlist");
      visible = new Set(names);
      playlist = Buffer.from(text);
      publishedAt = clock();
      for (const [name, bytes] of segments) if (!visible.has(name)) {
        total -= bytes.length;
        segments.delete(name);
      }
    },
    get(name: string) {
      if (closed || clock() < publishedAt || clock() - publishedAt >= 10000) return undefined;
      return name === "audio.m3u8" ? playlist : visible.has(name) ? segments.get(name) : undefined;
    },
    bytes: () => total,
    publishedAt: () => publishedAt,
    close() { closed = true; segments.clear(); visible.clear(); playlist = undefined; total = 0; },
  };
}
