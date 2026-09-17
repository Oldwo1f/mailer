# Admin authentication

The production admin uses a server-side opaque session cookie.

- Password verifier: `ADMIN_PASSWORD_SCRYPT` in server environment only.
- Cookie: `mailer_session`, HttpOnly, SameSite=Lax, Secure in production.
- Sessions are held in memory and therefore intentionally expire on backend restart.
- The global guard denies all routes by default; only routes decorated with `@Public()` bypass it.
- Never add reusable admin tokens to localStorage/sessionStorage.
