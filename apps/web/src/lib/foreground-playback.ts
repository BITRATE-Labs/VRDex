/** Synchronous handoff before audible Play. A stopped participant cannot release its successor. */
export class ForegroundPlayback {
  private current?: { identity: object; stop: () => void };
  private audioSession?: { session: { type: string }; previous: string };
  acquire(identity: object, stop: () => void) {
    if (this.current?.identity === identity) return;
    const previous = this.current;
    this.current = { identity, stop };
    if (!this.audioSession) {
      try {
        const session = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) {
          const previous = session.type;
          session.type = "playback";
          this.audioSession = { session, previous };
        }
      } catch { /* Audio Session is optional; ordinary playback remains available. */ }
    }
    previous?.stop();
  }
  release(identity: object) {
    if (this.current?.identity !== identity) return;
    this.current = undefined;
    const owned = this.audioSession;
    this.audioSession = undefined;
    try { if (owned?.session.type === "playback") owned.session.type = owned.previous; }
    catch { /* A browser may revoke access while the page is being closed. */ }
  }
}
export const foregroundPlayback = new ForegroundPlayback();
