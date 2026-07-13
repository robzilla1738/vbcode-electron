/**
 * Serialize stdin writes behind Node stream backpressure.
 * When `write` returns false, further chunks wait for `drain` before flush.
 *
 * `clear()` bumps an epoch so a drain resume registered for a retired host
 * cannot flush the next host's payloads with the old write function (host recycle).
 */

export type WriteFn = (chunk: string) => boolean;

export class StdinWriteQueue {
  private queue: string[] = [];
  private waitingForDrain = false;
  /** Bumped on every clear(); drain resumes capture the epoch at registration. */
  private epoch = 0;

  get pending(): number {
    return this.queue.length;
  }

  get isWaitingForDrain(): boolean {
    return this.waitingForDrain;
  }

  /** Test/diagnostic: current generation used to invalidate drain resumes. */
  get generation(): number {
    return this.epoch;
  }

  /** Enqueue a payload and flush until backpressure or empty. */
  enqueue(chunk: string, write: WriteFn, onNeedDrain: (resume: () => void) => void): void {
    this.queue.push(chunk);
    this.flush(write, onNeedDrain);
  }

  clear(): void {
    this.queue = [];
    this.waitingForDrain = false;
    this.epoch += 1;
  }

  private flush(write: WriteFn, onNeedDrain: (resume: () => void) => void): void {
    if (this.waitingForDrain) return;
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      const ok = write(next);
      this.queue.shift();
      if (!ok) {
        this.waitingForDrain = true;
        const epochAtRegister = this.epoch;
        onNeedDrain(() => {
          // Host was stopped/replaced — ignore this drain; a new enqueue owns flush.
          if (epochAtRegister !== this.epoch) return;
          this.waitingForDrain = false;
          this.flush(write, onNeedDrain);
        });
        return;
      }
    }
  }
}
