/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — SUPABASE AUTH CLIENT
   ES module (loaded via <script type="module">) so it can import the
   Supabase JS SDK straight from a CDN — no build step, no bundler. Only
   admin.html imports this; the public site never needs a Supabase session.

   SUPABASE_URL / SUPABASE_ANON_KEY come from js/config.js, a plain classic
   script loaded before this one — its top-level `const`s live in the same
   global lexical scope shared by every script on the page, module or not,
   so they're visible here without an explicit import.
───────────────────────────────────────────────────────────────────────── */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** @returns {Promise<import("@supabase/supabase-js").Session|null>} */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}
