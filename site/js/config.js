/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — IMAGE CONFIGURATION
   Serving straight from the local Portfolio/ folder that's actually on
   disk (site/Portfolio/...) for now — it's verified to exist. R2 URL
   helpers are kept below for when uploads move to the bucket for real
   (see worker/README.md); flip LOCAL_BASE to R2_PUBLIC_BASE_URL once
   the same folder layout is mirrored into R2.
───────────────────────────────────────────────────────────────────────── */

const LOCAL_BASE = "Portfolio";
const R2_PUBLIC_BASE_URL = "https://pub-7f3f3cc2474a47dc972d50c172ecd83b.r2.dev";

/* Custom domain connected to the R2 bucket as a Cloudflare zone, with
   Image Transformations enabled (Cloudflare dashboard → Images →
   Transformations — free for up to 5,000 unique transforms/month). Once
   set, js/cdn.js builds /cdn-cgi/image/ resize URLs against this origin
   instead of serving originals. Leave blank until that domain exists —
   cdn.js treats an empty value as "resizing not available yet" and every
   image URL just resolves to the original, same as before. */
const CDN_CUSTOM_DOMAIN = "";

// Worker endpoint is fine to ship publicly — it's just a URL. Admin-only
// calls authenticate with a live Supabase session token instead of a
// shared secret (see authedFetch() in js/admin.js).
const R2_WORKER_URL = "https://timly-r2-upload.timlyphotography.workers.dev";

function r2Url(folder, filename) {
  return `${LOCAL_BASE}/${folder}/${filename}`;
}

/* Home page images — lan (18) down to lan (1), in that exact order. */
const HOME_IMAGES = Array.from({ length: 18 }, (_, i) => r2Url("Home", `lan (${18 - i}).jpg`));

/* Photographer portrait used on the About page. */
const PHOTOGRAPHER_IMAGE = `${LOCAL_BASE}/Photographer.jpg`;


/* ─── SUPABASE (admin auth) ─────────────────────────────────────────────
   The anon/publishable key is meant to be public — Supabase's security
   model relies on Row Level Security policies server-side, not on hiding
   this key. Only the admin.html page actually uses these (see
   js/supabaseClient.js); the public site never signs in.
   Fill these in from your Supabase project → Settings → API after
   completing Phase 0 of worker/README.md. Sign-in will fail harmlessly
   (a clear error, not a crash) until they're set. */
const SUPABASE_URL = "https://zoooiopclnbbuxesqwnq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpvb29pb3BjbG5iYnV4ZXNxd25xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODkxMjQsImV4cCI6MjEwMDM2NTEyNH0.2HaLY5I2bTC9tufHCGcFOIKBJ4BGEJRs9uuvSQ1jWa4";

/* Cloudflare Turnstile site key for the public contact form (paired with
   a secret key the Worker verifies server-side). From Cloudflare dashboard
   → Turnstile → your widget. A widget in test mode always passes, so this
   is safe to leave on the default test key during local development. */
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
