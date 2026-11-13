import { NATIVE_TRIAL_SEGMENT_GRACE_MS } from "./policy";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { PublishedSnapshotSchema, StreamKeySchema, snapshotObjectKey, type RenditionSnapshot, type StreamKey } from "../contracts";
import type { RelayStorage } from "../worker/publisher";

/** The ordinary publisher writes into this finite trial store instead of a replayable CDN origin. */
export function createNativeTrialStorage({ streamKey, maxBytes, clock = Date.now }: {
  streamKey: StreamKey; maxBytes: number; clock?: () => number;
}) {
  StreamKeySchema.parse(streamKey);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 128 * 1024 ** 2) throw Error("Invalid trial storage limit");
  const segments = new Map<string, { bytes: Buffer; unreferencedAt?: number }>();
  const snapshots = new Map<string, RenditionSnapshot>();
  const recent: Record<"video" | "audio", string[]> = { video: [], audio: [] };
  let bytes = 0, pending = 0, closed = false;
  function validKey(key: string) {
    return key.startsWith(`${streamKey}/epochs/`) &&
      new RegExp(`^${streamKey}/epochs/[1-9][0-9]*/attempt-[A-Za-z0-9_-]+/(?:video|audio)-[0-9]+\\.ts$`).test(key);
  }
  function prune(before: number) {
    const retained = new Set([...snapshots.values()].flatMap(snapshot => snapshot.segments.map(segment => segment.objectKey)));
    for (const [key, value] of segments) {
      if (retained.has(key)) delete value.unreferencedAt;
      else {
        value.unreferencedAt ??= clock();
        if (value.unreferencedAt < before) { bytes -= value.bytes.length; segments.delete(key); }
      }
    }
  }
  const storage: RelayStorage = {
    async putSegment(args) {
      args.signal.throwIfAborted();
      if (closed || !validKey(args.objectKey)) throw Error("Trial source/key denied");
      prune(clock() - NATIVE_TRIAL_SEGMENT_GRACE_MS);
      const file = await open(args.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let reservation = 0;
      try {
        const info = await file.stat();
        if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > 32 * 1024 ** 2 ||
            bytes + pending + info.size > maxBytes) throw Error("Trial object memory limit");
        reservation = info.size; pending += reservation;
        const data = Buffer.alloc(info.size);
        let offset = 0;
        while (offset < data.length) {
          args.signal.throwIfAborted();
          const read = await file.read(data, offset, data.length - offset, offset);
          if (!read.bytesRead) throw Error("Truncated trial object");
          offset += read.bytesRead;
        }
        const tail = await file.read(Buffer.alloc(1), 0, 1, data.length);
        const after = await file.stat();
        args.signal.throwIfAborted();
        if (closed || tail.bytesRead || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs)
          throw Error("Trial object changed during read");
        const duplicate = segments.get(args.objectKey);
        if (duplicate) {
          if (!duplicate.bytes.equals(data)) throw Error("Trial objects are immutable");
          return;
        }
        segments.set(args.objectKey, { bytes: data }); bytes += data.length;
      } finally { pending -= reservation; await file.close(); }
    },
    async putSnapshot(args) {
      args.signal.throwIfAborted();
      if (closed) throw Error("Trial store closed");
      const snapshot = PublishedSnapshotSchema.parse(args.snapshot);
      if (snapshot.streamKey !== streamKey || snapshotObjectKey(snapshot) !== args.objectKey || snapshot.segments.length > 8 ||
          snapshot.segments.some(segment => !segments.has(segment.objectKey))) throw Error("Invalid trial snapshot");
      const previous = snapshots.get(args.objectKey);
      if (previous && JSON.stringify(previous) !== JSON.stringify(snapshot)) throw Error("Trial snapshots are immutable");
      snapshots.set(args.objectKey, snapshot);
      const keys = recent[snapshot.rendition];
      if (!keys.includes(args.objectKey)) keys.push(args.objectKey);
      while (keys.length > 2) { const key = keys.shift(); if (key) snapshots.delete(key); }
      prune(clock() - NATIVE_TRIAL_SEGMENT_GRACE_MS);
    },
    async retire(args) { args.signal.throwIfAborted(); prune(Math.min(args.before, clock() - NATIVE_TRIAL_SEGMENT_GRACE_MS)); },
  };
  return { ...storage,
    readSegment: (key: string) => closed ? undefined : segments.get(key)?.bytes,
    readSnapshot: (key: string) => closed ? undefined : snapshots.get(key),
    bytes: () => bytes + pending,
    close() { closed = true; segments.clear(); snapshots.clear(); recent.video.length = recent.audio.length = 0; bytes = 0; },
  };
}

