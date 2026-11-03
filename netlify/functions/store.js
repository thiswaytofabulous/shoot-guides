// Shoot Guides — submissions (Netlify Blobs) + Resend email + TWTF Live Dashboard feed.
// Same pattern as the Website Wizard's store.js:
//   POST {action:"submit", client, form, fields}  -> saves, then emails Jessi via Resend
//   POST {action:"list", adminCode[, client]}     -> {sessions:[...]} for submission-dashboard
// Every submission is saved BEFORE the email goes out, so nothing is lost if Resend hiccups.
// notify LOGS LOUDLY and RETURNS its result so a failed send is visible in the function log.
import { getStore } from "@netlify/blobs";

// One entry per client folder in /public. Add the next one here when you add its folder,
// e.g. "home-care-cpas": { name: "Home Care CPAs", forms: { ... } }.
// `forms` maps each form's name attribute to the label used in the email subject.
const CLIENTS = {
  rhcc: {
    name: "RHCC",
    full: "Reel Home Care Consulting",
    forms: {
      "rhcc-answers": "Script answers",
      "rhcc-flags": "Flag for discussion"
    },
    // Optional: nicer labels in the email + dashboard (anything unlisted is auto-labeled).
    labels: {
      "opening": "Q1 · Opening",
      "next-step": "Q2 · Next step after watching",
      "years-agency": "Q3 · Years Becky ran her agency",
      "owners-count": "Q3 · Owners worked with",
      "states-count": "Q3 · States",
      "proud-result": "Q3 · Result they're proud of",
      "kristyn-part": "Q4 · Kristyn's part",
      "script-notes": "Script notes",
      "section": "About",
      "note": "Note"
    }
  }
};

// Fields that are plumbing, not answers.
const SKIP_FIELDS = new Set(["form-name", "bot-field", "company", "client"]);
// Hidden spam traps: a person never fills these in.
const HONEYPOTS = ["bot-field", "company"];
// Field names that hold "who sent this", checked in order.
const WHO_FIELDS = ["name", "your-name", "from", "who", "sender", "submitted-by"];

const MAX_FIELD_CHARS = 10000;
const MAX_FIELDS = 60;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "section-name" / "section_name" -> "Section name"
function prettyLabel(key) {
  const s = String(key).replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formLabel(client, form) {
  const cfg = CLIENTS[client];
  if (cfg && cfg.forms && cfg.forms[form]) return cfg.forms[form];
  return prettyLabel(String(form || "submission").replace(new RegExp("^" + client + "[-_]?"), "")) || "Submission";
}

function whoSent(fields) {
  for (const k of WHO_FIELDS) {
    const hit = Object.keys(fields).find((f) => f.toLowerCase() === k);
    if (hit && String(fields[hit]).trim()) return String(fields[hit]).trim();
  }
  return "Someone";
}

// Keep only plain string answers, trimmed and capped.
function cleanFields(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw).slice(0, MAX_FIELDS)) {
    if (SKIP_FIELDS.has(k)) continue;
    const val = Array.isArray(v) ? v.map(String).join(", ") : String(v == null ? "" : v);
    out[String(k).slice(0, 120)] = val.trim().slice(0, MAX_FIELD_CHARS);
  }
  return out;
}

// TWTF brand tokens — same as the Wizard emails.
const BRAND = {
  navy: "#2E4968",
  pink: "#FF0091",
  citron: "#EFFF72",
  blush: "#F8E6E5",
  white: "#FFFFFF",
  font: "'Montserrat', Arial, Helvetica, sans-serif"
};

function fromAddress() {
  const raw = (process.env.NOTIFY_FROM || "").trim();
  if (!raw) return "";
  return raw.includes("<") ? raw : `This Way to Fabulous <${raw}>`;
}

async function notify(rec) {
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  const from = fromAddress();
  const subject = `${rec.clientName} shoot guide · ${rec.formLabel} from ${rec.who}`;

  console.log("[notify] submission:", rec.client, rec.form, "from", rec.who);
  console.log("[notify] RESEND_API_KEY present?", !!resendKey);
  console.log("[notify] NOTIFY_TO:", to || "(MISSING)");
  console.log("[notify] NOTIFY_FROM:", from || "(MISSING)");

  if (!resendKey) {
    console.error("[notify] ABORT: RESEND_API_KEY is not set on this site.");
    return { attempted: false, ok: false, reason: "RESEND_API_KEY missing" };
  }
  if (!to) {
    console.error("[notify] ABORT: NOTIFY_TO is not set on this site.");
    return { attempted: false, ok: false, reason: "NOTIFY_TO missing" };
  }
  // No sandbox fallback on purpose: onboarding@resend.dev only delivers to the Resend
  // account owner, which is the bug that silently ate submissions before.
  if (!from || /resend\.dev/i.test(from)) {
    console.error("[notify] ABORT: NOTIFY_FROM must be the verified havenbuiltmedia.com sender. Got:", from || "(MISSING)");
    return { attempted: false, ok: false, reason: "NOTIFY_FROM missing or sandbox" };
  }

  const when = new Date(rec.createdAt).toLocaleString("en-US", { timeZone: "America/Chicago" });
  const entries = Object.entries(rec.fields);

  const rows = entries.map(([k, v]) => `
    <div style="margin:0 0 12px;padding:12px 14px;background:${BRAND.blush};border-left:3px solid ${BRAND.pink};border-radius:4px">
      <div style="font-family:${BRAND.font};font-size:11px;letter-spacing:.08em;font-weight:800;color:${BRAND.pink};margin-bottom:4px;text-transform:uppercase">${esc(rec.labels[k] || prettyLabel(k))}</div>
      <div style="font-family:${BRAND.font};font-size:14px;line-height:1.55;color:${BRAND.navy}">${esc(v || "(left blank)").replace(/\n/g, "<br>")}</div>
    </div>`).join("") || `<p style="font-family:${BRAND.font};color:${BRAND.navy};opacity:.6">(No fields filled in.)</p>`;

  const html = `<div style="font-family:${BRAND.font};color:${BRAND.navy};max-width:640px;margin:0 auto">
    <div style="background:${BRAND.pink};color:${BRAND.white};padding:18px 20px;border-radius:6px 6px 0 0">
      <div style="font-size:12px;letter-spacing:.12em;font-weight:800;color:${BRAND.citron}">${esc(rec.clientName)} SHOOT GUIDE</div>
      <h2 style="margin:6px 0 0;font-size:20px;font-weight:900;text-transform:uppercase">${esc(rec.formLabel)}</h2>
    </div>
    <div style="border:1px solid ${BRAND.blush};border-top:none;border-radius:0 0 6px 6px;padding:20px;background:${BRAND.white}">
      <table style="font-family:${BRAND.font};font-size:14px;line-height:1.6;margin-bottom:8px">
        <tr><td style="color:${BRAND.pink};font-weight:700;padding-right:12px">From</td><td style="font-weight:700">${esc(rec.who)}</td></tr>
        <tr><td style="color:${BRAND.pink};font-weight:700;padding-right:12px">Client</td><td>${esc(rec.clientFull)}</td></tr>
        <tr><td style="color:${BRAND.pink};font-weight:700;padding-right:12px">Form</td><td>${esc(rec.form)}</td></tr>
        <tr><td style="color:${BRAND.pink};font-weight:700;padding-right:12px">Sent</td><td>${esc(when)} CT</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid ${BRAND.blush};margin:16px 0">
      ${rows}
      <hr style="border:none;border-top:1px solid ${BRAND.blush};margin:16px 0">
      <p style="font-family:${BRAND.font};font-size:13px;color:${BRAND.navy};opacity:.65;margin:0">Also saved to the TWTF Live Dashboard under Client Shoot Guides.</p>
    </div>
  </div>`;

  const text = `${subject}\nClient: ${rec.clientFull}\nForm: ${rec.form}\nSent: ${when} CT\n\n` +
    entries.map(([k, v]) => `${(rec.labels[k] || prettyLabel(k)).toUpperCase()}:\n${v || "(left blank)"}`).join("\n\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
      body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()).filter(Boolean), subject, html, text })
    });
    const raw = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { /* leave raw */ }
    if (res.ok) {
      console.log("[notify] SUCCESS. Resend id:", parsed && parsed.id);
      return { attempted: true, ok: true, id: parsed && parsed.id };
    }
    console.error("[notify] RESEND REJECTED. status:", res.status, "body:", raw);
    return { attempted: true, ok: false, status: res.status, error: parsed || raw };
  } catch (e) {
    console.error("[notify] NETWORK/THROW while calling Resend:", String((e && e.message) || e));
    return { attempted: true, ok: false, error: String((e && e.message) || e) };
  }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const { action } = body;
  const store = getStore("shoot-guides");

  try {
    if (action === "submit") {
      const client = String(body.client || "").toLowerCase();
      const cfg = CLIENTS[client];
      if (!cfg) return json({ error: "Unknown client" }, 400);

      // Honeypot: bots fill the hidden field, people don't. Pretend success, store nothing.
      if (body.fields && HONEYPOTS.some((h) => String(body.fields[h] || "").trim())) return json({ ok: true });

      const form = String(body.form || "").slice(0, 80) || `${client}-submission`;
      const fields = cleanFields(body.fields);
      const labels = cfg.labels || {};
      const createdAt = new Date().toISOString();
      const id = `${client}/${createdAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;

      const rec = {
        id,
        client,
        clientName: cfg.name,
        clientFull: cfg.full || cfg.name,
        form,
        formLabel: formLabel(client, form),
        who: whoSent(fields),
        fields,
        labels: Object.fromEntries(Object.keys(fields).map((k) => [k, labels[k] || prettyLabel(k)])),
        page: String(body.page || "").slice(0, 200),
        createdAt,
        updatedAt: createdAt
      };

      let saved = false;
      try {
        await store.setJSON(id, rec);
        saved = true;
      } catch (e) {
        console.error("[store] Blobs save failed:", String((e && e.message) || e));
      }

      const mail = await notify(rec);
      // The page says "Got it!" as long as the submission landed somewhere you'll see it.
      const ok = saved || mail.ok;
      return json({ ok, saved, notify: mail }, ok ? 200 : 502);
    }

    // --- Dashboard feed: same contract as the Wizards and Shoot With Purpose ---
    if (action === "list") {
      const expected = process.env.ADMIN_CODE || process.env.ADMIN_TOKEN;
      if (!expected || body.adminCode !== expected) return json({ error: "Unauthorized" }, 401);

      const prefix = body.client ? String(body.client).toLowerCase() + "/" : undefined;
      const { blobs } = await store.list(prefix ? { prefix } : undefined);
      const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));

      const sessions = all
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .map((r) => ({
          name: `${r.clientName} · ${r.who}`,
          email: r.formLabel,
          client: r.client,
          form: r.form,
          submitted: true,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.createdAt,
          history: Object.entries(r.fields).map(([k, v]) => ({
            role: "user",
            content: `${(r.labels && r.labels[k]) || prettyLabel(k)}: ${v || "(left blank)"}`
          }))
        }));

      return json({ sessions });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};
