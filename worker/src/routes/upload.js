import { authed } from "../auth.js";
import { json } from "../cors.js";

// Folder/file names may only contain safe characters — blocks path
// traversal (../) while still allowing the "lan(1)" style naming in use.
function isSafeSegment(seg) {
  return typeof seg === "string" && seg.length > 0 && seg.length < 200 && /^[a-zA-Z0-9 _().-]+$/.test(seg) && !seg.includes("..");
}

// Only real photo formats — never trust the client's declared MIME type
// alone (it's user-controlled), so this also sniffs the first few bytes.
// Explicitly excludes SVG (can carry <script>) and anything executable.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — generous for full-res photos, not unlimited

async function sniffImageType(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (offset, str) => String.fromCharCode(...head.slice(offset, offset + str.length)) === str;

  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  return null;
}

export async function handleUploadRoutes(request, env, url, cors) {
  // POST /upload  (multipart/form-data: file, folder, filename)
  if (request.method === "POST" && url.pathname === "/upload") {
    if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return json({ error: "Expected multipart/form-data" }, 400, cors);
    }

    const file = form.get("file");
    const folder = form.get("folder");
    const filename = form.get("filename") || (file && file.name);

    if (!(file instanceof File)) return json({ error: "Missing file" }, 400, cors);
    if (!isSafeSegment(folder)) return json({ error: "Invalid folder name" }, 400, cors);
    if (!isSafeSegment(filename)) return json({ error: "Invalid filename" }, 400, cors);
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }, 400, cors);
    if (!ALLOWED_TYPES.has(file.type)) return json({ error: "Only JPEG, PNG, and WebP images are accepted" }, 400, cors);

    const sniffed = await sniffImageType(file);
    if (!sniffed || !ALLOWED_TYPES.has(sniffed)) {
      return json({ error: "File content doesn't match an accepted image format" }, 400, cors);
    }

    const key = `${folder}/${filename}`;
    await env.PORTFOLIO_BUCKET.put(key, file.stream(), {
      // Use the sniffed type, not the client-declared one — it's verified
      // against the actual file bytes above, the client's isn't.
      httpMetadata: { contentType: sniffed },
    });

    return json({ key, url: `${env.PUBLIC_BASE_URL}/${key}` }, 200, cors);
  }

  // DELETE /project?folder=<slug>  — removes every object under a project's folder
  if (request.method === "DELETE" && url.pathname === "/project") {
    if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);

    const folder = url.searchParams.get("folder");
    if (!isSafeSegment(folder)) return json({ error: "Invalid folder name" }, 400, cors);

    const prefix = `${folder}/`;
    let deleted = 0;
    let cursor;
    do {
      const listing = await env.PORTFOLIO_BUCKET.list({ prefix, cursor });
      if (listing.objects.length) {
        await env.PORTFOLIO_BUCKET.delete(listing.objects.map(o => o.key));
        deleted += listing.objects.length;
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);

    return json({ deleted }, 200, cors);
  }

  // DELETE /file?key=<key> — removes a single object (e.g. one gallery image)
  if (request.method === "DELETE" && url.pathname === "/file") {
    if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);

    const key = url.searchParams.get("key");
    if (!key || key.includes("..")) return json({ error: "Invalid key" }, 400, cors);

    await env.PORTFOLIO_BUCKET.delete(key);
    return json({ deleted: key }, 200, cors);
  }

  // GET /list?folder=<slug> — lists objects under a folder (used to verify uploads)
  if (request.method === "GET" && url.pathname === "/list") {
    if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);

    const folder = url.searchParams.get("folder") || "";
    const prefix = folder ? `${folder}/` : "";
    const listing = await env.PORTFOLIO_BUCKET.list({ prefix });
    return json({
      objects: listing.objects.map(o => ({
        key: o.key,
        url: `${env.PUBLIC_BASE_URL}/${o.key}`,
        size: o.size,
        uploaded: o.uploaded,
      })),
    }, 200, cors);
  }

  return null; // not one of this module's routes
}
