// Origin allow-list, not a wildcard — set ALLOWED_ORIGINS in wrangler.toml
// to a comma-separated list of exact origins (e.g. your production domain
// plus http://localhost:8080 for local dev). A request from any other
// origin gets no Access-Control-Allow-Origin header at all, so the browser
// blocks it client-side even though the request technically succeeded.
export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
