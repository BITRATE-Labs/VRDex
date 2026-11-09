/** Lexical admission only. The acquisition relay resolves and pins DNS at every fetch. */
export function canonicalDirectMediaUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS video link."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || (url.port && url.port !== "443") || host === "localhost" || !host.includes(".") || /[:\[\]]/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host))
    throw new Error("Use a public HTTPS video link.");
  if (!/\.(?:mp4|webm|ts|m3u8)$/i.test(url.pathname)) throw new Error("Use an MP4, WebM, MPEG-TS, or HLS video link.");
  return url.href;
}
