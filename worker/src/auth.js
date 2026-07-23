import { jwtVerify, createRemoteJWKSet } from "jose";

// Supabase projects sign access tokens one of two ways depending on when
// the project was created / whether it's been migrated: newer projects
// default to an asymmetric key (ES256) published at the project's JWKS
// endpoint, older ones use a single shared HS256 secret (Project Settings
// → API → JWT Secret). Rather than require knowing which mode a given
// project is in, try JWKS first (today's default) and fall back to the
// shared secret — whichever one actually verifies the token wins.
//
// Passing signature verification only proves the token came from *some*
// signed-in Supabase user; ADMIN_EMAIL is what actually restricts this to
// the one person who should have admin access, so a stray sign-up in the
// Supabase project can't get in.

let remoteJwks = null;
function getRemoteJwks(env) {
  if (!remoteJwks && env.SUPABASE_URL) {
    remoteJwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return remoteJwks;
}

async function verifyToken(token, env) {
  const jwks = getRemoteJwks(env);
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      return payload;
    } catch (e) { /* not an asymmetric-signed token (or project isn't on this mode) — try legacy */ }
  }

  if (env.SUPABASE_JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      return payload;
    } catch (e) { /* not this either */ }
  }

  return null;
}

export async function authed(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token || !env.ADMIN_EMAIL) return false;

  const payload = await verifyToken(token, env);
  if (!payload) return false;
  return payload.aud === "authenticated" && payload.email === env.ADMIN_EMAIL;
}
