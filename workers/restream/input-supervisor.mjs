import { DEFAULT_INPUT_QUALITY } from "./broadcast-profiles.mjs";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
export const reconnectDelay = (attempt) =>
  Math.min(10000, 1000 * 2 ** Math.min(attempt, 4));
/** One timestamp-matched frame, one partial/pending frame, and a 250ms PCM tail.
 * Metadata is numeric only and capped independently of raw media. */
export class LatestMediaBuffer {
  constructor(frameBytes, maxAudioBytes = 48000) {
    this.frameBytes = frameBytes;
    this.maxAudioBytes = maxAudioBytes;
    this.reset();
  }
  reset() {
    this.frame = undefined;
    this.framePts = undefined;
    this.frameIndex = -1;
    this.frameCount = 0;
    this.partial = Buffer.alloc(0);
    this.partialStorage = undefined;
    this.receivedFrames = 0;
    this.videoTimes = new Map();
    this.lastVideoMetadataIndex = -1;
    this.pcm = Buffer.alloc(0);
    this.audioPartial = Buffer.alloc(0);
    this.audioSamplesReceived = 0;
    this.audioMetadataSamples = 0;
    this.lastAudioMetadataIndex = -1;
    this.audioTimes = [];
    this.minimumAudioIndex = 0;
    this.audioCursor = undefined;
    this.timingFailed = false;
  }
  failTiming() {
    this.timingFailed = true;
    this.frame = undefined;
    this.framePts = undefined;
    this.partial = this.pcm = this.audioPartial = Buffer.alloc(0);
    this.partialStorage = undefined;
    this.videoTimes.clear();
    this.audioTimes = [];
    this.audioCursor = undefined;
  }
  videoTimestamp(index, pts) {
    if (this.timingFailed) return;
    if (
      !Number.isSafeInteger(index) ||
      index !== this.lastVideoMetadataIndex + 1 ||
      !Number.isSafeInteger(pts)
    )
      return this.failTiming();
    this.lastVideoMetadataIndex = index;
    // Metadata for a superseded pending frame cannot replace the matched frame.
    if (index < this.receivedFrames - 1) return;
    this.videoTimes.set(index, pts);
    if (this.videoTimes.size > 128) return this.failTiming();
    this.publishFrame();
  }
  publishFrame() {
    const index = this.receivedFrames - 1;
    if (this.partial.length !== this.frameBytes || !this.videoTimes.has(index))
      return;
    const pts = this.videoTimes.get(index);
    // Retained frames can skip forward under callback pressure. Only a source
    // timestamp regression invalidates this clock; decoder reset clears it too.
    if (this.framePts !== undefined && pts < this.framePts)
      this.audioCursor = undefined;
    this.frame = this.partial;
    this.partial = Buffer.alloc(0);
    this.partialStorage = undefined;
    this.framePts = pts;
    this.frameIndex = index;
    this.frameCount++;
    for (const key of this.videoTimes.keys())
      if (key <= index) this.videoTimes.delete(key);
  }
  video(chunk) {
    if (this.timingFailed) return 0;
    let offset = 0,
      frames = 0;
    while (offset < chunk.length) {
      // A superseded unmatched complete frame occupies the partial slot only.
      if (this.partial.length === this.frameBytes) {
        this.partial = Buffer.alloc(0);
        this.partialStorage = undefined;
      }
      // One fresh backing per pending frame; published views may still be queued.
      this.partialStorage ??= Buffer.alloc(this.frameBytes);
      const filled = this.partial.length;
      const bytes = Math.min(this.frameBytes - filled, chunk.length - offset);
      this.partialStorage.set(chunk.subarray(offset, offset + bytes), filled);
      this.partial = this.partialStorage.subarray(0, filled + bytes);
      offset += bytes;
      if (this.partial.length === this.frameBytes) {
        this.receivedFrames++;
        frames++;
        for (const key of this.videoTimes.keys())
          if (key < this.receivedFrames - 1) this.videoTimes.delete(key);
        this.publishFrame();
      }
    }
    return frames;
  }
  audioTimestamp(index, pts, samples) {
    if (this.timingFailed) return;
    if (
      !Number.isSafeInteger(index) ||
      index !== this.lastAudioMetadataIndex + 1 ||
      !Number.isSafeInteger(pts) ||
      !Number.isSafeInteger(samples) ||
      samples < 1 ||
      samples > 48000
    )
      return this.failTiming();
    this.lastAudioMetadataIndex = index;
    const previous = this.audioTimes.at(-1);
    // A discontinuity beyond the retained interval cannot share a playout anchor.
    if (
      previous &&
      Math.abs(pts - previous.pts - previous.samples) > this.maxAudioBytes / 4
    ) {
      this.audioCursor = undefined;
      this.minimumAudioIndex = this.audioMetadataSamples;
      this.audioTimes = [];
    }
    this.audioTimes.push({ index: this.audioMetadataSamples, pts, samples });
    this.audioMetadataSamples += samples;
    this.trimAudio(this.minimumAudioIndex);
    this.pruneAudio();
    if (this.audioTimes.length > 128) this.failTiming();
  }
  audio(chunk) {
    if (this.timingFailed) return Buffer.alloc(0);
    const data = Buffer.concat([this.audioPartial, chunk]);
    const complete = data.subarray(0, data.length - (data.length % 4));
    this.audioPartial = Buffer.from(data.subarray(complete.length));
    this.audioSamplesReceived += complete.length / 4;
    this.pcm = Buffer.from(
      Buffer.concat([this.pcm, complete]).subarray(-this.maxAudioBytes),
    );
    this.trimAudio(this.minimumAudioIndex);
    this.pruneAudio();
    return complete;
  }
  get audioBytes() {
    return this.pcm.length;
  }
  get audioStartIndex() {
    return this.audioSamplesReceived - this.pcm.length / 4;
  }
  trimAudio(index) {
    const bytes = Math.max(
      0,
      Math.min(this.pcm.length, (index - this.audioStartIndex) * 4),
    );
    if (bytes) this.pcm = Buffer.from(this.pcm.subarray(bytes));
  }
  pruneAudio() {
    this.audioTimes = this.audioTimes.filter(
      (row) => row.index + row.samples > this.audioStartIndex,
    );
  }
  audioRanges() {
    return this.audioTimes
      .map((row) => {
        const index = Math.max(row.index, this.audioStartIndex);
        const endIndex = Math.min(
          row.index + row.samples,
          this.audioSamplesReceived,
        );
        return {
          index,
          endIndex,
          start: row.pts + index - row.index,
          end: row.pts + endIndex - row.index,
        };
      })
      .filter((row) => row.endIndex > row.index);
  }
  get hasAudioTiming() {
    return !this.timingFailed && this.audioRanges().length > 0;
  }
  beginPlayback() {
    this.audioCursor = undefined;
  }
  takeAudio(bytes) {
    const result = Buffer.alloc(bytes);
    if (this.timingFailed || this.framePts === undefined) return result;
    const ranges = this.audioRanges();
    if (!ranges.length) {
      if (this.audioCursor !== undefined) this.audioCursor += bytes / 4;
      return result;
    }
    const earliest = Math.min(...ranges.map((row) => row.start));
    const latest = Math.max(...ranges.map((row) => row.end));
    // A dropped tail cannot be played. Ordinary video jitter never moves this cursor.
    if (
      this.audioCursor !== undefined &&
      (this.audioCursor < earliest || this.audioCursor > latest)
    )
      this.audioCursor = undefined;
    if (this.audioCursor === undefined) {
      const anchor = Math.round((this.framePts * 48000) / 90000);
      if (!ranges.some((row) => row.start <= anchor && anchor < row.end))
        return result;
      this.audioCursor = anchor;
    }
    const start = this.audioCursor,
      end = start + bytes / 4;
    let filledUntil = start;
    for (const row of ranges) {
      const from = Math.max(start, filledUntil, row.start),
        to = Math.min(end, row.end);
      if (to <= from) continue;
      const offset = (row.index + from - row.start - this.audioStartIndex) * 4;
      this.pcm.copy(
        result,
        (from - start) * 4,
        offset,
        offset + (to - from) * 4,
      );
      filledUntil = to;
      if (filledUntil === end) break;
    }
    this.audioCursor = end;
    // Preserve unknown future metadata and skip timestamp-overlapping decoded samples.
    let keep = Math.min(this.audioMetadataSamples, this.audioSamplesReceived);
    for (const row of this.audioTimes)
      if (row.pts + row.samples > end)
        keep = Math.min(keep, row.index + Math.max(0, end - row.pts));
    this.trimAudio(keep);
    this.pruneAudio();
    return result;
  }
}
/** source is a trusted worker projection {slotKey, sourceId, url}; never log its URL. */
export function createInputSupervisor({
  source,
  quality = { ...DEFAULT_INPUT_QUALITY },
  clock = () => performance.now(),
  onObservation = () => {},
  ffmpeg = "ffmpeg",
  silenceThresholdDb,
  spawnProcess = spawn,
}) {
  let buffer = new LatestMediaBuffer(
    (quality.width * quality.height * 3) / 2,
  );
  let child,
    retryTimer,
    healthTimer,
    running = false,
    attempt = 0,
    terminal = false,
    ended = false,
    videoOnly = false,
    playbackStarted = false,
    prerollPaused = false,
    heldBuffer,
    heldAt,
    restarting = false,
    generation = 0,
    stopPromise;
  let videoAt = -Infinity,
    audioAt = -Infinity,
    audioTimingAt = -Infinity,
    audioPts = -Infinity,
    timedAudioObserved = false,
    frames = 0,
    failureSince = clock(),
    silenceSince,
    audioLevelDb;
  let startedAt = clock(),
    mediaPts = -Infinity,
    mediaProgressAt = -Infinity;
  const reset = () => {
    buffer.reset();
    videoAt = audioAt = audioTimingAt = audioPts = -Infinity;
    frames = 0;
    timedAudioObserved = false;
    mediaPts = mediaProgressAt = -Infinity;
    silenceSince = undefined;
    audioLevelDb = undefined;
  };
  function attachPlayback(value) {
    const beginPlayback = value.beginPlayback.bind(value);
    value.beginPlayback = () => {
      beginPlayback();
      if (playbackStarted || !running || terminal) return;
      playbackStarted = true;
      if (!prerollPaused) return;
      // FFmpeg 5.1 counts SIGSTOP time in -readrate's wall clock. A new
      // process must own the selected clock, or it races through the clip.
      heldBuffer = {
        frame: buffer.frame,
        beginPlayback() {},
        takeAudio: bytes => Buffer.alloc(bytes),
      };
      heldAt = clock();
      prerollPaused = false;
      restarting = true;
      const stopping = child, restartGeneration = ++generation;
      stopping.once("close", () => {
        if (!running || terminal || generation !== restartGeneration) return;
        child = undefined;
        restarting = false;
        buffer = new LatestMediaBuffer((quality.width * quality.height * 3) / 2);
        attachPlayback(buffer);
        connect();
      });
      stopping.kill("SIGKILL");
    };
  }
  attachPlayback(buffer);
  function getObservation() {
    const now = clock();
    timedAudioObserved ||= buffer.hasAudioTiming;
    let progressing =
      frames >= 2 &&
      buffer.frame !== undefined &&
      !buffer.timingFailed &&
      timedAudioObserved &&
      now - audioTimingAt < 1000 &&
      now - videoAt < 1000 &&
      now - audioAt < 1000 &&
      now - mediaProgressAt < 1000;
    if (progressing && source.finite && !playbackStarted && !prerollPaused) {
      // A prepared finite clip must not finish while the current program stays
      // on air. Keep a decoded frame/PCM tail and resume only at selection.
      prerollPaused = child?.kill("SIGSTOP") === true;
    }
    if (prerollPaused || restarting) progressing = false;
    if (heldBuffer && (progressing || now - heldAt >= 5000)) heldBuffer = undefined;
    const ready = progressing || heldBuffer !== undefined || (prerollPaused && buffer.frame !== undefined && buffer.hasAudioTiming);
    if (ready) failureSince = undefined;
    else {
      failureSince ??= now;
      silenceSince = undefined;
    }
    return {
      slotKey: source.slotKey,
      sourceId: source.sourceId,
      observedAt: now,
      ready,
      progressing,
      ...(ended ? { ended: true } : {}),
      analysisActive: progressing && audioLevelDb !== undefined,
      ...(failureSince === undefined ? {} : { failureSince }),
      ...(progressing && audioLevelDb !== undefined ? { audioLevelDb } : {}),
      ...(progressing && silenceSince !== undefined ? { silenceSince } : {}),
    };
  }
  function connect() {
    if (!running) return;
    reset();
    startedAt = clock();
    failureSince = startedAt;
    child = spawnProcess(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "info",
        "-nostdin",
        "-nostats",
        "-threads",
        "2",
        "-analyzeduration",
        "1000000",
        "-probesize",
        "1000000",
        ...(source.transport === "direct_media" ? ["-max_alloc", "67108864", "-max_pixels", "9437184", "-max_samples", "480000", "-max_streams", "16"] : []),
        ...(source.url.startsWith("http://127.0.0.1:")
          ? [...(source.transport === "direct_media" ? ["-f", source.demuxer] : ["-f", "mpegts"]), "-protocol_whitelist", "http,tcp,crypto", "-format_whitelist", "mpegts,hls,mov,matroska,webm,aac", "-rw_timeout", "5000000"]
          : []),
        // Buffered normalized input must not accelerate the selected media clock.
        "-readrate",
        "1",
        "-i",
        source.url,
        "-map",
        "0:v:0",
        "-vf",
        `settb=1/90000,showinfo,scale=${quality.width}:${quality.height}:force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
        "-fps_mode",
        "passthrough",
        "-threads",
        "2",
        "-f",
        "rawvideo",
        "pipe:3",
        ...(videoOnly ? [] : ["-map",
        "0:a:0",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-af",
        "aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,asettb=1/48000,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=Number_of_samples,ametadata=mode=print:direct=1:file='pipe\\:5'",
        "-f",
        "s16le",
        "pipe:4"]),
      ],
      { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe", "pipe"] },
    );
    const current = child,
      attemptGeneration = ++generation;
    let missingAudio = false, syntheticAudioIndex = 0;
    const owns = () =>
      running &&
      !terminal &&
      child === current &&
      generation === attemptGeneration;
    function matchedFrame() {
      if (buffer.frameCount === frames) return;
      frames = buffer.frameCount;
      videoAt = clock();
      if (videoOnly) {
        const samples = Math.max(1, Math.min(48000, Math.round(48000 / quality.frameRate)));
        const pts = Math.round(buffer.framePts * 48000 / 90000);
        buffer.audioTimestamp(syntheticAudioIndex++, pts, samples);
        buffer.audio(Buffer.alloc(samples * 4));
        audioAt = audioTimingAt = clock();
        audioLevelDb = -120;
      }
      const pts = buffer.framePts;
      if (Number.isSafeInteger(pts) && pts > mediaPts) {
        if (Number.isFinite(mediaPts)) mediaProgressAt = clock();
        mediaPts = pts;
      }
    }
    function checkTiming() {
      if (buffer.timingFailed && owns()) current.kill("SIGKILL");
    }
    // Integer PTS uses the explicit timebase, not rounded pts_time display text.
    boundedLines(
      child.stdio[2],
      4096,
      (line) => {
        if (!owns()) return;
        if (source.transport === "direct_media" && !videoOnly && /Stream map .0:a:0. matches no streams/.test(line)) missingAudio = true;
        const match = line.match(
          /^\[Parsed_showinfo_\d+ @ [^\]]+\]\s+n:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:/,
        );
        if (!match) return;
        buffer.videoTimestamp(Number(match[1]), Number(match[2]));
        matchedFrame();
        checkTiming();
      },
      () => {
        if (owns()) {
          buffer.failTiming();
          checkTiming();
        }
      },
    );
    // Audio metadata has its own bounded pipe and cannot affect video progress.
    let pendingAudio;
    boundedLines(
      child.stdio[5],
      1024,
      (line) => {
        if (!owns()) return;
        const header = line.match(
          /^frame:(\d+)\s+pts:(-?\d+)\s+pts_time:[^ ]+$/,
        );
        if (header && !pendingAudio) {
          pendingAudio = { index: Number(header[1]), pts: Number(header[2]) };
          return;
        }
        const samples = line.match(
          /^lavfi\.astats\.Overall\.Number_of_samples=([\d.]+)$/,
        );
        if (!samples || !pendingAudio) {
          buffer.failTiming();
          checkTiming();
          return;
        }
        buffer.audioTimestamp(
          pendingAudio.index,
          pendingAudio.pts,
          Number(samples[1]),
        );
        if (pendingAudio.pts > audioPts) {
          audioPts = pendingAudio.pts;
          audioTimingAt = clock();
        }
        pendingAudio = undefined;
        checkTiming();
      },
      () => {
        if (owns()) {
          buffer.failTiming();
          checkTiming();
        }
      },
    );
    child.stdio[3].on("data", (chunk) => {
      if (!owns()) return;
      buffer.video(chunk);
      matchedFrame();
    });
    child.stdio[4].on("data", (data) => {
      if (!owns()) return;
      const chunk = buffer.audio(data);
      if (!chunk.length) return;
      audioAt = clock();
      let sum = 0;
      for (let i = 0; i + 1 < chunk.length; i += 2) {
        const x = chunk.readInt16LE(i) / 32768;
        sum += x * x;
      }
      audioLevelDb = Math.max(
        -120,
        10 * Math.log10(sum / Math.max(1, Math.floor(chunk.length / 2))),
      );
      // Accumulate only with progressing decoded A/V and an explicitly calibrated threshold.
      if (
        getObservation().progressing &&
        Number.isFinite(silenceThresholdDb) &&
        audioLevelDb < silenceThresholdDb
      )
        silenceSince ??= clock();
      else silenceSince = undefined;
    });
    child.on("error", () => {}); // close also fires for spawn failure; diagnostics intentionally omit URLs.
    child.once("close", (code) => {
      if (!owns()) return;
      child = undefined;
      if (missingAudio && !videoOnly) { videoOnly = true; connect(); return; }
      if (source.transport === "direct_media" && (code === 0 || (source.finite && (frames > 0 || playbackStarted)))) { terminal = true; ended = true; }
      heldBuffer = undefined;
      reset();
      failureSince ??= clock();
      onObservation(getObservation());
      if (running && !terminal)
        retryTimer = setTimeout(() => {
          if (running && !terminal && generation === attemptGeneration)
            connect();
        }, reconnectDelay(attempt++));
    });
  }
  return {
    source,
    get buffer() { return heldBuffer ?? buffer; },
    getObservation,
    start() {
      if (running || terminal) return;
      running = true;
      connect();
      healthTimer = setInterval(() => {
        const observation = getObservation();
        onObservation(observation);
        if (observation.ready && clock() - startedAt > 10000) attempt = 0;
        // A hung demuxer has a deadline too. Never keep a socket forever without decoded media.
        if (
          child && !prerollPaused && !restarting &&
          clock() -
            Math.max(
              startedAt,
              Math.min(videoAt, audioAt, audioTimingAt, mediaProgressAt),
            ) >
            5000
        )
          child.kill("SIGKILL");
      }, 250);
    },
    stop() {
      if (stopPromise) return stopPromise;
      terminal = true;
      generation++;
      running = false;
      clearTimeout(retryTimer);
      clearInterval(healthTimer);
      const stopping = child;
      heldBuffer = undefined;
      reset();
      failureSince ??= clock();
      stopPromise = stopping
        ? new Promise((resolve) => {
            stopping.once("close", resolve);
            stopping.kill("SIGKILL");
          })
        : Promise.resolve();
      return stopPromise;
    },
  };
}

// Never retain provider stderr or an unterminated metadata line without a bound.
function boundedLines(stream, limit, onLine, overflow) {
  let line = "",
    failed = false;
  stream.on("data", (chunk) => {
    if (failed) return;
    for (const byte of chunk) {
      if (byte === 10 || byte === 13) {
        if (line) onLine(line);
        line = "";
      } else if (line.length >= limit) {
        failed = true;
        line = "";
        overflow();
        return;
      } else line += String.fromCharCode(byte);
    }
  });
}
