import { createServer, connect } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { lookup } from 'node:dns/promises';
import { isPublicIPv4 } from './source-relay.mjs';
/** Pin DNS at the actual upstream connection. FFmpeg sees only this local socket. */
export async function createOutputTunnel(target, { lookupAddresses = lookup, connectTcp = connect, connectSecure = connectTls, signal } = {}) {
  const url = new URL(target.url);
  const addresses = await lookupAddresses(url.hostname, { all: true, family: 4 });
  if (signal?.aborted || !addresses.length || addresses.some(a => (!isPublicIPv4(a.address) || /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|192\.88\.99\.)/.test(a.address)))) throw Error('Output address unavailable');
  const sockets = new Set(); let closed = false;
  const server = createServer(local => {
    if (closed) { local.destroy(); return; }
    const options = { host: addresses[0].address, port: Number(url.port || (url.protocol === 'rtmps:' ? 443 : 1935)) };
    const upstream = url.protocol === 'rtmps:' ? connectSecure({ ...options, servername: url.hostname, rejectUnauthorized: true }) : connectTcp(options);
    sockets.add(local); sockets.add(upstream);
    upstream.setTimeout(10000, () => upstream.destroy());
    local.on('error', () => upstream.destroy()); upstream.on('error', () => local.destroy());
    local.on('close', () => { sockets.delete(local); upstream.destroy(); }); upstream.on('close', () => { sockets.delete(upstream); local.destroy(); });
    local.pipe(upstream); upstream.pipe(local);
  });
  const close = () => { closed = true; for (const socket of sockets) socket.destroy(); server.close(); };
  signal?.addEventListener('abort', close, { once: true });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); if (signal?.aborted) throw Error(); }
  catch { close(); throw Error('Output address unavailable'); }
  return { ...target, url: `rtmp://127.0.0.1:${server.address().port}${url.pathname}`, close() { signal?.removeEventListener('abort', close); close(); } };
}
