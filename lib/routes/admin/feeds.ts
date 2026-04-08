import type { KVNamespace } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import type { Context } from 'hono';

type Bindings = {
    BROWSER?: unknown;
    CACHE?: KVNamespace;
    ACCESS_KEY?: string;
};

type Feed = {
    id: string;
    path: string;
    label: string;
    addedAt: string;
};

const KV_KEY = 'admin:feeds';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Reads the feeds list from KV, returning an empty array if not set.
 */
async function getFeeds(kv: KVNamespace): Promise<Feed[]> {
    const raw = await kv.get(KV_KEY);
    if (!raw) {
        return [];
    }
    return JSON.parse(raw) as Feed[];
}

/**
 * Returns true if the request is authorized.
 * If ACCESS_KEY is not set on the Worker, all requests are allowed.
 */
function isAuthorized(c: Context<{ Bindings: Bindings }>): boolean {
    const accessKey = c.env?.ACCESS_KEY;
    if (!accessKey) {
        return true;
    }
    const provided = c.req.header('X-Access-Key') ?? c.req.query('key');
    return provided === accessKey;
}

/** GET /api/feeds — list all saved feeds */
app.get('/', async (c) => {
    if (!isAuthorized(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json([]);
    }
    return c.json(await getFeeds(kv));
});

/** POST /api/feeds — add a new feed { path, label? } */
app.post('/', async (c) => {
    if (!isAuthorized(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json({ error: 'KV not available' }, 503);
    }
    const body = await c.req.json<{ path: string; label?: string }>();
    if (!body.path || !body.path.startsWith('/')) {
        return c.json({ error: 'path must start with /' }, 400);
    }
    const feeds = await getFeeds(kv);
    const feed: Feed = {
        id: crypto.randomUUID(),
        path: body.path,
        label: body.label?.trim() || body.path,
        addedAt: new Date().toISOString(),
    };
    feeds.push(feed);
    await kv.put(KV_KEY, JSON.stringify(feeds));
    return c.json(feed, 201);
});

/** DELETE /api/feeds/:id — remove a feed by id */
app.delete('/:id', async (c) => {
    if (!isAuthorized(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json({ error: 'KV not available' }, 503);
    }
    const id = c.req.param('id');
    const feeds = await getFeeds(kv);
    await kv.put(KV_KEY, JSON.stringify(feeds.filter((f) => f.id !== id)));
    return c.json({ ok: true });
});

export default app;
