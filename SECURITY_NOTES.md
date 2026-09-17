# Mailer security hardening

This branch introduces the first production security boundary before Atelys automation is extended.

## What changes

- Admin login backed by an opaque server-side session cookie.
- Global default-deny NestJS guard for private routes.
- Public exceptions limited to login, health, tracking and unsubscribe.
- Production CORS allowlist with credentials enabled.
- Production provider/search/SMTP/mailserver credentials are read from server environment only.
- `ready` drafts are reviewable but not sendable; only `approved` drafts enter the outbound queue.
- Nuxt login/logout flow and explicit per-draft approval controls.

## Production prerequisite before merge/deploy

Generate an admin password verifier and add it to `.env.prod` on the VPS:

```bash
ADMIN_PASSWORD="choose-a-strong-password" node scripts/hash-admin-password.mjs
```

Copy only the emitted `saltBase64:hashBase64` value into:

```env
ADMIN_PASSWORD_SCRYPT=...
ADMIN_ORIGINS=https://mailing.aito-flow.com
```

Do not commit `.env.prod` or the plaintext password.

## Important

Until `ADMIN_PASSWORD_SCRYPT` exists in production, the login endpoint intentionally returns a service-unavailable error rather than falling back to a default password.
