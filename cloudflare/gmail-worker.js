/**
 * CLOUDFLARE WORKER --- Gmail SMTP (STARTTLS on 587) via
 * cloudflare:sockets
 *
 * Financial 101 Master --- LIVE email notifier.
 *
 * Deploy (from project root):
 * cd cloudflare
 * wrangler deploy --config email-wrangler.toml
 *
 * Secrets required:
 * wrangler secret put GMAIL_USER --config email-wrangler.toml
 * wrangler secret put GMAIL_APP_PASS --config email-wrangler.toml
 * wrangler secret put NOTIFY_TO --config email-wrangler.toml
 *
 * Endpoint: POST / with JSON body
 * { "type": "login" | "account_switch" | "sync_complete" | "test",
 * "user": "...", "email": "...", "appUrl": "..." }
 */

import { connect } from "cloudflare:sockets";

// --- SMTP helpers
// ----------------------------------------------------------------

class SmtpIO {
  constructor(readable, writable) {
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
    this.enc = new TextEncoder();
    this.dec = new TextDecoder();
    this.buf = "";
  }

  async _fill() {
    const { value, done } = await this.reader.read();
    if (done) throw new Error("SMTP connection closed unexpectedly");
    this.buf += this.dec.decode(value, { stream: true });
  }

  async readLine() {
    while (!this.buf.includes("\r\n")) await this._fill();
    const i = this.buf.indexOf("\r\n");
    const line = this.buf.slice(0, i);
    this.buf = this.buf.slice(i + 2);
    return line;
  }

  // Read a full SMTP reply. Continuation lines start with "NNN-"; the final line starts with "NNN ".
  async readReply() {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.length < 4) throw new Error("Malformed SMTP reply: " + line);
      if (line[3] === " ") break;
      if (line[3] !== "-") throw new Error("Unexpected SMTP reply format: " + line);
    }
    const code = parseInt(lines[0].slice(0, 3), 10);
    return { code, text: lines.join("\n") };
  }

  async write(s) {
    await this.writer.write(this.enc.encode(s + "\r\n"));
  }

  async writeRaw(s) {
    await this.writer.write(this.enc.encode(s));
  }

  async expect(expected, stepName) {
    const r = await this.readReply();
    if (r.code !== expected) {
      throw new Error(`${stepName} failed (expected ${expected}): ${r.text}`);
    }
    return r;
  }

  async close() {
    try { await this.writer.close(); } catch {}
    try { await this.reader.cancel(); } catch {}
  }
}

// Dot-stuffing per RFC 5321 §4.5.2 --- any line beginning with
// "." must be prefixed with an extra ".".
function dotStuff(body) {
  return body.split("\r\n").map(l => (l.startsWith(".") ? "." + l : l)).join("\r\n");
}

// Timeout wrapper so the Worker never burns its CPU/time budget on
// a hung socket.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timeout after " + ms + "ms")), ms)),
  ]);
}

async function sendGmail(env, to, subject, html) {
  const socket = connect({ hostname: "smtp.gmail.com", port: 587 });
  let io = new SmtpIO(socket.readable, socket.writable);

  try {
    await withTimeout(io.expect(220, "SMTP greeting"), 10000, "greeting");

    await io.write("EHLO financial101.workers.dev");
    await io.expect(250, "EHLO (plain)");

    await io.write("STARTTLS");
    await io.expect(220, "STARTTLS");

    // Upgrade: create a new IO over the encrypted socket and drop the
    // old buffer.
    const tls = socket.startTls();
    await io.close();
    io = new SmtpIO(tls.readable, tls.writable);

    await io.write("EHLO financial101.workers.dev");
    await io.expect(250, "EHLO (tls)");

    await io.write("AUTH LOGIN");
    await io.expect(334, "AUTH LOGIN");

    await io.write(btoa(env.GMAIL_USER));
    await io.expect(334, "AUTH user");

    await io.write(btoa(env.GMAIL_APP_PASS));
    await io.expect(235, "AUTH pass");

    await io.write("MAIL FROM:<" + env.GMAIL_USER + ">");
    await io.expect(250, "MAIL FROM");

    await io.write("RCPT TO:<" + to + ">");
    await io.expect(250, "RCPT TO");

    await io.write("DATA");
    await io.expect(354, "DATA");

    const headers = [
      "From: Financial 101 Master <" + env.GMAIL_USER + ">",
      "To: " + to,
      "Subject: " + subject,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Date: " + new Date().toUTCString(),
      "",
      "",
    ].join("\r\n");

    await io.writeRaw(headers + dotStuff(html) + "\r\n.\r\n");
    await io.expect(250, "DATA end");

    await io.write("QUIT");
    // 221 is the expected goodbye, but some servers just drop; don't
    // fail on QUIT.
    try { await withTimeout(io.readReply(), 3000, "QUIT"); } catch {}
  } finally {
    await io.close();
  }
}

// --- HTML templates (unchanged from v3.1 notify-server)
// ----------------------------------------------------------------

function tmpl(type, d, appUrl) {
  const time = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short",
  });

  const base = (title, accent, body) => `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,${accent} 0%,#7C3AED 100%);padding:30px;text-align:center;color:#fff">
      <h1 style="margin:0;font-size:26px">Financial 101 Master</h1>
      <p style="margin:6px 0 0;font-size:14px;opacity:.9">${title}</p>
    </div>
    <div style="padding:32px">${body}</div>
    <div style="background:#f9fafb;padding:18px;text-align:center;color:#6b7280;font-size:13px">
      © 2026 Financial 101 Master &middot; <a href="${appUrl}" style="color:#4F46E5">Open app</a>
    </div>
  </div></body></html>`;

  if (type === "account_switch") return base("Account Switched", "#4F46E5",
    `<p>You switched accounts at ${time} (BKK).</p>
     <p><b>From:</b> ${d.fromUser || "-"}<br><b>To:</b> ${d.toUser || "-"}</p>`);

  if (type === "sync_complete") return base("Backup Complete", "#10B981",
    `<p>Your data was backed up to Google Drive at ${time} (BKK).</p>
     <p><b>Account:</b> ${d.account || "-"}<br><b>Backups:</b> ${d.backupCount || "-"}</p>`);

  if (type === "test") return base("SMTP Validation", "#0EA5E9",
    `<p>This is a validation email sent from the Cloudflare Worker at ${time} (BKK).</p>
     <p>If you received this, the LIVE Gmail SMTP path is working end-to-end.</p>`);

  // default: login
  return base("Login Alert", "#4F46E5",
    `<p>Login recorded at ${time} (BKK).</p>
     <p><b>User:</b> ${d.user || "-"}<br><b>Email:</b> ${d.email || "-"}</p>`);
}

// --- Worker entry
// ----------------------------------------------------------------

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    if (!env.GMAIL_USER || !env.GMAIL_APP_PASS) {
      return new Response(JSON.stringify({ ok: false, error: "Missing GMAIL_USER or GMAIL_APP_PASS secret" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let body = {};
    try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

    const type = body.type || "login";
    const appUrl = body.appUrl || "https://financeplan-th.pages.dev";

    const subjectMap = {
      login: "[Financial 101 Master] Login Alert",
      account_switch: "[Financial 101 Master] Account Switched",
      sync_complete: "[Financial 101 Master] Google Drive Backup",
      test: "[Financial 101 Master] SMTP Validation",
    };

    const subject = body.subject || subjectMap[type] || subjectMap.login;
    const html = tmpl(type, body, appUrl);

    // 🔐 CRITICAL FIX: Derive recipients from the authenticated user's email (body.email)
    // and the env.NOTIFY_TO setting. Never hardcode the admin's email as a fallback.
    let recipients = [];

    // If the request includes a user's email (from authenticated context), add it first
    if (body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      recipients.push(body.email);
    }

    // If env.NOTIFY_TO is set (admin override for system alerts), add those addresses too
    if (env.NOTIFY_TO) {
      const adminEmails = env.NOTIFY_TO
        .split(",").map(s => s.trim()).filter(Boolean);
      recipients.push(...adminEmails);
    }

    // De-duplicate recipients
    recipients = [...new Set(recipients)];

    // If no recipients at all, reject the request
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: false, error: "No valid recipients. Either provide body.email or set NOTIFY_TO secret." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const results = [];
    for (const to of recipients) {
      try {
        await withTimeout(sendGmail(env, to, subject, html), 15000, "sendGmail(" + to + ")");
        results.push({ to, ok: true });
      } catch (e) {
        results.push({ to, ok: false, error: String(e && e.message || e) });
      }
    }

    const allOk = results.every(r => r.ok);
    return new Response(JSON.stringify({ ok: allOk, results }, null, 2), {
      status: allOk ? 200 : 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
