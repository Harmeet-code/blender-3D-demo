/** Bound async decode/build/prepare work. Disposed generations cannot publish stale results. */
export class WorkAdmission {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(readonly concurrency = 2) {}
  run<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        const index = this.queue.indexOf(start);
        if (index >= 0) {
          this.queue.splice(index, 1);
          reject(new DOMException('Aborted', 'AbortError'));
          signal?.removeEventListener('abort', abort);
        }
      };
      const start = () => {
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        this.active++;
        Promise.resolve()
          .then(job)
          .then((value) => {
            if (signal?.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
            } else {
              resolve(value);
            }
          }, reject)
          .finally(() => {
            this.active--;
            this.next();
          });
      };
      this.queue.push(start);
      signal?.addEventListener('abort', abort, { once: true });
      this.next();
    });
  }
  private next() {
    while (this.active < this.concurrency && this.queue.length) {
      this.queue.shift()!();
    }
  }
  snapshot() {
    return { active: this.active, queued: this.queue.length };
  }
}
export const assetAdmission = new WorkAdmission(2);
export const shaderAdmission = new WorkAdmission(1);
