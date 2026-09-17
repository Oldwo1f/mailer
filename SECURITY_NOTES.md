# Mailer security notes

The Mailer keeps a pragmatic production security boundary without making day-to-day configuration painful for Atelys.

## Current protections

- Admin login backed by an opaque server-side session cookie.
- Global default-deny NestJS guard for private routes.
- Public exceptions limited to login, health, tracking, unsubscribe and the authenticated-secret reply webhook.
- Production CORS allowlist with credentials enabled.
- `ready` drafts are reviewable but not sendable; only `approved` drafts enter the outbound queue.
- Nuxt login/logout flow and explicit per-draft approval controls.

## API keys and provider credentials

OpenAI, search providers, mail providers and SMTP credentials can be managed from the authenticated **Config** page and stored in the Mailer database. This is intentional so Adrien and Alexis can administer providers without editing the VPS environment for every key change.

For these settings the resolution order is:

1. value stored in the Mailer database;
2. matching environment variable as fallback.

Environment variables therefore remain useful for bootstrap/recovery, but are not required for every provider when the key is already configured in the application.

Infrastructure-level secrets should stay server-managed when practical, especially `ADMIN_PASSWORD_SCRYPT` and `REPLY_WEBHOOK_SECRET`.

## Production prerequisite

Generate an admin password verifier and add it to `.env.prod` on the VPS:

```bash
ADMIN_PASSWORD="choose-a-strong-password" node scripts/hash-admin-password.mjs
```

Copy only the emitted `saltBase64:hashBase64` value into:

```env
ADMIN_PASSWORD_SCRYPT=...
ADMIN_ORIGINS=https://mailing.aito-flow.com
```

Do not commit `.env.prod` or plaintext passwords/secrets.

## Important

Until `ADMIN_PASSWORD_SCRYPT` exists in production, the login endpoint intentionally returns a service-unavailable error rather than falling back to a default password.
