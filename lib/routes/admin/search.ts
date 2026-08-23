import type { KVNamespace } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import type { Context } from 'hono';

// NOTE: namespaces is NOT imported at module level to avoid a circular dependency.
// lib/registry.ts uses directoryImport() which scans lib/routes/** and would load
// this file, which in turn would import lib/registry.ts — causing a deadlock.
// The import is deferred to getIndex() which is called on the first request.

type Bindings = {
    BROWSER?: unknown;
    CACHE?: KVNamespace;
    ACCESS_KEY?: string;
};

/** Compact route entry returned to the dashboard for client-side fuzzy search. */
export type RouteIndexEntry = {
    /** Human-readable route name */
    n: string;
    /** Source website hostname (e.g. "news.ycombinator.com") */
    u: string;
    /** Canonical example path (e.g. "/hackernews/best") */
    e: string;
    /** Category tags */
    c: string[];
};

let cachedIndex: RouteIndexEntry[] | null = null;

/**
 * Builds or returns the cached compact route index.
 * Called lazily on the first request to avoid the registry circular-import issue.
 */
async function getIndex(): Promise<RouteIndexEntry[]> {
    if (cachedIndex) {
        return cachedIndex;
    }
    const { namespaces } = await import('@/registry');
    const seen = new Set<string>();
    const entries: RouteIndexEntry[] = [];

    for (const [ns, nsData] of Object.entries(namespaces)) {
        for (const [, route] of Object.entries(nsData.routes)) {
            const example = route.example || `/${ns}`;
            if (seen.has(example)) {
                continue;
            }
            seen.add(example);
            entries.push({
                n: route.name || nsData.name || ns,
                u: (nsData.url as string) || '',
                e: example,
                c: (route.categories ?? nsData.categories ?? []) as string[],
            });
        }
    }

    cachedIndex = entries;
    return cachedIndex;
}

const app = new Hono<{ Bindings: Bindings }>();

/**
 * GET /api/routes/index
 * Returns the full compact route list for client-side fuzzy search.
 * The dashboard fetches this once on load and searches it locally with fuse.js.
 * Cache-Control is set to 1 hour since the route list only changes on redeploy.
 */
app.get('/', async (c: Context<{ Bindings: Bindings }>) => {
    const entries = await getIndex();
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json(entries);
});

export default app;
