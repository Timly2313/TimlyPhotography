import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

// Best-effort: the enquiry is already committed to D1 by the time this
// runs, so a failure here (binding not configured, domain not verified
// yet, etc.) must never fail the request — it just means no email this
// time. See worker/README.md Phase 2 for how to wire up Email Routing.
export async function sendEnquiryNotification(env, enquiry) {
  if (!env.ENQUIRY_EMAIL || !env.NOTIFY_TO_EMAIL || !env.NOTIFY_FROM_EMAIL) return;

  try {
    const msg = createMimeMessage();
    msg.setSender({ addr: env.NOTIFY_FROM_EMAIL, name: "Timly Photography Site" });
    msg.setRecipient(env.NOTIFY_TO_EMAIL);
    msg.setSubject(`New enquiry: ${enquiry.name} (${enquiry.type || "General"})`);
    msg.addMessage({
      contentType: "text/plain",
      data: [
        `Name: ${enquiry.name}`,
        `Email: ${enquiry.email}`,
        `Type: ${enquiry.type || "-"}`,
        `Shoot date: ${enquiry.shoot_date || "-"}`,
        `Location: ${enquiry.location || "-"}`,
        "",
        enquiry.message,
      ].join("\n"),
    });

    const message = new EmailMessage(env.NOTIFY_FROM_EMAIL, env.NOTIFY_TO_EMAIL, msg.asRaw());
    await env.ENQUIRY_EMAIL.send(message);
  } catch (e) {
    console.error("Enquiry email send failed (enquiry is still saved in D1):", e);
  }
}
