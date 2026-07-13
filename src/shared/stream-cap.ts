/**
 * Cap captured stdout/stderr so a huge subprocess dump cannot pin the main process.
 * Shared by git and gh spawn helpers.
 */

export const DEFAULT_CAPTURE_MAX_BYTES = 8 * 1024 * 1024;

export interface CaptureBuffers {
  stdout: string;
  stderr: string;
  truncated: boolean;
  maxBytes: number;
}

export function createCaptureBuffers(maxBytes = DEFAULT_CAPTURE_MAX_BYTES): CaptureBuffers {
  return { stdout: "", stderr: "", truncated: false, maxBytes };
}

/** Append a chunk to stdout or stderr; marks truncated when the cap is hit. */
export function appendCapture(
  buf: CaptureBuffers,
  target: "stdout" | "stderr",
  chunk: Buffer | string,
): void {
  if (buf.truncated) return;
  const text = typeof chunk === "string" ? chunk : chunk.toString();
  const next = buf[target] + text;
  if (next.length > buf.maxBytes) {
    buf[target] = next.slice(0, buf.maxBytes);
    buf.truncated = true;
    return;
  }
  buf[target] = next;
}

export function captureOverflowError(buf: CaptureBuffers, label = "output"): string {
  return buf.stderr || `${label} exceeded ${buf.maxBytes} bytes`;
}

const ROLLING_OMISSION = "… earlier content omitted …\n";

/** Keep the newest text under a hard character budget with one stable marker. */
export function appendRollingText(current: string, chunk: string, maxChars: number): string {
  if (maxChars <= ROLLING_OMISSION.length) {
    return (current + chunk).slice(-Math.max(0, maxChars));
  }
  const wasOmitted = current.startsWith(ROLLING_OMISSION);
  const prior = wasOmitted
    ? current.slice(ROLLING_OMISSION.length)
    : current;
  const next = prior + chunk;
  if (!wasOmitted && next.length <= maxChars) return next;
  return ROLLING_OMISSION + next.slice(-(maxChars - ROLLING_OMISSION.length));
}
