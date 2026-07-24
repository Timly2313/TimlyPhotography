/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — SHARED BEHAVIOUR
   Loader, cursor, navbar, project modal, lightbox, project card rendering.
   Ported from the interaction logic in src/app/App.tsx.
───────────────────────────────────────────────────────────────────────── */

const GOLD_ICON_COLOR = "#C9A020";

/* ─── LOADER ────────────────────────────────────────────────────────────── */

function initLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;

  if (sessionStorage.getItem("timly_loaded")) {
    loader.classList.add("hidden");
    document.body.classList.remove("no-scroll");
    return;
  }

  document.body.classList.add("no-scroll");
  const countEl = loader.querySelector(".loader__count");
  const barFill = loader.querySelector(".loader__bar-fill");
  let frame = 0;
  const total = 90;

  function tick() {
    frame++;
    const eased = 1 - Math.pow(1 - frame / total, 3);
    const pct = Math.min(Math.floor(eased * 100), 100);
    countEl.textContent = pct + "%";
    barFill.style.width = pct + "%";
    if (frame < total) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        loader.classList.add("exiting");
        setTimeout(() => {
          loader.classList.add("hidden");
          document.body.classList.remove("no-scroll");
          sessionStorage.setItem("timly_loaded", "yes");
        }, 900);
      }, 320);
    }
  }
  requestAnimationFrame(tick);
}

/* ─── CUSTOM CURSOR ─────────────────────────────────────────────────────── */

function initCursor() {
  if ("ontouchstart" in window) return;
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (!dot || !ring) return;

  const mouse = { x: 0, y: 0 };
  const lag = { x: 0, y: 0 };
  const lerp = (a, b, t) => a + (b - a) * t;

  window.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function tick() {
    lag.x = lerp(lag.x, mouse.x, 0.12);
    lag.y = lerp(lag.y, mouse.y, 0.12);
    dot.style.transform = `translate(${mouse.x - 4}px, ${mouse.y - 4}px)`;
    ring.style.transform = `translate(${lag.x - 20}px, ${lag.y - 20}px)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  document.addEventListener("mouseover", e => {
    const imgTarget = e.target.closest("[data-cursor='img']");
    const ctaTarget = e.target.closest("[data-cursor='cta']");
    ring.classList.toggle("hover-img", !!imgTarget);
    ring.classList.toggle("hover-cta", !!ctaTarget);
  });
}

/* ─── THEME TOGGLE ──────────────────────────────────────────────────────── */

function initThemeToggle() {
  const btn = document.querySelector(".theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("timly_theme", "dark"); } catch (e) {}
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      try { localStorage.setItem("timly_theme", "light"); } catch (e) {}
    }
  });
}

/* ─── NAVBAR ────────────────────────────────────────────────────────────── */

function initNavbar() {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  const mobile = document.querySelector(".nav-mobile");
  if (!nav) return;

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 60);
  }, { passive: true });

  if (toggle && mobile) {
    toggle.addEventListener("click", () => {
      const open = mobile.classList.toggle("open");
      toggle.innerHTML = open
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    });
    mobile.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
      mobile.classList.remove("open");
      toggle.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    }));
  }
}

/* ─── PROJECT CARD RENDERING ────────────────────────────────────────────── */

function renderProjectCard(project, extraClass, priority) {
  extraClass = extraClass || "";
  return `
    <div class="project-card ${extraClass}" data-open-project="${project.id}" data-cursor="img">
      <portfolio-image src="${project.image}" alt="${project.title}"${priority ? ' priority="high"' : ""}></portfolio-image>
      <div class="project-card__overlay">
        <div class="project-card__body">
          <div class="project-card__cat">${project.category}</div>
          <div class="project-card__title">${project.title}</div>
          <div class="project-card__meta">${project.location} · ${project.year}</div>
          <div class="project-card__cta"><span>VIEW PROJECT</span> →</div>
        </div>
      </div>
    </div>`;
}

/* ─── IMAGE DOWNLOAD ────────────────────────────────────────────────────── */
/* A plain <a download href="..."> only forces a save for same-origin URLs;
   for a cross-origin R2/CDN URL the browser just navigates to it instead.
   Fetching the bytes and downloading the resulting blob works regardless
   of origin, since the object URL handed to the anchor is same-origin
   (blob:) either way. */

async function downloadImage(url) {
  const filename = url.split("/").pop().split("?")[0] || "image.jpg";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (e) {
    // Fetch/CORS failure — still let the visitor get the image by opening
    // it directly (they can save-as from there) rather than doing nothing.
    window.open(url, "_blank", "noopener");
  }
}

/* ─── PROJECT MODAL + LIGHTBOX ──────────────────────────────────────────── */

const ProjectModal = {
  modal: null,
  lightbox: null,
  currentImages: [],
  currentIdx: 0,

  init() {
    this.modal = document.getElementById("project-modal");
    this.lightbox = document.getElementById("lightbox");
    if (!this.modal) return;

    document.addEventListener("click", e => {
      const opener = e.target.closest("[data-open-project]");
      if (opener) {
        e.preventDefault();
        this.open(Number(opener.dataset.openProject));
      }
      if (e.target.closest("[data-close-project]")) this.close();
      if (e.target.closest("[data-close-lightbox]")) this.closeLightbox();
      if (e.target.closest("[data-lightbox-prev]")) this.stepLightbox(-1);
      if (e.target.closest("[data-lightbox-next]")) this.stepLightbox(1);
      const downloadBtn = e.target.closest("[data-lightbox-download]");
      if (downloadBtn) this.downloadCurrentImage(downloadBtn);
    });

    this.lightbox.addEventListener("click", e => {
      if (e.target === this.lightbox) this.closeLightbox();
    });

    document.addEventListener("keydown", e => {
      if (this.lightbox.classList.contains("open")) {
        if (e.key === "Escape") this.closeLightbox();
        if (e.key === "ArrowLeft") this.stepLightbox(-1);
        if (e.key === "ArrowRight") this.stepLightbox(1);
      } else if (this.modal.classList.contains("open")) {
        if (e.key === "Escape") this.close();
      }
    });
  },

  open(id) {
    const projects = ProjectStore.getAll();
    const project = projects.find(p => p.id === id);
    if (!project) return;
    this.render(project, projects);
    this.modal.classList.add("open");
    document.body.classList.add("no-scroll");
    this.modal.querySelector(".project-modal__scroll").scrollTo(0, 0);
  },

  close() {
    this.modal.classList.remove("open");
    document.body.classList.remove("no-scroll");
  },

  render(project, allProjects) {
    const idx = allProjects.findIndex(p => p.id === project.id);
    const prevP = idx > 0 ? allProjects[idx - 1] : null;
    const nextP = idx < allProjects.length - 1 ? allProjects[idx + 1] : null;
    const gallery = project.galleryImages || [];

    this.modal.querySelector(".project-modal__cat").textContent = project.category;
    this.modal.querySelector(".project-modal__hero img").src = project.image;
    this.modal.querySelector(".project-modal__hero img").alt = project.title;
    this.modal.querySelector(".project-modal__hero-meta span").textContent = `${project.location} · ${project.year}`;
    this.modal.querySelector(".project-modal__hero-title h1").textContent = project.title;

    const metaGrid = this.modal.querySelector(".project-modal__meta-grid");
    metaGrid.innerHTML = `
      <div>
        <div class="gold-line"></div>
        <div class="meta-item"><div class="lbl">CATEGORY</div><div class="val">${project.category}</div></div>
        <div class="meta-item"><div class="lbl">LOCATION</div><div class="val">${project.location}</div></div>
        <div class="meta-item"><div class="lbl">YEAR</div><div class="val">${project.year}</div></div>
      </div>
      <div><p class="project-modal__desc">${project.description || ""}</p></div>
    `;

    const galleryWrap = this.modal.querySelector(".mgallery");
    galleryWrap.innerHTML = "";
    if (this._galleryScroll) this._galleryScroll.disconnect();

    let sentinel = this.modal.querySelector(".mgallery-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.className = "mgallery-sentinel";
      galleryWrap.after(sentinel);
    }

    const bindItem = el => {
      el.addEventListener("click", () => this.openLightbox(gallery, Number(el.dataset.lightboxIdx)));
    };

    // Galleries can run into the hundreds of images (a full shoot), so
    // they're paginated 24 at a time — this.mgalleryQuery is rebuilt per
    // project and paged in as the sentinel nears the viewport, prefetching
    // the next page's images ahead of the scroll.
    this.mgalleryQuery = new PaginatedQuery({ source: () => gallery });
    this._galleryScroll = attachInfiniteScroll({
      sentinel,
      query: this.mgalleryQuery,
      getUrls: src => [src],
      onPage: (items, pageIndex) => {
        const offset = pageIndex * this.mgalleryQuery.pageSize;
        const html = items.map((src, i) => {
          const globalIdx = offset + i;
          return `
            <div class="mgallery__item ${globalIdx % 5 === 0 ? "wide" : ""}" data-lightbox-idx="${globalIdx}">
              <portfolio-image src="${src}" alt="${project.title} — ${globalIdx + 1}"${globalIdx < 6 ? ' priority="high"' : ""}></portfolio-image>
              <div class="mgallery__zoom"><span>${zoomIconSVG()}</span></div>
            </div>`;
        }).join("");
        galleryWrap.insertAdjacentHTML("beforeend", html);
        galleryWrap.querySelectorAll(`[data-lightbox-idx]:not([data-bound])`).forEach(el => {
          el.setAttribute("data-bound", "");
          bindItem(el);
        });
      },
    });

    const navRow = this.modal.querySelector(".project-modal__nav-row");
    navRow.innerHTML = `
      ${prevP ? `<button class="nav-proj-btn prev" data-nav-project="${prevP.id}">${arrowLeftSVG()}<span><div class="eyebrow-sm">PREVIOUS</div><div class="title-sm">${prevP.title}</div></span></button>` : "<div></div>"}
      ${nextP ? `<button class="nav-proj-btn next" data-nav-project="${nextP.id}"><span><div class="eyebrow-sm">NEXT PROJECT</div><div class="title-sm">${nextP.title}</div></span>${arrowRightSVG()}</button>` : "<div></div>"}
    `;
    navRow.querySelectorAll("[data-nav-project]").forEach(btn => {
      btn.addEventListener("click", () => this.open(Number(btn.dataset.navProject)));
    });
  },

  openLightbox(images, startIdx) {
    this.currentImages = images;
    this.currentIdx = startIdx;
    this.updateLightbox();
    this.lightbox.classList.add("open");
  },

  closeLightbox() {
    this.lightbox.classList.remove("open");
  },

  stepLightbox(dir) {
    const next = this.currentIdx + dir;
    if (next < 0 || next >= this.currentImages.length) return;
    this.currentIdx = next;
    this.updateLightbox();
  },

  updateLightbox() {
    const img = this.lightbox.querySelector("img");
    img.src = this.currentImages[this.currentIdx];
    this.lightbox.querySelector(".lightbox__count").textContent = `${this.currentIdx + 1} / ${this.currentImages.length}`;
    this.lightbox.querySelector("[data-lightbox-prev]").hidden = this.currentIdx === 0;
    this.lightbox.querySelector("[data-lightbox-next]").hidden = this.currentIdx === this.currentImages.length - 1;
  },

  async downloadCurrentImage(btn) {
    const url = this.currentImages[this.currentIdx];
    if (!url) return;
    btn.classList.add("downloading");
    try {
      await downloadImage(url);
    } finally {
      btn.classList.remove("downloading");
    }
  },
};

function zoomIconSVG() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${GOLD_ICON_COLOR}" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
}
function arrowLeftSVG() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${GOLD_ICON_COLOR}" stroke-width="1.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
}
function arrowRightSVG() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${GOLD_ICON_COLOR}" stroke-width="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
}

/* ─── SCROLL REVEAL ─────────────────────────────────────────────────────── */
/* Ported from framer-motion's whileInView (viewport once:true) used across
   App.tsx sections. Safe to call repeatedly — already-bound elements are
   skipped, so page scripts can call it again after injecting dynamic markup. */

function initScrollReveal(root) {
  const scope = root || document;
  const els = scope.querySelectorAll("[data-reveal]:not(.reveal-bound)");
  if (!els.length) return;
  els.forEach(el => el.classList.add("reveal-bound"));

  if (!("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("revealed"));
    return;
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });

  els.forEach(el => obs.observe(el));
}

/* ─── BOOT ──────────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  initLoader();
  initCursor();
  initNavbar();
  initThemeToggle();
  ProjectModal.init();
  initScrollReveal();
});
