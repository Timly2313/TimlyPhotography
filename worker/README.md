# Timly API Worker

Cloudflare Worker behind the whole site's backend: R2 uploads for the
Admin panel, the public contact form (`/enquiry`), the D1-backed
Enquiries and Projects data the Admin panel manages, and (once Email
Routing is connected) a notification email on every new enquiry.

Every admin-only route is protected by a **Supabase Auth** JWT — there is
no PIN, no shared secret token, no `wrangler secret put ADMIN_UPLOAD_TOKEN`
anymore. Reads that power the public site (`GET /projects`) are public;
everything else requires a valid session for the one email in `ADMIN_EMAIL`.

## Setup, in order

### Phase 0 — Supabase project (manual, does the whole account/auth part)

1. Create a project at [supabase.com](https://supabase.com).
2. Authentication → Providers: leave Email enabled, but **turn off "Allow
   new users to sign up"** — this is a single-admin site, not a multi-user
   app, so the only account should be the one you create next.
3. Authentication → Users → Add user: create yourself an account (email +
   password). This is what you'll sign in with at `/admin.html`.
4. Project Settings → API: copy the **Project URL**, the **anon/public
   key**, and the **JWT Secret**.

### Phase 1 — wire up auth

1. In `site/js/config.js`, set:
   ```js
   const SUPABASE_URL = "https://<your-project>.supabase.co";
   const SUPABASE_ANON_KEY = "<anon/public key>";
   ```
   The anon key is meant to be public client-side — Supabase's security
   model relies on you not exposing the JWT Secret or service role key,
   not on hiding this one.
2. In `worker/wrangler.toml`, set `ADMIN_EMAIL` to the email you created
   in step 0.3, and `SUPABASE_URL` (informational only).
3. Set the two Worker secrets (never put these in a file):
   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put SUPABASE_JWT_SECRET   # paste the JWT Secret from step 0.4
   ```
4. Update `ALLOWED_ORIGINS` in `wrangler.toml` to a comma-separated list
   of the exact origins your site is served from (keep
   `http://localhost:8080` for local dev, add your real domain once it
   exists).
5. Deploy: `npx wrangler deploy`.
6. Open `admin.html`, sign in with the account from step 0.3. Try an
   upload — if it 401s, double check `ADMIN_EMAIL` matches the signed-in
   user's email exactly and that `SUPABASE_JWT_SECRET` is the *legacy
   HS256* secret (Project Settings → API), not a JWKS/asymmetric key.

### Phase 2 — enquiries (D1 + email)

1. Create the database and apply the schema:
   ```bash
   npx wrangler d1 create timly-db
   # paste the printed database_id into the [[d1_databases]] block in wrangler.toml, then:
   npx wrangler d1 execute timly-db --remote --file=migrations/0001_enquiries.sql
   npx wrangler d1 execute timly-db --remote --file=migrations/0002_projects.sql
   ```
   `/enquiry` has no CAPTCHA/spam gate right now — it was deliberately
   dropped to keep the form simple while there's no real traffic yet. If
   spam becomes a problem later, the `turnstile-spin` skill can wire
   Cloudflare Turnstile back in.
2. (Optional, needs a custom domain — see Phase 4) Connect a domain to
   Cloudflare, enable Email Routing on it, verify `NOTIFY_TO_EMAIL` as a
   destination address, then uncomment the `[[send_email]]` block in
   `wrangler.toml`. Enquiries save to D1 and appear in the Admin panel
   regardless of whether this step is done — it only gates the
   notification email.
3. `npx wrangler deploy`.

### Phase 3 — real projects

No extra setup — once Phase 2's D1 database exists, `/projects` works
immediately. Go to Admin → Projects and add your real shoots one at a
time (title, category, location, cover + gallery images). This step is
intentionally manual: nobody but you should decide what your real project
titles, categories, and descriptions say.

### Phase 4 — R2 + CDN activation (optional, unlocks free image resizing)

Cloudflare's on-the-fly Image Transformations (`/cdn-cgi/image/...`) do
the resize/WebP-conversion work for free, up to 5,000 unique transforms
per month — no processing queue, no background worker, no image library.
`site/js/cdn.js` already builds these URLs; it's inert until a custom
domain exists.

1. Connect a custom domain to the `portfolio` R2 bucket as a Cloudflare
   zone (R2 → your bucket → Settings → Custom Domains).
2. In that zone's dashboard, enable **Images → Transformations**.
3. Update `PUBLIC_BASE_URL` in `wrangler.toml` to the new domain and
   redeploy (`npx wrangler deploy`).
4. In `site/js/config.js`, set `CDN_CUSTOM_DOMAIN` to that same domain,
   and switch `LOCAL_BASE`/image URLs over to it once the real assets are
   actually uploaded to R2 under it (not before — until then, images are
   still served from the local `Portfolio/` folder, and pointing URLs at
   a domain with nothing behind it would just break them).

Past 5,000 transforms/month, Cloudflare bills $0.50 per additional 1,000 —
for a single-photographer portfolio site this is very unlikely to be hit.

## Endpoints

Public:
- `POST /enquiry` — contact form submission
- `GET /projects` — the live project catalog

Admin-only (`Authorization: Bearer <Supabase access token>`):
- `POST /upload`, `DELETE /project?folder=`, `DELETE /file?key=`, `GET /list?folder=` — R2 file management
- `GET /enquiries`, `PATCH /enquiries/:id` (`{status}`), `DELETE /enquiries/:id`
- `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`

## Bucket layout

```
portfolio/                     (bucket root)
  Home/
    lan (1).jpg ... lan (18).jpg
  <project-folder>/
    cover.jpg
    gallery-1.jpg, gallery-2.jpg, ...
```

## Project layout

```
src/
  index.js           router — dispatches to the route modules below
  auth.js            Supabase JWT verification
  cors.js            origin allow-list + JSON response helper
  email.js           enquiry notification email (send_email binding)
  routes/
    upload.js        R2 upload/delete/list (existing admin panel flow)
    enquiries.js      POST /enquiry (public) + admin enquiry management
    projects.js       GET /projects (public) + admin project CRUD
migrations/
  0001_enquiries.sql
  0002_projects.sql
```
