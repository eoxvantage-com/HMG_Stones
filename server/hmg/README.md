# HMG server gateway

Browser workflow calls use the same-origin `POST /api/hmg/workflow` endpoint, with
the platform `X-Session-Token`. Gallery and material image metadata is projected
through `/api/hmg/gallery` and `/api/hmg/materials`; image bytes are served only
through authenticated `POST /api/hmg/image-ticket` and short-lived opaque
`GET /api/hmg/private-images/<ticket>` URLs. The gateway validates the session and reads the
platform's current-user response before calling the restricted Taruvi workflow.
The same verifier requires an active HMG-role account before minting a ticket.
It resolves IDs only from the approved gallery/material catalogue, fetches the
private `hmg-gallery` bucket server-side, validates image type/signature and size,
then stores bounded bytes in a 60-second ticket cache. The sandboxed 3D renderer
can fetch only these opaque ticket URLs; it receives no API key, storage path, or
Taruvi URL. Only the server possesses the existing service API key. The Python function
independently requires its exact authorized service principal for `verifiedActor`.

## Local development

`vite.config.ts` mounts the handler in the existing Vite development server.
The default host/origin allowlist is localhost/127.0.0.1/IPv6 loopback on ports
5173 and 5174. Set `HMG_ALLOWED_ORIGIN` to one exact frontend origin for another
local hostname/port. It is not a CORS setting. No new development server was
started by this implementation.

The server reads `TARUVI_SITE_URL`, `TARUVI_APP_SLUG`, and `TARUVI_API_KEY` from
the server environment. Only `https://insurance.taruvi.cloud` / `hmg_stones` is
accepted. The key is never returned in HTTP responses or Vite browser defines.

## Production deployment requirement

A static frontend deployment alone is insufficient. Run the Node API process
behind the **same frontend origin** and reverse-proxy all `/api/hmg/*` gateway routes to it.
Preserve the original, explicitly allowed `Host` and `Origin` headers, and forward
`X-Session-Token`. Do not expose a second browser-facing cross-origin API.

Set these via the deployment's server secret/environment configuration:

- `TARUVI_SITE_URL=https://insurance.taruvi.cloud`
- `TARUVI_APP_SLUG=hmg_stones`
- `TARUVI_API_KEY`: the existing authorized service credential, server-only
- `HMG_ALLOWED_ORIGIN`: exact HTTPS frontend origin, no trailing slash/path
- `HMG_GATEWAY_PORT`: optional loopback port, default 8787

Configure the reverse proxy to redact `X-Session-Token`, authorization headers,
request bodies, and `/api/hmg/private-images/<ticket>` URL paths from access logs.
Never cache ticket issuance responses. Ticket URLs are bearer capabilities with
a maximum 60-second lifetime; the gateway bounds the in-memory cache to 128
entries / 32 MiB and each source image to 8 MiB. The private bucket must remain
private and the server credential must retain read access to it.

Then run `node server/hmg/start.mjs`. The process binds loopback only and does not
serve static files. Configure TLS, per-user/IP rate limiting and process supervision
at the trusted reverse proxy. Do not log authorization/session headers or bodies.
No production gateway or frontend was deployed as part of this change.

Workflow requests have a 64 KiB limit, fixed upstream URLs, redirect rejection, bounded
upstream responses and timeouts. Image requests are separately bounded and
never forward browser sessions to storage. No automatic write retry occurs: an uncertain
reply must be reconciled with a read and the original idempotency key.

Verification tests live in `tests/hmg/gateway.test.ts`; they use inert sentinel
credentials and mocked upstream responses. Live role tests must use separately
authenticated platform accounts and must not print/store sessions in the repository.

## Public reference catalogue

The same middleware also serves `GET /api/hmg/catalogue`. Reverse-proxy this path
alongside the workflow path. It accepts only bounded `search`, `tone`, `page`,
`pageSize`, or an `optionId`. It never accepts a function name, actor or URL.
Only six public reference strings are projected; arbitrary option JSON is removed.
Anonymous catalogue reads do not send session credentials or query projects.
Saving, personal projects and all commercial workflows still require verified login.
Apply edge rate limiting to this anonymous endpoint as well as authenticated APIs.
