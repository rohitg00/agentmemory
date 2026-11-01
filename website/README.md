# agentmemory website

The agentmemory website uses Next.js 16 App Router, React 19 and TypeScript.
It includes the homepage, benchmarks, security, privacy, changelog and comparison
pages, with light and dark themes.

## Local dev

```bash
cd website
npm install
npm run dev
# open http://localhost:3000
```

`npm run dev` and `npm run build` first run `scripts/gen-meta.mjs`. It reads
the repository's package version, source counts and changelog, and refreshes
public GitHub and npm statistics. Failed network requests retain the previous
statistics. Keep the full repository checkout available when building.

To check the production build locally:

```bash
npm run build
npm start
```

The `/docs` paths proxy to Mintlify through `vercel.json` in production. A plain
Next.js local preview does not apply those Vercel rewrites.

## Content

- `app/` contains the page routes, metadata and shared theme styles.
- `components/site/` contains the homepage sections and CSS Modules.
- `lib/site.ts`, `lib/trust.ts` and `lib/rest.ts` hold shared product copy.
- `lib/llms.ts` generates the plain-text `llms.txt` and `llms-full.txt` pages.
- `app/security/page.tsx` describes the current runtime and authentication model.

The runtime uses iii Worker Compose with state, HTTP and agentmemory workers.
The REST API listens on port 3111 and the viewer on 3113 by default. Live viewer
updates use authenticated SSE through REST; there is no separate stream port or
bundled engine console. Keep website descriptions aligned with the runtime and
[upgrade guide](../docs/upgrades/iii-0.25.md). Historical changelog entries retain
the behavior of their release.

## Deploy

Import the repository into Vercel and set **Root Directory** to `website/`, or
run `npx vercel` from this directory. No environment variables are required.
