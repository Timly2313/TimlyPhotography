import { authed } from "../auth.js";
import { json } from "../cors.js";

const PATCHABLE_COLUMNS = ["title", "category", "location", "year", "image", "description"];

function rowToProject(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location,
    year: row.year,
    folder: row.folder,
    image: row.image,
    description: row.description,
    galleryImages: JSON.parse(row.gallery_images || "[]"),
  };
}

export async function handleProjectRoutes(request, env, url, cors) {
  if (url.pathname !== "/projects" && !/^\/projects\/\d+$/.test(url.pathname)) return null;
  if (!env.timly_db) return json({ error: "Project storage is not configured yet" }, 503, cors);

  // GET /projects is public — it's what the live site renders.
  if (request.method === "GET" && url.pathname === "/projects") {
    const { results } = await env.timly_db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
    return json({ projects: results.map(rowToProject) }, 200, cors);
  }

  // Create/update/delete are admin-only.
  if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);

  if (request.method === "POST" && url.pathname === "/projects") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Expected JSON body" }, 400, cors);
    }

    const { title, category, location, year, folder, image, description, galleryImages } = body || {};
    if (!title || !image || !folder) return json({ error: "title, image, and folder are required" }, 400, cors);

    const result = await env.timly_db.prepare(
      `INSERT INTO projects (title, category, location, year, folder, image, description, gallery_images, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      String(title).slice(0, 200),
      category || null,
      location || null,
      year || null,
      String(folder).slice(0, 200),
      image,
      description || null,
      JSON.stringify(Array.isArray(galleryImages) ? galleryImages : [])
    ).run();

    return json({ id: result.meta.last_row_id }, 201, cors);
  }

  const idMatch = url.pathname.match(/^\/projects\/(\d+)$/);
  if (!idMatch) return null;
  const id = Number(idMatch[1]);

  if (request.method === "DELETE") {
    await env.timly_db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    return json({ deleted: id }, 200, cors);
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Expected JSON body" }, 400, cors);
    }

    const sets = [];
    const values = [];
    for (const col of PATCHABLE_COLUMNS) {
      if (col in body) { sets.push(`${col} = ?`); values.push(body[col]); }
    }
    if ("galleryImages" in body) { sets.push("gallery_images = ?"); values.push(JSON.stringify(body.galleryImages)); }
    if (!sets.length) return json({ error: "No fields to update" }, 400, cors);

    values.push(id);
    await env.timly_db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    return json({ id }, 200, cors);
  }

  return null;
}
