# Supabase Auth

Production authentication is owned by Supabase Auth. The browser stores the
Supabase session and sends its access token as `Authorization: Bearer ...` to
the Hono API. The backend verifies ES256 tokens against the project's public
JWKS and maps the Supabase subject to a stable row in `public.users`.

## Supabase project configuration

- Site URL: `https://kshiai.mk10.org`
- Redirect allow list:
  - `https://kshiai.mk10.org/auth/callback`
  - `http://localhost:5188/auth/callback`
  - `http://127.0.0.1:5188/auth/callback`
- Email provider: enabled
- Confirm email: required (`mailer_autoconfirm=false`)
- Google provider: enabled

The Google OAuth Web client must use this authorized redirect URI:

```text
https://cvrbhpkfqkpqdegxfrlq.supabase.co/auth/v1/callback
```

## Application configuration

Backend:

```dotenv
AUTH_PROVIDER=supabase
SUPABASE_URL=https://cvrbhpkfqkpqdegxfrlq.supabase.co
SUPABASE_JWKS_URL=https://cvrbhpkfqkpqdegxfrlq.supabase.co/auth/v1/.well-known/jwks.json
```

Frontend-safe values:

```dotenv
VITE_SUPABASE_URL=https://cvrbhpkfqkpqdegxfrlq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
```

`npm run sync:secdat` derives the Vite settings from `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. Google client credentials stay in the Supabase
project configuration and are never bundled into the frontend.

Local development can explicitly use `AUTH_PROVIDER=legacy` when Supabase
settings are absent. Production fails closed unless `AUTH_PROVIDER=supabase`.

## User mapping

Migration `0004_supabase_auth.sql` adds `users.auth_user_id` and `users.email`.
The first authenticated API request creates exactly one application user for a
Supabase subject. Existing character and battle foreign keys continue to use
the application user ID, so authorization remains stable.

Legacy username/password rows are not automatically linked by email. The old
system never verified email ownership, so automatic linking could transfer an
existing account to an unrelated verified address. A deliberate operator-led
linking workflow can be added if legacy production users need migration.

## Validation

```bash
secdat exec --inject secret:only=DIRECT_URL -- \
  npm run migrate:postgres --workspace @kshiai/backend -- --apply
npm run smoke:supabase-auth --workspace @kshiai/backend
```

The smoke creates a temporary confirmed Supabase user, performs a password
login, verifies the resulting JWT through the production JWKS path, checks the
application mapping, and deletes both temporary records.
