// Verifies a Cloudflare Turnstile token server-side. Fails closed: with no
// secret configured, every submission is rejected rather than silently
// accepted — the public /enquiry route only opens up once TURNSTILE_SECRET_KEY
// is actually set (see worker/README.md).
export async function verifyTurnstile(token, ip, secret) {
  if (!secret || !token) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    return false;
  }
}
