/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — API WORKER
   Authenticated proxy in front of the "portfolio" R2 bucket, the public
   contact form, and (once populated) the real project catalog. Admin
   routes are gated by a Supabase Auth JWT verified in src/auth.js — no
   shared secrets, no PIN. See worker/README.md for setup.
───────────────────────────────────────────────────────────────────────── */

import { corsHeaders, json } from "./cors.js";
import { handleUploadRoutes } from "./routes/upload.js";
import { handleEnquiryRoutes } from "./routes/enquiries.js";
import { handleProjectRoutes } from "./routes/projects.js";

const ROUTERS = [handleUploadRoutes, handleEnquiryRoutes, handleProjectRoutes];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    for (const router of ROUTERS) {
      const response = await router(request, env, url, cors);
      if (response) return response;
    }

    return json({ error: "Not found" }, 404, cors);
  },
};
