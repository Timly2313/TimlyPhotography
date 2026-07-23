/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — <portfolio-image>
   Usage:
     <portfolio-image src="Portfolio/x/cover.jpg" alt="…" aspect="3/4"></portfolio-image>
     <portfolio-image src="…" alt="…" priority="high"></portfolio-image>

   Attributes:
     src        canonical image URL (required)
     alt        accessible alt text
     aspect     CSS aspect-ratio, e.g. "3/4" — reserves layout space so
                nothing shifts as images load in
     priority   "high" loads immediately and skips lazy-unload; default
                is lazy (loads ~800px before entering viewport, unloads
                ~800px after leaving it to keep memory bounded)

   One shared IntersectionObserver drives every instance on the page —
   not one per element — so this scales to a gallery of thousands.
───────────────────────────────────────────────────────────────────────── */

const PI_LOAD_MARGIN = "800px 0px 800px 0px";

class PortfolioImageElement extends HTMLElement {
  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    this._loaded = false;
    this._loading = false;
    this._retries = 0;
    this._abortController = null;
    this._render();

    if (this.getAttribute("priority") === "high") {
      this._startLoad();
    } else {
      PortfolioImageElement._observer().observe(this);
    }
  }

  disconnectedCallback() {
    PortfolioImageElement._observer().unobserve(this);
    this._abort();
    this._releaseBlob();
  }

  static _observer() {
    if (!PortfolioImageElement.__observer) {
      PortfolioImageElement.__observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const el = entry.target;
            if (entry.isIntersecting) el._enterZone();
            else el._exitZone();
          });
        },
        { rootMargin: PI_LOAD_MARGIN }
      );
    }
    return PortfolioImageElement.__observer;
  }

  _render() {
    const aspect = this.getAttribute("aspect");
    this.classList.add("pi-frame");
    if (this.hasAttribute("intrinsic")) {
      // Masonry-style contexts: no ancestor gives this element a height,
      // so it needs to size itself from the photo's own aspect ratio.
      // Start from a reasonable guess (or the caller's hint) so nothing
      // collapses to 0px while loading, then correct it once the real
      // image dimensions are known — one small reflow, not a collapse.
      this.classList.add("pi-frame--intrinsic");
      this.style.aspectRatio = aspect || "3 / 4";
    } else if (aspect) {
      this.style.aspectRatio = aspect;
    }

    this.innerHTML = `
      <div class="pi-shimmer"></div>
      <img class="pi-placeholder" aria-hidden="true" alt="" />
      <img class="pi-main" alt="${this.getAttribute("alt") || ""}" />
      <div class="pi-retry hidden">
        <button type="button" class="pi-retry__btn" aria-label="Retry loading image">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    `;

    this._shimmer = this.querySelector(".pi-shimmer");
    this._placeholderImg = this.querySelector(".pi-placeholder");
    this._mainImg = this.querySelector(".pi-main");
    this._retryUi = this.querySelector(".pi-retry");
    this._retryUi.querySelector("button").addEventListener("click", () => this.retry());

    const lqip = typeof cdnPlaceholderUrl === "function" ? cdnPlaceholderUrl(this.getAttribute("src")) : null;
    if (lqip) {
      this._placeholderImg.src = lqip;
      this._placeholderImg.classList.add("visible");
      this._shimmer.classList.add("hidden");
    }
  }

  _enterZone() {
    if (!this._loaded && !this._loading) this._startLoad();
  }

  _exitZone() {
    if (this._loaded && this.getAttribute("priority") !== "high") this._unload();
  }

  async _startLoad() {
    this._loading = true;
    this._retryUi.classList.add("hidden");
    this._abortController = new AbortController();

    const width = this.clientWidth || 400;
    const size = typeof pickSizeForWidth === "function" ? pickSizeForWidth(width) : "medium";
    const rawSrc = this.getAttribute("src");
    const url = typeof cdnUrl === "function" ? cdnUrl(rawSrc, size) : rawSrc;
    // Once an element actually starts loading — whether because it was
    // marked priority="high" or because it just entered the lazy-load
    // zone — it's about to be seen, so it always competes for the fast
    // lane. The slow lane is reserved for ImageLoader.prefetch() calls
    // fetching images speculatively, well ahead of when they're needed.
    const priority = "high";

    try {
      const result = await ImageLoader.load(url, { priority, signal: this._abortController.signal });
      this._applyImage(result.blobUrl);
      this._loaded = true;
      this._retries = 0;
    } catch (err) {
      if (err.name === "AbortError") { this._loading = false; return; }
      // fetch()-based loading can fail for reasons that have nothing to do
      // with the image itself — most notably, browsers block fetch() from
      // a file:// page to other local files by default, even though a
      // plain <img src> to that same file works fine. Rather than show a
      // false failure, fall back to native <img> loading (no caching this
      // time, but the photo still shows) before giving up for real.
      this._loadNative(url);
    } finally {
      this._loading = false;
    }
  }

  _loadNative(url) {
    this._mainImg.onload = () => {
      this._mainImg.classList.add("loaded");
      this._placeholderImg.classList.add("hide");
      this._shimmer.classList.add("hidden");
      if (this.hasAttribute("intrinsic") && this._mainImg.naturalWidth) {
        this.style.aspectRatio = `${this._mainImg.naturalWidth} / ${this._mainImg.naturalHeight}`;
      }
      this._loaded = true;
      this._retries = 0;
      this.dispatchEvent(new CustomEvent("pi-load", { bubbles: true }));
    };
    this._mainImg.onerror = () => this._showRetry();
    this._mainImg.src = url;
  }

  _applyImage(blobUrl) {
    this._releaseBlob();
    this._mainImg.src = blobUrl;
    this._mainImg.decode().catch(() => {}).finally(() => {
      this._mainImg.classList.add("loaded");
      this._placeholderImg.classList.add("hide");
      this._shimmer.classList.add("hidden");
      if (this.hasAttribute("intrinsic") && this._mainImg.naturalWidth) {
        this.style.aspectRatio = `${this._mainImg.naturalWidth} / ${this._mainImg.naturalHeight}`;
      }
    });
    this.dispatchEvent(new CustomEvent("pi-load", { bubbles: true }));
  }

  _showRetry() {
    this._retryUi.classList.remove("hidden");
    this.dispatchEvent(new CustomEvent("pi-error", { bubbles: true }));
  }

  _unload() {
    this._releaseBlob();
    this._mainImg.removeAttribute("src");
    this._mainImg.classList.remove("loaded");
    if (!this._placeholderImg.classList.contains("visible")) this._shimmer.classList.remove("hidden");
    this._placeholderImg.classList.remove("hide");
    this._loaded = false;
  }

  _releaseBlob() {
    if (this._mainImg && this._mainImg.src && this._mainImg.src.startsWith("blob:")) {
      URL.revokeObjectURL(this._mainImg.src);
    }
  }

  _abort() {
    if (this._abortController) this._abortController.abort();
  }

  /** Public: retry after a load failure. */
  retry() {
    this._retries++;
    this._startLoad();
  }
}

customElements.define("portfolio-image", PortfolioImageElement);
