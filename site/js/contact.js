/* ─── CONTACT PAGE ──────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  /* FAQ accordion */
  const faqList = document.getElementById("faq-list");
  faqList.innerHTML = FAQS.map((faq, i) => `
    <div class="faq" data-faq="${i}">
      <button class="faq__q" type="button">
        <span>${faq.q}</span>
        <svg class="faq__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="faq__a"><p>${faq.a}</p></div>
    </div>
  `).join("");

  faqList.addEventListener("click", e => {
    const trigger = e.target.closest(".faq__q");
    if (!trigger) return;
    const item = trigger.closest(".faq");
    const wasOpen = item.classList.contains("open");
    faqList.querySelectorAll(".faq").forEach(f => f.classList.remove("open"));
    if (!wasOpen) item.classList.add("open");
  });

  /* Enquiry form */
  const form = document.getElementById("enquiry-form");
  const successEl = document.getElementById("contact-success");
  const errorEl = document.getElementById("contact-error");
  const submitBtn = document.getElementById("enquiry-submit");

  let widgetId = null;
  const renderTurnstile = () => {
    if (typeof turnstile === "undefined") { setTimeout(renderTurnstile, 100); return; }
    widgetId = turnstile.render("#turnstile-widget", { sitekey: TURNSTILE_SITE_KEY });
  };
  renderTurnstile();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const turnstileToken = typeof turnstile !== "undefined" && widgetId !== null ? turnstile.getResponse(widgetId) : "";
    if (!turnstileToken) {
      errorEl.textContent = "Please complete the verification check.";
      errorEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "SENDING…";
    try {
      const res = await fetch(`${R2_WORKER_URL}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("f-name").value.trim(),
          email: document.getElementById("f-email").value.trim(),
          shootDate: document.getElementById("f-date").value,
          location: document.getElementById("f-location").value.trim(),
          type: document.getElementById("f-type").value,
          message: document.getElementById("f-message").value.trim(),
          turnstileToken,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      form.classList.add("hidden");
      successEl.classList.remove("hidden");
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong — please try again.";
      errorEl.classList.remove("hidden");
      if (typeof turnstile !== "undefined" && widgetId !== null) turnstile.reset(widgetId);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "SEND ENQUIRY";
    }
  });
});
