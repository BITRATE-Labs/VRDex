import { parseBroadcastInputUrl, broadcastInputKey, broadcastInputPublicUrl } from "../../../../../../convex/_eventBroadcastSources";

// Prototype URL recognition only. This does not establish worker playback support.
export function previewVideoLink(value: string) {
  try {
    const input = parseBroadcastInputUrl(value.trim());
    return { key: broadcastInputKey(input), url: broadcastInputPublicUrl(input), provider: input.kind === "twitch" ? "Twitch" : "VRCDN", title: input.kind === "twitch" ? input.channel : input.streamId };
  } catch {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw Error("Use an HTTPS video link without credentials.");
    const host = url.hostname;
    const parts = url.pathname.split("/").filter(Boolean);
    const youtube = host === "youtu.be" || ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host);
    if (youtube) {
      const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") : ["live", "shorts", "embed"].includes(parts[0] ?? "") ? parts[1] : undefined;
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error("Use a link to a specific YouTube video.");
      return { key: `youtube:${id}`, url: `https://www.youtube.com/watch?v=${id}`, provider: "YouTube", title: "YouTube video" };
    }
    if (/\.(m3u8|mp4|webm|ts)$/i.test(url.pathname))
      return { key: url.href, url: url.href, provider: "Video link", title: parts.at(-1) ?? "Video link" };
    throw Error("Use a YouTube, Twitch, VRCDN or direct video link.");
  }
}
