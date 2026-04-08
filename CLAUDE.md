# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                  # Node.js server with hot-reload (port 1200)
pnpm worker-dev           # Cloudflare Worker local dev (builds first)

# Testing
pnpm vitest               # Run tests once
pnpm vitest:watch         # Watch mode
pnpm vitest <pattern>     # Run a single test file, e.g. pnpm vitest hackernews

# Linting / formatting
pnpm lint                 # oxlint check
pnpm format               # oxlint --fix + oxfmt (auto-fix)

# Worker deployment
pnpm worker-build         # Build for Cloudflare Workers (dist-worker/)
wrangler deploy           # Deploy (skips rebuild — run worker-build first)
wrangler secret put ACCESS_KEY  # Set/update Worker secrets
```

`pnpm install --ignore-scripts` is required on Node.js v25+ because `sharp` native build fails on unsupported engines.

## Architecture

### Dual runtime

The codebase runs as both a **Node.js HTTP server** and a **Cloudflare Worker**:

- Node.js entry: `lib/index.ts` → `lib/app-bootstrap.tsx`
- Worker entry: `lib/worker.ts` → `lib/app.worker.tsx`

The Worker build uses `tsdown-worker.config.ts` which bundles everything into `dist-worker/worker.mjs`. Heavy middleware (cheerio, Sentry, anti-hotlink) is excluded from the Worker. Files with a `.worker.ts` suffix override their normal counterparts in the Worker bundle (resolved by `workerAliasPlugin` in `tsdown-worker.config.ts`).

### Route registry

Routes live under `lib/routes/{namespace}/`. The registry (`lib/registry.ts`) auto-discovers them:
- In dev/test: `directoryImport` scans `lib/routes/**` at startup
- In production/Worker: loads pre-built `assets/build/routes.js` (or `routes-worker.js`)

Before deploying the Worker, `pnpm build:routes:worker` must run to regenerate `assets/build/routes-worker.js`. This is part of `worker-build`.

**Circular import hazard**: any file inside `lib/routes/**` that imports from `@/registry` will cause a deadlock during `build-routes.ts` (which itself imports the registry via `directoryImport`). See `lib/routes/admin/search.ts` for the lazy-import pattern used to avoid this.

### Adding a new route

1. Create `lib/routes/{namespace}/namespace.ts` — exports `namespace: Namespace`
2. Create `lib/routes/{namespace}/index.ts` — exports `route: Route` with `path`, `handler`, and metadata
3. The handler receives a Hono `Context`, returns `Data` (`lib/types.ts`)
4. Middleware in `lib/app-bootstrap.tsx` / `lib/app.worker.tsx` automatically renders the returned `Data` as RSS/Atom/JSON via `lib/views/rss.tsx` and `lib/views/atom.tsx`

Minimal handler pattern:
```typescript
import type { Route, Data } from '@/types';
import got from '@/utils/got';         // HTTP client (axios-compatible)
import { load } from 'cheerio';        // HTML parsing (not available in Worker)

export const route: Route = {
    path: '/:param?',
    name: 'Feed Name',
    example: '/namespace/value',
    handler,
};

async function handler(ctx): Promise<Data> {
    const param = ctx.req.param('param');
    const res = await got('https://example.com');
    return { title: 'Feed', link: 'https://example.com', item: [] };
}
```

### Worker-only routes (admin/custom)

Routes that need direct KV access or bypass the registry are registered manually in `lib/app.worker.tsx`:

```typescript
app.route('/api/feeds', feedsAdmin);      // personal feed list CRUD (KV-backed)
app.route('/api/routes/index', routesSearch); // compact route list for dashboard
app.route('/watch', watchRoute);          // URL change monitor → RSS
```

These use `new Hono<{ Bindings: Bindings }>()` with:
```typescript
type Bindings = { CACHE?: KVNamespace; ACCESS_KEY?: string; BROWSER?: any; }
```

`c.env.CACHE` is the KV namespace. `c.env.ACCESS_KEY` is the auth secret set via `wrangler secret put`.

### Caching

- `cache.tryGet(key, fn, ttl?)` — wraps a fetch in the cache layer (KV in Worker, memory/Redis otherwise)
- Default route TTL: 5 min (`config.cache.routeExpire`), content TTL: 1 hour (`config.cache.contentExpire`)
- KV keys prefixed with `rsshub:cacheTtl:` are reserved by the cache module

### Dashboard

A static single-page admin UI at `/dashboard.html` (`lib/assets/dashboard.html`). It:
- Manages a personal feed list stored in `CACHE` KV under key `admin:feeds`
- Loads the full route index once from `/api/routes/index` and searches it client-side with fuse.js
- Provides a "Watch Any URL" form that creates `/watch?url=…` feeds (with optional `&js=true` for Jina AI JS rendering)
