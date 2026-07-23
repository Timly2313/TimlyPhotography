/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — PORTFOLIO IMAGE QUERY CACHE
   A vanilla-JS stand-in for TanStack Query's cache semantics (staleTime,
   gcTime, background refresh, subscriber notification) applied to the
   site's local data (ProjectStore) — plus a generic infinite-scroll
   helper that pages a list and prefetches the next page's images while
   the user scrolls, exactly as it would against a real paginated API.
───────────────────────────────────────────────────────────────────────── */

const QUERY_STALE_TIME_MS = 10 * 60 * 1000; // matches spec: staleTime 10 min
const QUERY_GC_TIME_MS = 60 * 60 * 1000;    // matches spec: gcTime 1 hour
const PAGE_SIZE = 24;                        // within the requested 20-30 range
const PREFETCH_AHEAD = 16;                   // within the requested 10-20 range

class PaginatedQuery {
  /** @param {{ source: () => any[], pageSize?: number, staleTime?: number, gcTime?: number }} opts */
  constructor({ source, pageSize = PAGE_SIZE, staleTime = QUERY_STALE_TIME_MS, gcTime = QUERY_GC_TIME_MS }) {
    this.source = source;
    this.pageSize = pageSize;
    this.staleTime = staleTime;
    this.gcTime = gcTime;
    this.items = null;
    this.fetchedAt = 0;
    this.subscribers = new Set();
    this._gcTimer = null;
  }

  /** @param {(items: any[]) => void} cb */
  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  _notify() { this.subscribers.forEach(cb => cb(this.items)); }

  _key(items) { return items.map(i => (i && i.id != null ? i.id : i)).join(","); }

  _ensureFresh() {
    const now = Date.now();
    if (!this.items) {
      this.items = this.source();
      this.fetchedAt = now;
    } else if (now - this.fetchedAt > this.staleTime) {
      // Stale-while-revalidate: current page render keeps using this.items
      // synchronously; the refresh happens next tick and only triggers a
      // re-render (via subscribers) if the data actually changed.
      const prevKey = this._key(this.items);
      queueMicrotask(() => {
        const fresh = this.source();
        this.items = fresh;
        this.fetchedAt = Date.now();
        if (this._key(fresh) !== prevKey) this._notify();
      });
    }
    this._armGc();
  }

  _armGc() {
    clearTimeout(this._gcTimer);
    this._gcTimer = setTimeout(() => { this.items = null; }, this.gcTime);
  }

  /** @param {number} pageIndex zero-based */
  getPage(pageIndex) {
    this._ensureFresh();
    const start = pageIndex * this.pageSize;
    return {
      items: this.items.slice(start, start + this.pageSize),
      hasMore: start + this.pageSize < this.items.length,
      total: this.items.length,
    };
  }

  /** Force a synchronous refresh (e.g. right after an Admin edit). */
  invalidate() {
    this.items = this.source();
    this.fetchedAt = Date.now();
    this._notify();
  }
}

/** @returns {PaginatedQuery} projects list, newest first (matches ProjectStore ordering) */
function createProjectsQuery(filterFn) {
  return new PaginatedQuery({ source: () => (filterFn ? ProjectStore.getAll().filter(filterFn) : ProjectStore.getAll()) });
}

/** @param {object} project @returns {PaginatedQuery} that project's full image list (cover + gallery) */
function createGalleryQuery(project) {
  return new PaginatedQuery({ source: () => [project.image, ...project.galleryImages] });
}

/**
 * Wires infinite scroll: renders pages via onPage() as a sentinel element
 * nears the viewport, and prefetches the next page's images ahead of the
 * scroll so they're already cache-warm by the time they're needed.
 * @param {{
 *   sentinel: HTMLElement,
 *   query: PaginatedQuery,
 *   onPage: (items: any[], pageIndex: number, hasMore: boolean) => void,
 *   getUrls?: (item: any) => string[]
 * }} opts
 * @returns {{ disconnect: () => void }}
 */
function attachInfiniteScroll({ sentinel, query, onPage, getUrls }) {
  let pageIndex = 0;
  let loading = false;
  let done = false;

  function loadNext() {
    if (loading || done) return;
    loading = true;
    const { items, hasMore, total } = query.getPage(pageIndex);
    onPage(items, pageIndex, hasMore);

    if (getUrls) {
      const nextPage = query.getPage(pageIndex + 1);
      const nextUrls = nextPage.items.slice(0, PREFETCH_AHEAD).flatMap(getUrls);
      if (nextUrls.length) ImageLoader.prefetch(nextUrls);
    }

    pageIndex++;
    done = !hasMore || pageIndex * query.pageSize >= total;
    loading = false;
    if (done) observer.disconnect();
  }

  const observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) loadNext();
  }, { rootMargin: "600px 0px 600px 0px" });

  observer.observe(sentinel);
  loadNext(); // render the first page immediately, don't wait for a scroll event

  return { disconnect: () => observer.disconnect() };
}
