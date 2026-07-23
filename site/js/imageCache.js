/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — PERSISTENT IMAGE CACHE
   Two-tier persistent cache, both disk-backed (never memory-only):
     - Cache API   → the actual image bytes (survives reloads + restarts,
                     this is the web platform's equivalent of Expo
                     FileSystem's downloaded-file store)
     - IndexedDB   → per-URL metadata: ETag, Last-Modified, cached-at,
                     byte size (equivalent of AsyncStorage/MMKV)
   A cached image is only ever re-downloaded when the URL changes, the
   ETag/Last-Modified from a revalidation request changes, or the entry
   has passed MAX_AGE_MS (gcTime-equivalent hard eviction).
───────────────────────────────────────────────────────────────────────── */

const IMAGE_CACHE_NAME = "timly-images-v1";
const DB_NAME = "timly-image-cache";
const DB_VERSION = 1;
const STORE_NAME = "metadata";

const STALE_TIME_MS = 10 * 60 * 1000;   // revalidate in the background after this
const MAX_AGE_MS = 60 * 60 * 1000;      // hard-evict after this (gcTime-equivalent)

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "url" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // degrade to no-metadata rather than crash
  });
  return dbPromise;
}

async function idbGet(url) {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(url);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(meta) {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDelete(url) {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbAll() {
  const db = await openDb();
  if (!db) return [];
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

const ImageCache = {
  /**
   * Cache-first read. Returns a usable object URL immediately if a fresh
   * or stale-but-present entry exists (stale entries are still returned —
   * the caller can trigger revalidate() in the background), or null on a
   * genuine cache miss.
   * @param {string} url
   * @returns {Promise<{ blobUrl: string, meta: object, stale: boolean } | null>}
   */
  async read(url) {
    const meta = await idbGet(url);
    if (!meta) return null;

    if (!("caches" in window)) return null;
    let res;
    try {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      res = await cache.match(url);
    } catch (e) {
      return null; // Cache API unavailable for this URL scheme/context — treat as a miss
    }
    if (!res) { await idbDelete(url); return null; } // metadata without bytes — inconsistent, drop it

    const age = Date.now() - meta.cachedAt;
    if (age > MAX_AGE_MS) {
      await this.evict(url);
      return null;
    }

    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), meta, stale: age > STALE_TIME_MS };
  },

  /**
   * Fetch (respecting an AbortSignal), store into both cache tiers, and
   * return an object URL. This is the only place that actually issues a
   * fresh network request for an image.
   * @param {string} url
   * @param {{ signal?: AbortSignal }} [opts]
   */
  async fetchAndStore(url, opts = {}) {
    const res = await fetch(url, { signal: opts.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);

    // Persisting to the Cache API is best-effort: it throws for file://
    // (unsupported scheme there), and can also fail under strict private
    // browsing or a full storage quota. None of that should ever stop the
    // image the user actually asked for from displaying.
    if ("caches" in window) {
      try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        await cache.put(url, res.clone());
      } catch (e) { /* no persistent cache this time — image still loads below */ }
    }

    const meta = {
      url,
      etag: res.headers.get("ETag") || null,
      lastModified: res.headers.get("Last-Modified") || null,
      cachedAt: Date.now(),
      size: Number(res.headers.get("Content-Length")) || null,
    };
    await idbPut(meta);

    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), meta };
  },

  /**
   * Background revalidation: conditional request using the stored
   * ETag/Last-Modified. 304 just refreshes cachedAt (cheap, no body
   * transferred); any other 2xx means the source changed, so re-store it.
   * @param {string} url
   * @returns {Promise<{ changed: boolean, blobUrl?: string }>}
   */
  async revalidate(url) {
    const meta = await idbGet(url);
    if (!meta) return { changed: false };

    const headers = {};
    if (meta.etag) headers["If-None-Match"] = meta.etag;
    if (meta.lastModified) headers["If-Modified-Since"] = meta.lastModified;

    let res;
    try {
      res = await fetch(url, { headers, credentials: "omit" });
    } catch (e) {
      return { changed: false }; // offline/network error — keep serving what we have
    }

    if (res.status === 304) {
      meta.cachedAt = Date.now();
      await idbPut(meta);
      return { changed: false };
    }
    if (!res.ok) return { changed: false };

    if ("caches" in window) {
      try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        await cache.put(url, res.clone());
      } catch (e) { /* best-effort, see fetchAndStore() */ }
    }
    const newMeta = {
      url,
      etag: res.headers.get("ETag") || null,
      lastModified: res.headers.get("Last-Modified") || null,
      cachedAt: Date.now(),
      size: Number(res.headers.get("Content-Length")) || null,
    };
    await idbPut(newMeta);
    const blob = await res.blob();
    return { changed: true, blobUrl: URL.createObjectURL(blob) };
  },

  async evict(url) {
    await idbDelete(url);
    if ("caches" in window) {
      try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        await cache.delete(url);
      } catch (e) { /* best-effort, see fetchAndStore() */ }
    }
  },

  /** Sweep entries older than MAX_AGE_MS. Safe to call on a timer/idle callback. */
  async evictExpired() {
    const all = await idbAll();
    const now = Date.now();
    await Promise.all(
      all.filter(m => now - m.cachedAt > MAX_AGE_MS).map(m => this.evict(m.url))
    );
  },

  async clearAll() {
    const all = await idbAll();
    await Promise.all(all.map(m => this.evict(m.url)));
  },
};

// Idle-time housekeeping so the cache doesn't grow without bound.
if ("requestIdleCallback" in window) {
  requestIdleCallback(() => ImageCache.evictExpired());
} else {
  setTimeout(() => ImageCache.evictExpired(), 3000);
}
