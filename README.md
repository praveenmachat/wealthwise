# WealthWise Next

A fresh multi-user, mobile-first personal-finance PWA. This replaces the legacy front-end when published. It does not migrate or delete the legacy database.

## Run

Use Node 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm check`, then `pnpm dev`. The local preview is http://localhost:4173. Without backend configuration it displays explicitly labelled sample data. Preview edits last only for the open page session; AI and Gmail controls report that setup is required rather than pretending to work.

## Hosting

Netlify publishes `public/` and bundles functions from `netlify/functions/`. Tests run during every build. Legacy `/app.html` and `/login.html` URLs redirect to the new app. The previous Netlify deployment remains available for rollback.

## Connect real accounts

1. Create a separate Supabase project, apply `database/schema.sql` once, enable email confirmations, and configure production SMTP plus abuse protection. Set its Site URL and exact allowed redirect URLs to the new production domain. Verify signup, email confirmation and password recovery with real delivery before opening registration publicly.
2. Set Netlify Functions environment variables from `.env.example`. Never commit secrets. The config endpoint returns only the public Supabase URL/key. Generate a 32-byte random base64 `TOKEN_ENCRYPTION_KEY` and a separate random `JOB_SECRET` in a secure secret manager. Changing the encryption key without migrating stored ciphertext requires every user to reconnect Gmail.
3. Create a Google Cloud web OAuth client; enable Gmail API; add `https://<host>/api/gmail/callback` as the exact authorized redirect. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. During testing add designated test users. Public Gmail access needs Google verification and applicable restricted-scope assessment. OAuth in Google testing mode can expire refresh tokens in seven days; it is not a production automation setup.
4. Configure an OpenAI model supporting Responses structured outputs, images and PDF inputs using `OPENAI_MODEL` and the server-only provider credentials (or Netlify's injected OpenAI credentials). No model calls run during build. No source email is ever used as an instruction or allowed to execute arbitrary database commands.
5. Deploy and verify two-account isolation, Gmail connect/revoke, multiple statements, duplicate retries, stale manual edits, PDF and receipt parsing, and a morning run. The database/service/Gmail/AI integration is not validated merely by a successful static deploy.

## Implemented behavior

- Responsive overview, assets and liabilities, manual income/expense/transfer entry, recurring SIP plans, change history, export and a review inbox.
- Verified Supabase email/password authentication, confirmation callback and password recovery. Per-user data in `ww_workspaces`, RLS, server-verified identity, rate limits and revision-based conflict rejection. New accounts start empty.
- Server-side Gmail read-only OAuth with PKCE, single-use state, HttpOnly SameSite cookie, and AES-GCM-encrypted refresh tokens bound to each user. Secrets tables have no browser grants. Disconnect revokes the provider grant before removing the connection.
- Server retrieves the user's filtered email, processes body text and up to two PDFs (4 MB each), generates validated proposals, records source IDs, and prevents repeated message imports. One message per sync request bounds the interactive run; cursor supports subsequent requests. Unknown or unreadable documents are not fabricated.
- Receipt images and text requests use structured AI output; proposed commands are validated through the same domain logic as manual changes. Updating an existing record requires its old version to still match. Currency and balance-date checks prevent stale imported balances.
- Geojit HTML has an independent deterministic verifier. Auto-save requires an authenticated trusted sender, exact quantity × price reconciliation, matching total and unique ISINs, a dated statement, and an existing explicit account mapping. For development, map a stock's institution to `Geojit:<client-id>` and accountRef to its ISIN. This mapping needs a dedicated onboarding UI before broad use. Other source formats go to review; AI confidence alone never enables auto-save.
- Morning job dispatcher runs hourly; a background worker selects users at 07:00 in their saved timezone. It processes at most ten messages per user per invocation and maintains a cursor. Before broad launch replace the bounded single-worker scan with a durable queue, retries/backoff, per-user fairness and operational alerts. Missing credentials skip scheduling.

## Known limits / launch work

This is an initial implementation, not a fully validated public financial service. Production connections and Google verification remain external setup tasks. Asset fields currently capture current value, date, institution and notes, not complete amortization, maturity or market-quote models. Totals are per currency until a dated FX provider is integrated. Statement values are not live stock prices. Receipt originals are not retained by this app; model-provider retention follows the configured provider policy. Encrypted/password-protected PDFs need a separate secure flow. Invalid or unsupported model proposals may be omitted and require manual review; extraction completeness and statement reconciliation need additional institution-specific adapters. Account deletion, append-only normalized audit storage and scalable transaction/search indexes remain public-launch work. Workspaces currently cap at 4 MB and use a per-user JSON document with optimistic concurrency. Morning batches are bounded as above. Do not advertise these limits as completed features.

## Validation

`node --test tests/*.test.mjs` covers minor-unit arithmetic, multicurrency net worth, insurance and SIP accounting, transfer exclusion, transaction deduplication, request idempotency, stale proposals, valid dates, authenticated/mapped statement imports, ciphertext tampering/account binding, unauthorized requests and database conflict handling. Browser preview was checked on desktop and at 390px width, including saving a sample expense.

## Production Gmail configuration

The production OAuth callback is `https://wealthwisemsp.netlify.app/api/gmail/callback`. Google client credentials and token encryption are configured in Netlify's production environment, not in this repository. Gmail remains in Google testing mode until test-user authorization and public verification are completed.

Production extraction selects `gpt-4.1-mini` through `OPENAI_MODEL`. The OpenAI SDK uses Netlify AI Gateway's runtime credentials; no provider secret is included in the browser. AI requests consume the team's existing Netlify credits. Model-generated financial changes remain proposals requiring review.
