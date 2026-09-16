import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.API_KEY?.trim();

function requireApiKey(req, res, next) {
  if (!apiKey) return next();
  const key = req.get("x-api-key");
  if (key !== apiKey) {
    return res.status(401).json({ error: "Clé API invalide ou manquante" });
  }
  next();
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

let transporter = createTransport();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    smtpConfigured: Boolean(transporter),
  });
});

/**
 * POST /api/send
 * Body JSON: { to, subject, text?, html?, from?, cc?, bcc?, replyTo? }
 * to peut être une string ou un tableau de strings
 */
app.post("/api/send", requireApiKey, async (req, res) => {
  if (!transporter) {
    return res.status(503).json({
      error: "SMTP non configuré. Définissez SMTP_HOST (et auth si besoin).",
    });
  }

  const { to, subject, text, html, from, cc, bcc, replyTo, headers } =
    req.body ?? {};

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({
      error:
        "Champs requis: to, subject, et au moins l'un de text ou html",
    });
  }

  const defaultFrom = process.env.MAIL_FROM;
  if (!from && !defaultFrom) {
    return res.status(400).json({
      error: "from manquant et MAIL_FROM non défini dans l'environnement",
    });
  }

  const extraHeaders =
    headers && typeof headers === "object" && !Array.isArray(headers)
      ? Object.fromEntries(
          Object.entries(headers)
            .filter(
              ([k, v]) =>
                typeof k === "string" &&
                k.trim() &&
                (typeof v === "string" || typeof v === "number"),
            )
            .map(([k, v]) => [k.trim(), String(v)]),
        )
      : undefined;

  try {
    const info = await transporter.sendMail({
      from: from || defaultFrom,
      to: Array.isArray(to) ? to.join(", ") : String(to),
      subject: String(subject),
      text: text !== undefined ? String(text) : undefined,
      html: html !== undefined ? String(html) : undefined,
      cc: cc
        ? Array.isArray(cc)
          ? cc.join(", ")
          : String(cc)
        : undefined,
      bcc: bcc
        ? Array.isArray(bcc)
          ? bcc.join(", ")
          : String(bcc)
        : undefined,
      replyTo: replyTo ? String(replyTo) : undefined,
      headers: extraHeaders,
    });

    res.json({
      ok: true,
      messageId: info.messageId,
      response: info.response,
    });
  } catch (err) {
    console.error("[send]", err);
    res.status(502).json({
      error: "Échec d'envoi SMTP",
      detail: err.message,
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Non trouvé" });
});

app.listen(port, () => {
  console.log(`Mini mail server sur http://127.0.0.1:${port}`);
  if (apiKey) console.log("Protection API: header X-API-Key requis sur POST /api/send");
  else console.log("Avertissement: aucune API_KEY — POST /api/send est ouvert");
  if (!transporter) console.log("Avertissement: SMTP non configuré (SMTP_HOST)");
});
