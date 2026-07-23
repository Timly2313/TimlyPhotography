/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — IMAGE LOADER
   Cache-first loading with two priority lanes so a fast scroll never gets
   stuck behind a queue of prefetches: visible images (HIGH) always get a
   free connection slot before background prefetches (LOW) do. Requests
   for the same URL are de-duplicated, and every request is cancellable
   (used when an image scrolls out of view before it finishes loading).
───────────────────────────────────────────────────────────────────────── */

const MAX_CONCURRENT_HIGH = 6;
const MAX_CONCURRENT_LOW = 2;

class PriorityQueue {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  /**
   * @param {() => Promise<any>} task
   * @param {string} [url] - tag for later cancelQueued() matching
   */
  run(task, url) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, url, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;
    const { task, resolve, reject } = this.queue.shift();
    this.active++;
    task()
      .then(resolve, reject)
      .finally(() => { this.active--; this._pump(); });
  }

  /** Drop queued-but-not-started work whose url is in the given set; running work is unaffected. */
  cancelQueued(urlSet) {
    this.queue = this.queue.filter(item => {
      if (item.url && urlSet.has(item.url)) {
        item.reject(new DOMException("Cancelled", "AbortError"));
        return false;
      }
      return true;
    });
  }
}

const highQueue = new PriorityQueue(MAX_CONCURRENT_HIGH);
const lowQueue = new PriorityQueue(MAX_CONCURRENT_LOW);
const inFlight = new Map(); // url -> Promise, de-dupes concurrent requests for the same image

const ImageLoader = {
  /**
   * @param {string} url
   * @param {{ priority?: "high"|"low", signal?: AbortSignal }} [opts]
   * @returns {Promise<{ blobUrl: string, meta: object, fromCache: boolean }>}
   */
  async load(url, opts = {}) {
    const { priority = "high", signal } = opts;

    const cached = await ImageCache.read(url);
    if (cached) {
      if (cached.stale) {
        // Serve immediately, refresh silently — never block the paint on this.
        ImageCache.revalidate(url).catch(() => {});
      }
      return { blobUrl: cached.blobUrl, meta: cached.meta, fromCache: true };
    }

    if (signal && signal.aborted) throw new DOMException("Cancelled", "AbortError");

    if (inFlight.has(url)) return inFlight.get(url);

    const queue = priority === "high" ? highQueue : lowQueue;
    const promise = queue
      .run(() => {
        if (signal && signal.aborted) throw new DOMException("Cancelled", "AbortError");
        return ImageCache.fetchAndStore(url, { signal });
      }, url)
      .then(result => ({ ...result, fromCache: false }))
      .finally(() => inFlight.delete(url));

    inFlight.set(url, promise);
    return promise;
  },

  /**
   * Fire-and-forget low-priority prefetch for a batch of URLs (the "next
   * 10-20 images" while scrolling). Returns a cancel() to drop anything
   * in this batch that hasn't started fetching yet.
   * @param {string[]} urls
   */
  prefetch(urls) {
    const pending = new Set(urls);

    urls.forEach(url => {
      if (inFlight.has(url)) return;
      const promise = ImageCache.read(url)
        .then(cached => {
          if (cached) return; // already have it, nothing to prefetch
          return lowQueue.run(() => ImageCache.fetchAndStore(url).then(() => {}), url);
        })
        .catch(() => {})
        .finally(() => { inFlight.delete(url); pending.delete(url); });
      inFlight.set(url, promise);
    });

    return {
      cancel: () => lowQueue.cancelQueued(pending),
    };
  },
};
