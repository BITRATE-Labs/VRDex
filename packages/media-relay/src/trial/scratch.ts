import { lstat, realpath, statfs } from "node:fs/promises";

/** Finite Sandbox target only. A pressure watchdog is not accepted as a physical quota. */
export async function verifyNativeTrialScratch(directory: string) {
  const canonical = await realpath(directory), info = await lstat(directory);
  if (process.platform !== "linux" || !info.isDirectory() || info.isSymbolicLink() ||
      !/^\/tmp\/vrdex-native-trial-[A-Za-z0-9_-]+$/.test(canonical)) throw Error("Unverified native trial scratch path");
  const fs = await statfs(canonical);
  const capacity = fs.bsize * fs.blocks;
  if (fs.type !== 0x01021994 || capacity > 512 * 1024 ** 2 || capacity < 384 * 1024 ** 2 ||
      fs.bsize * fs.bavail < 256 * 1024 ** 2) throw Error("Native trial needs the verified bounded tmpfs");
  return { directory: canonical, physicalBytes: capacity };
}
