import { authed } from "../auth.js";
import { json } from "../cors.js";
import { verifyTurnstile } from "../turnstile.js";
import { sendEnquiryNotification } from "../email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ["new", "read", "replied"];

export async function handleEnquiryRoutes(request, env, url, cors) {
  // POST /enquiry — public, Turnstile-protected, writes the contact form
  if (request.method === "POST" && url.pathname === "/enquiry") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Expected JSON body" }, 400, cors);
    }

    const { name, email, message, shootDate, location, type, turnstileToken } = body || {};
    if (!name || !email || !message) return json({ error: "name, email, and message are required" }, 400, cors);
    if (typeof email !== "string" || !EMAIL_RE.test(email)) return json({ error: "Invalid email" }, 400, cors);

    const ip = request.headers.get("CF-Connecting-IP");
    const verified = await verifyTurnstile(turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
    if (!verified) return json({ error: "Verification failed — please retry the form." }, 403, cors);

    if (!env.timly_db) return json({ error: "Enquiries storage is not configured yet" }, 503, cors);

    const result = await env.timly_db.prepare(
      `INSERT INTO enquiries (name, email, shoot_date, location, type, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', datetime('now'))`
    ).bind(
      String(name).slice(0, 200),
      email.slice(0, 200),
      shootDate || null,
      location || null,
      type || null,
      String(message).slice(0, 5000)
    ).run();

    // Fire-and-forget-ish: awaited so errors are logged, but it never
    // blocks or fails the response — the enquiry is already saved above.
    await sendEnquiryNotification(env, { name, email, message, shoot_date: shootDate, location, type });

    return json({ id: result.meta.last_row_id }, 201, cors);
  }

  // Everything below is the admin-only Enquiries panel.
  if (url.pathname !== "/enquiries" && !/^\/enquiries\/\d+$/.test(url.pathname)) return null;

  if (!(await authed(request, env))) return json({ error: "Unauthorized" }, 401, cors);
  if (!env.timly_db) return json({ error: "Enquiries storage is not configured yet" }, 503, cors);

  if (request.method === "GET" && url.pathname === "/enquiries") {
    const { results } = await env.timly_db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC").all();
    return json({ enquiries: results }, 200, cors);
  }

  const idMatch = url.pathname.match(/^\/enquiries\/(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);

    if (request.method === "PATCH") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "Expected JSON body" }, 400, cors);
      }
      if (!VALID_STATUSES.includes(body && body.status)) return json({ error: "Invalid status" }, 400, cors);
      await env.timly_db.prepare("UPDATE enquiries SET status = ? WHERE id = ?").bind(body.status, id).run();
      return json({ id, status: body.status }, 200, cors);
    }

    if (request.method === "DELETE") {
      await env.timly_db.prepare("DELETE FROM enquiries WHERE id = ?").bind(id).run();
      return json({ deleted: id }, 200, cors);
    }
  }

  return null;
}
