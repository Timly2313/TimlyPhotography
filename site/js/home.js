/* ─── HOME PAGE ─────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  /* Atmospheric home images */
  const imgSlots = {
    "hero-bg-img": IMGS.hero,
    "philosophy-img": IMGS.philosophy,
    "service-wedding-img": IMGS.sWedding,
    "service-portrait-img": IMGS.sPortrait,
    "service-editorial-img": IMGS.sEditorial,
  };
  Object.entries(imgSlots).forEach(([id, src]) => {
    const el = document.getElementById(id);
    if (el) el.src = src;
  });

  /* Marquee */
  const items = ["Weddings", "Portraits", "Editorial", "Cape Town", "Fine Art", "Film + Digital", "South Africa", "Elopements"];
  const track = document.getElementById("marquee-track");
  if (track) {
    track.innerHTML = [...items, ...items].map(item => `
      <div class="marquee__item"><span>${item}</span><span class="marquee__dot">◆</span></div>
    `).join("");
  }

  /* Project-dependent sections re-render whenever real data arrives from
     the Worker (see ProjectStore.refresh() below) — starts empty rather
     than fictional demo projects, so these are functions, not one-shot. */
  const pg = ["pg-0", "pg-1", "pg-2", "pg-3", "pg-4", "pg-5"];
  const grid = document.getElementById("home-work-grid");
  const latestWrap = document.getElementById("latest-project");

  function renderProjectSections(projects) {
    if (grid) {
      grid.innerHTML = projects.slice(0, 6).map((project, i) =>
        `<div class="${pg[i] || ""}" data-reveal="scale" style="transition-delay:${(i % 3) * 0.08}s">${renderProjectCard(project, "", i === 0)}</div>`
      ).join("");
    }

    const latest = projects[0];
    if (latestWrap) {
      latestWrap.innerHTML = latest ? `
        <div class="latest-img" data-open-project="${latest.id}" data-cursor="img" data-reveal="scale">
          <img src="${latest.image}" alt="${latest.title}" />
        </div>
        <div data-reveal style="transition-delay:0.15s">
          <div class="latest-meta">${latest.year} · ${latest.location.toUpperCase()}</div>
          <h2 class="latest-title">${latest.title}</h2>
          ${latest.description ? `<p class="latest-desc">${latest.description.slice(0, 160)}…</p>` : ""}
          <div class="gold-line" style="width:64px;margin-bottom:32px"></div>
          <button class="btn btn-outline" data-open-project="${latest.id}" data-cursor="cta">VIEW PROJECT →</button>
        </div>
      ` : "";
    }

    initScrollReveal();
  }

  renderProjectSections(ProjectStore.getAll());
  ProjectStore.refresh(renderProjectSections);

  /* Moments — the rest of the home image set (lan 13 down to lan 1),
     continuing the descending sequence started by the 5 atmospheric
     slots above (lan 18 - lan 14). Click any image to open it in the
     shared lightbox, scrollable through the whole set. */
  const momentsImages = HOME_IMAGES.slice(5);
  const momentsGrid = document.getElementById("moments-masonry");
  if (momentsGrid) {
    momentsGrid.innerHTML = momentsImages.map((src, i) => `
      <div class="moments-item" data-moments-idx="${i}" data-cursor="img" data-reveal="scale" style="transition-delay:${(i % 4) * 0.06}s">
        <portfolio-image src="${src}" alt="Timly Photography — moment ${i + 1}" intrinsic></portfolio-image>
        <div class="moments-item__overlay"><span>${zoomIconSVG()}</span></div>
      </div>
    `).join("");
    momentsGrid.querySelectorAll("[data-moments-idx]").forEach(el => {
      el.addEventListener("click", () => {
        ProjectModal.openLightbox(momentsImages, Number(el.dataset.momentsIdx));
      });
    });
  }
});
