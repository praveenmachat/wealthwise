# Investing portfolio snapshot v1

`GET /api/investing/portfolio-snapshot` returns a read-only projection of one configured
`public.wealthwise_profiles` row. It uses the existing JSON document without a migration,
new database permissions, or writes. This is a server-to-server endpoint.

## Configuration

Set these through Netlify's environment-variable UI with **Functions** scope, in the
intended deployment context. Do not add values to the repository, browser code, build
output, screenshots, logs, or PR. Do not give production credentials to deploy previews.

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | HTTPS Supabase project origin, without path/query/credentials |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only service role credential |
| `INVESTING_PORTFOLIO_TOKEN` | Separate random 32-byte base64url bearer token (43 characters); 43–128 URL-safe characters accepted |
| `INVESTING_WEALTHWISE_USER_ID` | Exact `wealthwise_profiles.user_id` of the intended WealthWise user; not an email or assumed Supabase Auth UUID |

Generate the integration token with a cryptographically secure generator and store it
in the Investing backend's secret store. Never reuse the Supabase key. Send it only as
`Authorization: Bearer <token>` over HTTPS. Query parameters and all non-GET methods
are rejected. No browser CORS access is enabled.

To revoke, remove the token variable; to rotate, replace it with a newly generated token
and update the Investing backend. Redeploy the relevant Netlify context to apply environment
changes, then verify the old token fails. Existing deployments may retain their environment:
retire old deployment URLs carrying the old token when revoking access. The handler reads
configuration per invocation, but this does not override Netlify deployment lifecycle rules.

## Contract

Top-level fields are `schemaVersion: "1.0"`, `source: "wealthwise"`, `asOf` (ISO UTC
profile `updated_at`), `baseCurrency`, `holdings`, and `totalsByCurrency`.
`asOf` is the last profile sync time, **not a market quote timestamp**. Unsynced browser
edits are unavailable. There is no live pricing, FX conversion, trading, or write API.

Each holding has exactly: `assetClass`, `name`, `symbol`, `isin`, `exchange`, `currency`,
`quantity`, `averagePrice`, `lastPrice`, `costBasis`, `currentValue`, `unrealizedGain`,
and `valuationBasis`. Unavailable or inapplicable fields are `null`. Text is trimmed and
limited to 160 characters; symbols, ISINs, and currencies are uppercased. Consumers must
treat names and other text as untrusted plain text, never HTML.

| Stored collection | Class | Cost basis | Current value |
| --- | --- | --- | --- |
| `stocks` | `equity` | `qty * avg` | `qty * ltp` |
| `mf` | `mutual_fund` | `inv` | `val` |
| `crypto` | `crypto` | `qty * buy` | `qty * ltp` |
| `otherInv` | `other` | `inv` | `val` |
| `fds` | `fixed_deposit` | `prin` | `prin` (principal basis only) |
| `banks` | `cash` | `null` | `bal` |

Missing currencies follow the existing app defaults: USD for crypto, INR otherwise.
`baseCurrency` comes from `settings.baseCur`, default INR; it is display metadata only.
Absent collections are empty. Malformed collections/rows/currencies/timestamps fail with
502 rather than silently omitting holdings. Numeric strings in plain decimal notation
are accepted; invalid/missing numeric fields become null. Explicit zero stays zero.
Negative investment amounts are unsupported and become null; cash balances may be negative.
Numbers and calculated values must be finite and within JavaScript's safe integer magnitude.
Monetary calculations use floating-point numbers, so consumers should round for display.

Missing last prices remain unknown rather than falling back to purchase prices. Deposit
maturity proceeds (`matamt`) are not a current valuation, and deposit unrealized gain is
null. This deliberately differs from the app dashboard's price fallback and maturity-value
calculation. `valuationBasis` is `stored_price`, `stored_value`, `principal`, `balance`, or
`unknown`. Persisted cost bases may themselves be estimates made by earlier imports.

Currency totals contain `currency`, `holdingCount`, `unknownValueCount`,
`knownValueSubtotal`, and `totalValue`. `totalValue` is null if any holding in that currency
has an unknown value. No currencies are added together. Totals include cash but exclude
liabilities, and must not be labelled net worth. There are no stable holding IDs in v1.

The projection excludes email, user ID, display name, account/card numbers, wallet,
notes, expenses, liabilities, raw settings, raw JSON, and credentials. Unknown source
fields cannot pass through because every output field is explicitly constructed.

## Responses and validation

200 = snapshot; 400 = query parameters supplied; 401 = invalid/missing bearer;
404 = configured profile missing; 405 = non-GET (`Allow: GET`);
502 = upstream failure, 8-second timeout, or malformed snapshot;
503 = missing/invalid configuration (integration disabled).
All responses are JSON with browser and Netlify CDN caching disabled. Upstream responses
and exceptions are never echoed or logged. Redirects are rejected to protect credentials.

Run the isolated tests with Node 24: `node --test tests/portfolio-snapshot.test.mjs`.
They use synthetic data and a mocked Supabase REST response, including verification of
the exact GET query. No credentials or production data are required.

Before approving production release, validate a deploy preview with a separate test
Supabase project/profile and token: authorized 200, unauthorized 401, POST 405, query
override 400, correct currency totals, no private fields, and old-token rejection after
rotation/redeployment. A live Supabase request and Netlify routing smoke test are separate
from the local unit tests. Merge/deploy production only after explicit owner approval.

## Existing security boundary

The existing `/api/wealthwise-assistant` sync action accepts a caller-supplied user ID
without authenticating the caller and uses the service role to read/write profile data.
This pre-existing route is outside this additive endpoint change. The new bearer guard
does not secure that route or guarantee that stored data has not been modified through
it. Address its authentication/authorization before treating the overall integration
as a confidential, trustworthy production data source.

References: [Netlify Functions](https://docs.netlify.com/build/functions/overview/),
[Supabase REST API](https://supabase.com/docs/guides/api).
