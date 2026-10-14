import { frameRuntime } from './frame-runtime.ts';
type Upload = { live: () => boolean; run: () => void };
const pending: Upload[] = [];
export function scheduleUpload(live: () => boolean, run: () => void) {
  pending.push({ live, run });
  frameRuntime.wake('uploads', Infinity);
}
/** The canvas owns GPU preparation: at most two admitted texture uploads per rendered frame. */
export function drainUploads(limit = 2) {
  let admitted = 0;
  while (pending.length && admitted < limit) {
    const job = pending.shift()!;
    if (job.live()) {
      job.run();
      admitted++;
    }
  }
  if (!pending.length) {
    frameRuntime.release('uploads');
  }
  return admitted;
}
export function cancelUploads() {
  pending.length = 0;
  frameRuntime.release('uploads');
}
