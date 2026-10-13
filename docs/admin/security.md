# Security

How Fudo protects accounts and data. To report a vulnerability, see
[SECURITY.md](../../SECURITY.md).

| Topic | Implementation |
|---|---|
| Passwords | argon2id (19 MiB, t=2), at least 12 characters; unknown users get a dummy hash check, so timing does not reveal accounts |
| Sessions | 256-bit random token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored; rotated after 2FA |
| Two-factor authentication | TOTP (RFC 6238), mandatory for every account; secrets AES-256-GCM encrypted; used codes cannot be replayed |
| Brute force | per-IP rate limits on sign-in routes; accounts locked for 15 minutes after 5 failed attempts |
| CSRF | state-changing requests must be `application/json` (no cross-site simple requests) plus SameSite cookies |
| Secrets at rest | SMTP password, monitor credentials and channel secrets (webhook URLs, tokens) are AES-GCM encrypted with keys derived from `APP_SECRET`, and never returned to the browser, the API or exports |
| Invitations | 256-bit one-time links stored as SHA-256, valid 72 hours; 2FA-reset links also require the current password |
| Tenant isolation | PostgreSQL row-level security (`FORCE`) on tenant tables, enforced by running the application as a non-superuser role. Every request runs in a transaction scoped to one tenant or the global scope, so a missing filter returns nothing rather than another tenant's data. `/api/health` reports whether it is enforced |
| API tokens | `fudo_` + 240 random bits, only SHA-256 stored, bound to one scope and permission, optional expiry, revocable, last use recorded; cannot manage tokens, users, tenants or settings |
| Push URLs | random 24-byte token per monitor, replaceable; only records heartbeats for that monitor |
| Themes and language files | theme values must be plain colours (no `url()` or CSS); language codes are validated before files are read |
| Backups | encrypted with a passphrase (AES-256-GCM, scrypt), never with `APP_SECRET`; the passphrase of scheduled backups is stored encrypted. Created, restored, uploaded and deleted only by superadmins, and recorded in the audit log. A restore commits only after the whole file is authenticated, and saves the current state first |
| Audit | setup, sign-in and failures, lockouts, invitations, user, tenant and settings changes with before and after values |

**`APP_SECRET`** is the key to everything encrypted. Changing it makes stored 2FA secrets and
passwords unreadable; keep it with your backups and out of version control.
