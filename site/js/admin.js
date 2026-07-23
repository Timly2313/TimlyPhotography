/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — ADMIN DASHBOARD
   Ported from AdminPage / AdminDashboard / AdminProjects / AdminEnquiries /
   AdminSettings in src/app/App.tsx. Gated by a real Supabase Auth session
   (see js/supabaseClient.js) — the Worker independently re-verifies the
   session's JWT on every privileged call, so this client-side gate is only
   ever a UX convenience, never the actual security boundary.
───────────────────────────────────────────────────────────────────────── */

import { getSession, signIn, signOut } from "./supabaseClient.js";

const GOLD = "#C9A020";

document.addEventListener("DOMContentLoaded", () => {
  initAuthGate();
});

/* ─── AUTHENTICATED WORKER REQUESTS ─────────────────────────────────────── */
/* Every privileged Worker route (R2 upload/delete, enquiries, projects)
   is called through this helper so the bearer token is always the current
   Supabase access token — never a value typed in once and cached. */

async function authedFetch(path, opts = {}) {
  const session = await getSession();
  if (!session) throw new Error("Your session has expired — please sign in again.");

  const res = await fetch(`${R2_WORKER_URL}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}` },
  });

  if (res.status === 401) {
    throw new Error("Not authorized for this action. Sign out and back in, or confirm this account is the configured admin.");
  }
  return res;
}

function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

async function uploadToR2(blob, folder, filename) {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("folder", folder);
  form.append("filename", filename);

  const res = await authedFetch("/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const data = await res.json();
  return data.url;
}

/* ─── AUTH GATE ─────────────────────────────────────────────────────────── */

function initAuthGate() {
  const gate = document.getElementById("admin-gate");
  const shell = document.getElementById("admin-shell");
  const form = document.getElementById("pin-form");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const errorEl = document.getElementById("pin-error");
  const submitBtn = document.getElementById("signin-btn");

  function enter() {
    gate.classList.add("hidden");
    shell.classList.remove("hidden");
    initAdminShell();
  }

  function showError(msg) {
    passwordInput.classList.add("error");
    emailInput.classList.add("error");
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }

  getSession().then(session => {
    if (session) enter();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    passwordInput.classList.remove("error");
    emailInput.classList.remove("error");
    submitBtn.disabled = true;
    submitBtn.textContent = "SIGNING IN…";
    try {
      await signIn(emailInput.value.trim(), passwordInput.value);
      enter();
    } catch (err) {
      showError(err.message || "Invalid email or password");
      passwordInput.value = "";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "SIGN IN";
    }
  });
}

/* ─── ADMIN SHELL ───────────────────────────────────────────────────────── */

async function initAdminShell() {
  initSidebar();
  renderSettingsPanel();

  document.getElementById("sign-out").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });

  // One shared refresh so the Dashboard's counts and the Projects panel's
  // list agree from the first paint, instead of racing two independent
  // fetches against the same D1-backed list.
  await ProjectStore.refresh();
  renderDashboard();
  renderProjectsPanel();
  renderEnquiriesPanel();
}

/* ─── ENQUIRIES DATA ────────────────────────────────────────────────────── */
/* Real submissions from the public contact form, stored in D1 behind the
   Worker's /enquiries route (see worker/src/routes/enquiries.js). Returns
   [] rather than throwing if the Worker/D1 isn't configured yet, so the
   panel degrades to an empty state instead of breaking. */

async function fetchEnquiries() {
  try {
    const res = await authedFetch("/enquiries");
    if (!res.ok) return [];
    const data = await res.json();
    return data.enquiries || [];
  } catch (e) {
    return [];
  }
}

async function updateEnquiryStatus(id, status) {
  try {
    await authedFetch(`/enquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch (e) { /* best-effort — UI already reflects the click */ }
}

async function deleteEnquiry(id) {
  try {
    await authedFetch(`/enquiries/${id}`, { method: "DELETE" });
  } catch (e) { /* ignore — the row disappears from the UI regardless */ }
}

function renderSettingsPanel() {
  document.getElementById("settings-worker-url").value = R2_WORKER_URL || "(not configured)";

  getSession().then(session => {
    document.getElementById("token-status").textContent = session
      ? `Signed in as ${session.user.email}`
      : "Not signed in";
  });
}

function initSidebar() {
  const navItems = document.querySelectorAll(".admin-nav-item");
  navItems.forEach(btn => {
    btn.addEventListener("click", () => {
      navItems.forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${btn.dataset.panel}`).classList.add("active");
    });
  });
}

/* ─── DASHBOARD ─────────────────────────────────────────────────────────── */

// D1's datetime('now') is UTC without a timezone suffix — append "Z" so
// the browser parses it as UTC instead of (incorrectly) local time.
function timeAgo(sqliteDatetime) {
  if (!sqliteDatetime) return "";
  const then = new Date(sqliteDatetime.replace(" ", "T") + "Z").getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

async function renderDashboard() {
  const projects = ProjectStore.getAll();
  const totalImages = projects.reduce((acc, p) => acc + p.galleryImages.length + 1, 0);
  const enquiries = await fetchEnquiries();

  const stats = [
    { label: "Total Projects", value: String(projects.length) },
    { label: "Active Galleries", value: String(projects.filter(p => p.galleryImages.length > 0).length) },
    { label: "New Enquiries", value: String(enquiries.filter(e => e.status === "new").length) },
    { label: "Images Hosted", value: String(totalImages) },
  ];

  document.getElementById("stat-grid").innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-card__value">${s.value}</div>
      <div class="stat-card__label">${s.label.toUpperCase()}</div>
    </div>
  `).join("");

  document.getElementById("badge-projects").textContent = String(projects.length);
  document.getElementById("badge-enquiries").textContent = String(enquiries.filter(e => e.status === "new").length);

  document.getElementById("dash-recent-projects").innerHTML = projects.slice(0, 5).map(p => `
    <div class="admin-list-item">
      <img src="${p.image}" alt="${p.title}" />
      <div>
        <div class="admin-list-item__title">${p.title}</div>
        <div class="admin-list-item__sub">${p.category} · ${p.location}</div>
      </div>
      <span class="admin-list-item__extra">${p.galleryImages.length} imgs</span>
    </div>
  `).join("");

  document.getElementById("dash-recent-enquiries").innerHTML = enquiries.length
    ? enquiries.slice(0, 5).map(enq => `
      <div class="enquiry-mini">
        <div class="enquiry-mini__top">
          <span class="enquiry-mini__name">${enq.name}</span>
          <span class="enquiry-mini__time">${timeAgo(enq.created_at)}</span>
        </div>
        <p class="enquiry-mini__msg">${enq.message.slice(0, 75)}…</p>
      </div>
    `).join("")
    : `<p class="admin-panel__sub">No enquiries yet.</p>`;
}

/* ─── PROJECTS PANEL ────────────────────────────────────────────────────── */

const BLANK_DRAFT = () => ({
  title: "", category: "WEDDINGS", location: "", year: String(new Date().getFullYear()),
  description: "", coverUrl: "", coverBlob: null, galleryUrls: [], galleryBlobs: [],
});

let draft = BLANK_DRAFT();

async function renderProjectsPanel() {
  await ProjectStore.refresh();
  const projects = ProjectStore.getAll();
  document.getElementById("projects-count").textContent = `${projects.length} projects in collection`;

  const catSelect = document.getElementById("p-category");
  catSelect.innerHTML = CATS.filter(c => c !== "ALL").map(c => `<option value="${c}">${c}</option>`).join("");

  document.getElementById("admin-project-list").innerHTML = projects.map(p => `
    <div class="admin-project-row">
      <img src="${p.image}" alt="${p.title}" />
      <div>
        <div class="admin-project-row__title">${p.title}</div>
        <div class="admin-project-row__sub">${p.category} · ${p.location} · ${p.year} · ${p.galleryImages.length} gallery image${p.galleryImages.length !== 1 ? "s" : ""}</div>
      </div>
      <div class="admin-project-row__actions">
        <button class="admin-delete-btn" data-delete-project="${p.id}">DELETE</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-delete-project]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.deleteProject);
      const project = ProjectStore.getById(id);
      btn.disabled = true;
      btn.textContent = "DELETING…";
      try {
        await authedFetch(`/projects/${id}`, { method: "DELETE" });
        if (project && project.folder) {
          await authedFetch(`/project?folder=${encodeURIComponent(project.folder)}`, { method: "DELETE" });
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "DELETE";
        alert(`Couldn't delete: ${err.message}`);
        return;
      }
      ProjectStore.setAll(ProjectStore.getAll().filter(p => p.id !== id));
      renderProjectsPanel();
      renderDashboard();
    });
  });

  const showAddBtn = document.getElementById("show-add-project");
  const formEl = document.getElementById("add-project-form");

  showAddBtn.onclick = () => {
    formEl.classList.add("open");
    showAddBtn.classList.add("hidden");
  };
  document.getElementById("cancel-add-top").onclick = cancelAdd;
  document.getElementById("cancel-add-bottom").onclick = cancelAdd;

  function cancelAdd() {
    draft = BLANK_DRAFT();
    syncForm();
    formEl.classList.remove("open");
    showAddBtn.classList.remove("hidden");
  }

  syncForm();
  initUploadZones();

  const publishBtn = document.getElementById("publish-project");
  publishBtn.onclick = async () => {
    draft.title = document.getElementById("p-title").value;
    draft.location = document.getElementById("p-location").value;
    draft.year = document.getElementById("p-year").value;
    draft.category = document.getElementById("p-category").value;
    draft.description = document.getElementById("p-description").value;

    const errorEl = document.getElementById("form-error");
    const showError = msg => { errorEl.textContent = msg; errorEl.classList.remove("hidden"); };

    if (!draft.title.trim()) { showError("Please enter a project title."); return; }
    if (!draft.coverUrl) { showError("Please upload a cover image."); return; }
    errorEl.classList.add("hidden");

    const slug = slugify(draft.title);
    let coverUrl = draft.coverUrl;
    let galleryUrls = draft.galleryUrls;

    if (R2_WORKER_URL) {
      publishBtn.disabled = true;
      publishBtn.textContent = "PUBLISHING…";
      try {
        if (draft.coverBlob) {
          coverUrl = await uploadToR2(draft.coverBlob, slug, "cover.jpg");
        }
        galleryUrls = await Promise.all(
          draft.galleryBlobs.map((blob, i) => uploadToR2(blob, slug, `gallery-${i + 1}.jpg`))
        );
      } catch (err) {
        publishBtn.disabled = false;
        publishBtn.textContent = "PUBLISH PROJECT";
        showError(`Upload to R2 failed: ${err.message}. Check your token and try again.`);
        return;
      }
      publishBtn.disabled = false;
      publishBtn.textContent = "PUBLISH PROJECT";
    }

    const project = {
      title: draft.title.trim(),
      category: draft.category,
      location: draft.location.trim() || "South Africa",
      year: draft.year || String(new Date().getFullYear()),
      folder: slug,
      image: coverUrl,
      description: draft.description.trim(),
      galleryImages: galleryUrls,
    };

    publishBtn.disabled = true;
    publishBtn.textContent = "SAVING…";
    try {
      const res = await authedFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const { id } = await res.json();
      ProjectStore.setAll([{ id, ...project }, ...ProjectStore.getAll()]);
    } catch (err) {
      publishBtn.disabled = false;
      publishBtn.textContent = "PUBLISH PROJECT";
      showError(`Couldn't save project: ${err.message}`);
      return;
    }
    publishBtn.disabled = false;
    publishBtn.textContent = "PUBLISH PROJECT";

    draft = BLANK_DRAFT();
    syncForm();
    formEl.classList.remove("open");
    showAddBtn.classList.remove("hidden");
    renderProjectsPanel();
    renderDashboard();
  };
}

function syncForm() {
  document.getElementById("p-title").value = draft.title;
  document.getElementById("p-location").value = draft.location;
  document.getElementById("p-year").value = draft.year;
  document.getElementById("p-category").value = draft.category;
  document.getElementById("p-description").value = draft.description;
  document.getElementById("form-error").classList.add("hidden");
  renderUploadPreviews();
}

function renderUploadPreviews() {
  const coverDrop = document.getElementById("cover-drop");
  const coverPreview = document.getElementById("cover-preview");
  if (draft.coverUrl) {
    coverDrop.classList.add("hidden");
    coverPreview.classList.remove("hidden");
    coverPreview.innerHTML = `
      <div class="upload-zone__preview">
        <img src="${draft.coverUrl}" alt="cover preview" />
        <button type="button" class="upload-zone__remove" id="remove-cover">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    document.getElementById("remove-cover").onclick = () => {
      draft.coverUrl = "";
      draft.coverBlob = null;
      renderUploadPreviews();
    };
  } else {
    coverDrop.classList.remove("hidden");
    coverPreview.classList.add("hidden");
    coverPreview.innerHTML = "";
  }

  const galleryDrop = document.getElementById("gallery-drop");
  const galleryPreview = document.getElementById("gallery-preview");
  const galleryCount = document.getElementById("gallery-count");
  if (draft.galleryUrls.length > 0) {
    galleryDrop.classList.add("hidden");
    galleryPreview.classList.remove("hidden");
    galleryPreview.innerHTML = draft.galleryUrls.map((src, i) => `
      <div class="upload-zone__preview">
        <img src="${src}" alt="preview ${i}" />
        <button type="button" class="upload-zone__remove" data-remove-gallery="${i}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join("") + `
      <div class="upload-zone__add-more" id="add-more-gallery">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>`;
    galleryPreview.querySelectorAll("[data-remove-gallery]").forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.removeGallery);
        draft.galleryUrls.splice(idx, 1);
        draft.galleryBlobs.splice(idx, 1);
        renderUploadPreviews();
      };
    });
    document.getElementById("add-more-gallery").onclick = () => document.getElementById("gallery-input").click();
    galleryCount.classList.remove("hidden");
    galleryCount.textContent = `${draft.galleryUrls.length} image${draft.galleryUrls.length !== 1 ? "s" : ""} selected`;
  } else {
    galleryDrop.classList.remove("hidden");
    galleryPreview.classList.add("hidden");
    galleryPreview.innerHTML = "";
    galleryCount.classList.add("hidden");
  }
}

function initUploadZones() {
  setupZone("cover-drop", "cover-input", false, files => {
    draft.coverBlob = files[0];
    draft.coverUrl = URL.createObjectURL(files[0]);
    renderUploadPreviews();
  });
  setupZone("gallery-drop", "gallery-input", true, files => {
    draft.galleryBlobs.push(...files);
    draft.galleryUrls.push(...files.map(f => URL.createObjectURL(f)));
    renderUploadPreviews();
  });
}

function setupZone(dropId, inputId, multiple, onFiles) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);

  drop.onclick = () => input.click();
  input.onchange = () => {
    const files = Array.from(input.files).filter(f => f.type.startsWith("image/"));
    if (files.length) onFiles(files);
    input.value = "";
  };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("dragging"); };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = e => {
    e.preventDefault();
    drop.classList.remove("dragging");
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) onFiles(multiple ? files : [files[0]]);
  };
}

/* ─── ENQUIRIES PANEL ───────────────────────────────────────────────────── */

async function renderEnquiriesPanel() {
  const listEl = document.getElementById("admin-enquiry-list");
  const enquiries = await fetchEnquiries();

  document.getElementById("enquiries-count").textContent =
    `${enquiries.filter(e => e.status === "new").length} new message${enquiries.filter(e => e.status === "new").length !== 1 ? "s" : ""}`;

  if (!enquiries.length) {
    listEl.innerHTML = `<p class="admin-panel__sub">No enquiries yet — they'll appear here as visitors submit the contact form.</p>`;
    return;
  }

  listEl.innerHTML = enquiries.map(enq => `
    <div class="enquiry-card">
      <div class="enquiry-card__top">
        <div>
          <div class="enquiry-card__name">${enq.name}${enq.status === "new" ? ' <span style="color:' + GOLD + ';font-size:10px;letter-spacing:0.1em">● NEW</span>' : ""}</div>
          <div class="enquiry-card__email">${enq.email}</div>
        </div>
        <span class="enquiry-card__time">${timeAgo(enq.created_at)}</span>
      </div>
      <div class="enquiry-card__meta">
        <div><div class="lbl" style="font-family:var(--font-body);font-weight:400;font-size:9px;letter-spacing:.35em;color:${GOLD};margin-bottom:3px">TYPE</div><div style="font-family:var(--font-body);font-weight:300;font-size:12px;color:#A89880">${enq.type || "—"}</div></div>
        <div><div class="lbl" style="font-family:var(--font-body);font-weight:400;font-size:9px;letter-spacing:.35em;color:${GOLD};margin-bottom:3px">SHOOT DATE</div><div style="font-family:var(--font-body);font-weight:300;font-size:12px;color:#A89880">${enq.shoot_date || "—"}</div></div>
        <div><div class="lbl" style="font-family:var(--font-body);font-weight:400;font-size:9px;letter-spacing:.35em;color:${GOLD};margin-bottom:3px">LOCATION</div><div style="font-family:var(--font-body);font-weight:300;font-size:12px;color:#A89880">${enq.location || "—"}</div></div>
      </div>
      <p class="enquiry-card__msg">${enq.message}</p>
      <div class="enquiry-card__actions">
        <a href="mailto:${enq.email}"><button class="eq-btn-email" type="button" data-mark-read="${enq.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4z"/><polyline points="4 6 12 13 20 6"/></svg>
          REPLY BY EMAIL
        </button></a>
        <a href="https://wa.me/27715061785?text=Hi%20${encodeURIComponent(enq.name.split(" ")[0])}!"><button class="eq-btn-wa" type="button" data-mark-read="${enq.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.5.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
          WHATSAPP
        </button></a>
        <button class="admin-delete-btn" type="button" data-delete-enquiry="${enq.id}">DELETE</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll("[data-mark-read]").forEach(btn => {
    btn.addEventListener("click", () => updateEnquiryStatus(Number(btn.dataset.markRead), "replied"), { once: true });
  });
  listEl.querySelectorAll("[data-delete-enquiry]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await deleteEnquiry(Number(btn.dataset.deleteEnquiry));
      renderEnquiriesPanel();
      renderDashboard();
    });
  });
}
