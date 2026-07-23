/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — SHARED DATA
   Images are served from the "portfolio" R2 bucket (see js/config.js for
   the bucket layout and public URL). Each project's cover + gallery photos
   live in that project's own R2 folder; the atmospheric home-page images
   (hero, philosophy, service tiles) come from the home/ folder.
───────────────────────────────────────────────────────────────────────── */

const IMGS = {
  hero:       HOME_IMAGES[0],  // lan(18)
  philosophy: HOME_IMAGES[1],  // lan(17)
  sWedding:   HOME_IMAGES[2],  // lan(16)
  sPortrait:  HOME_IMAGES[3],  // lan(15)
  sEditorial: HOME_IMAGES[4],  // lan(14)
  about:      PHOTOGRAPHER_IMAGE,
};

const CATS = ["ALL", "WEDDINGS", "PORTRAITS", "EDITORIAL", "ELOPEMENTS", "FASHION", "GRADUATIONS"];

const FAQS = [
  { q: "How far in advance should I book?",   a: "For weddings, 12–18 months in advance. Portrait sessions are available 4–6 weeks ahead. Editorial projects vary — reach out to discuss your timeline." },
  { q: "Do you travel for shoots?",            a: "Yes. Timly Photography is based in Johannesburg but available worldwide. Travel fees apply for shoots outside of Gauteng." },
  { q: "What is your editing style?",          a: "Cinematic and film-inspired. Natural light is prioritized, shadows are preserved, and skin tones are kept warm and true. We never over-edit." },
  { q: "How long until I receive my images?",  a: "Wedding galleries are delivered within 8–10 weeks. Portrait sessions within 2–3 weeks. Edited highlights previewed within 72 hours." },
  { q: "Do you offer payment plans?",          a: "Yes. A 30% deposit secures your date; the remainder is split into installments leading up to your shoot date." },
];

/* Real enquiries come from the Worker's D1-backed /enquiries endpoint
   (see js/admin.js renderEnquiriesPanel) — nothing hardcoded here anymore. */

/* ─── PROJECT STORE ──────────────────────────────────────────────────────
   Real projects live in D1 behind the Worker's /projects route (see
   worker/src/routes/projects.js) — that's the source of truth. localStorage
   here is only a read-through cache so getAll() can stay synchronous for
   the many call sites that already expect it (home.js, main.js,
   usePortfolioImages.js) without rewriting the image/infinite-scroll
   pipeline to be async.

   refresh() is called once per page load (see main.js) to pull the real
   list in the background; until it resolves — or if the Worker/D1 isn't
   configured yet — getAll() serves the last-known cache, which starts
   empty rather than fictional demo projects. */

const ProjectStore = {
  KEY: "timly_projects_cache",
  _cache: null,

  _loadCache() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this._cache = JSON.parse(raw); return this._cache; }
    } catch (e) { /* ignore corrupt storage */ }
    this._cache = [];
    return this._cache;
  },

  _saveCache(projects) {
    this._cache = projects;
    try { localStorage.setItem(this.KEY, JSON.stringify(projects)); } catch (e) { /* storage full/unavailable */ }
  },

  getAll() {
    return this._loadCache();
  },

  getById(id) {
    return this._loadCache().find(p => p.id === id) || null;
  },

  /** Admin-only write path funnels through here to keep the cache in sync
      after a Worker call succeeds — see js/admin.js. */
  setAll(projects) {
    this._saveCache(projects);
  },

  /** @param {(projects: object[]) => void} [onUpdate] called only if the fetch
      actually changed something worth re-rendering for. */
  async refresh(onUpdate) {
    if (typeof R2_WORKER_URL !== "string" || !R2_WORKER_URL) return;
    try {
      const res = await fetch(`${R2_WORKER_URL}/projects`);
      if (!res.ok) return; // 503 = D1 not configured yet; keep serving the cache
      const data = await res.json();
      if (!Array.isArray(data.projects)) return;
      this._saveCache(data.projects);
      if (onUpdate) onUpdate(data.projects);
    } catch (e) { /* offline, or Worker not deployed yet — keep serving the cache */ }
  },
};
