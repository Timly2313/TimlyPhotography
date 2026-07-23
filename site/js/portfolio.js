/* ─── PORTFOLIO PAGE ────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  let active = "ALL";
  let scroll = null;

  const pillsWrap = document.getElementById("filter-pills");
  const grid = document.getElementById("portfolio-grid");
  const sentinel = document.getElementById("portfolio-sentinel");

  pillsWrap.innerHTML = CATS.map(cat =>
    `<button class="filter-pill ${cat === "ALL" ? "active" : ""}" data-cat="${cat}">${cat}</button>`
  ).join("");

  function renderGrid() {
    if (scroll) scroll.disconnect();
    grid.innerHTML = "";

    const query = createProjectsQuery(active === "ALL" ? null : p => p.category === active);
    scroll = attachInfiniteScroll({
      sentinel,
      query,
      getUrls: project => [project.image],
      onPage: (items, pageIndex) => {
        const html = items.map((project, i) =>
          `<div data-reveal="scale" style="transition-delay:${(i % 4) * 0.05}s">${renderProjectCard(project, "", pageIndex === 0 && i < 3)}</div>`
        ).join("");
        grid.insertAdjacentHTML("beforeend", html);
        initScrollReveal();
      },
    });
  }

  pillsWrap.addEventListener("click", e => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    active = btn.dataset.cat;
    pillsWrap.querySelectorAll(".filter-pill").forEach(p => p.classList.toggle("active", p === btn));
    renderGrid();
  });

  renderGrid();
  // Cache starts empty (or stale) until the real D1-backed list loads —
  // re-render once it arrives so the grid doesn't stay stuck showing
  // whatever was cached (or nothing) at page-load time.
  ProjectStore.refresh(() => renderGrid());
});
