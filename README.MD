# HMG Stones

React 18, TypeScript, Refine v5 and MUI application for stone selection, room design and sales workflows, using Taruvi authentication, data, functions and private storage.

## Local setup

1. Install dependencies with `npm ci` (Node.js 22 recommended).
2. Create an untracked `.env.local` with public configuration:

```env
TARUVI_SITE_URL=https://insurance.taruvi.cloud
TARUVI_APP_SLUG=hmg_stones
TARUVI_APP_TITLE=HMG Stones
```

3. Run `npm run dev` and sign in using your authorized Taruvi account.

Never commit environment files, API keys or access tokens. Do not expose credentials through `VITE_` variables. The legacy local gateway may require server-only configuration; the deployed frontend uses authenticated Taruvi native functions.

## Build

```sh
npm run typecheck
npm run build
```

The generated `dist/` directory is a deployment artifact and is not tracked. The build includes only approved public runtime assets; stone images remain in private Taruvi storage. Backend configuration, roles, policies, records and secrets are managed separately in Taruvi, not installed by cloning this repository.

## Backend source

`backend/hmg/functions/commands.py` contains the workflow implementation. `scripts/hmg/native-function-source.mjs` produces the native function source with the catalog registry and native entrypoint. `backend/hmg/schema.json` describes the application schema. Review and provision backend policies and functions separately before deploying to a new site.

## Scope of this source release

Local tests, development notes, deployment readbacks, environment files and build archives are deliberately excluded. A successful source build does not certify live backend authorization, database policies or deployment readiness.

## Attribution

Based on Taruvi-ai/taruvi-hacks-template (MIT). Blueprint3D and bundled dependencies retain their licenses and notices under `vendor/blueprint3d/` and `public/hmg-blueprint3d/`. Preserve these notices when redistributing.
