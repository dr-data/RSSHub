// Worker-specific app configuration
// This is a simplified version of app-bootstrap.tsx for Cloudflare Workers
// Heavy middleware and API routes are excluded

import type { KVNamespace } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { jsxRenderer } from 'hono/jsx-renderer';
import { trimTrailingSlash } from 'hono/trailing-slash';

import { errorHandler, notFoundHandler } from '@/errors';
import accessControl from '@/middleware/access-control';
import cache from '@/middleware/cache';
import debug from '@/middleware/debug';
import header from '@/middleware/header';
import mLogger from '@/middleware/logger';
import template from '@/middleware/template';
import trace from '@/middleware/trace';
import registry from '@/registry';
import feedsAdmin from '@/routes/admin/feeds';
import routesSearch from '@/routes/admin/search';
import watchRoute from '@/routes/watch';
import { setKVNamespace } from '@/utils/cache/index.worker';
import { setBrowserBinding } from '@/utils/puppeteer';

// Define Worker environment bindings
type Bindings = {
    BROWSER?: any; // Browser Rendering API binding
    CACHE?: KVNamespace; // KV namespace for caching
    ACCESS_KEY?: string; // Optional access key for admin routes
    JINA_API_KEY?: string; // Optional Jina AI API key for higher rate limits
};

const app = new Hono<{ Bindings: Bindings }>();

// Set browser and KV bindings
app.use(async (c, next) => {
    if (c.env?.BROWSER) {
        setBrowserBinding(c.env.BROWSER);
    }
    if (c.env?.CACHE) {
        setKVNamespace(c.env.CACHE);
    }
    await next();
});

app.use(trimTrailingSlash());

// Cloudflare Workers handles compression at the edge, no need for compress()

app.use(
    jsxRenderer(({ children }) => <>{children}</>, {
        docType: '<?xml version="1.0" encoding="UTF-8"?>',
        stream: {},
    })
);
app.use(mLogger);
app.use(trace);

// Heavy middleware excluded in Worker build:
// - honeybadger: @honeybadger-io/js
// - sentry: @sentry/node
// - antiHotlink: cheerio
// - parameter: cheerio, sanitize-html, @jocmp/mercury-parser

app.use(cache);
app.use(accessControl);
app.use(debug);
app.use(template);
app.use(header);

app.route('/', registry);
app.route('/api/feeds', feedsAdmin);
app.route('/api/routes/index', routesSearch);
app.route('/watch', watchRoute);

/** GET /api/stats — dashboard system stats (KV counts, binding availability) */
app.get('/api/stats', async (c) => {
    const key = c.env?.ACCESS_KEY;
    const provided = c.req.header('X-Access-Key') ?? c.req.query('key');
    if (key && provided !== key) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    let totalFeeds = 0;
    let watchFeeds = 0;
    let snapshots = 0;
    if (kv) {
        const raw = await kv.get('admin:feeds');
        if (raw) {
            const feeds = JSON.parse(raw) as Array<{ path: string }>;
            totalFeeds = feeds.length;
            watchFeeds = feeds.filter((f) => f.path.startsWith('/watch')).length;
        }
        const listed = await kv.list({ prefix: 'watch:snap:' });
        snapshots = listed.keys.length;
    }
    return c.json({
        feeds: { total: totalFeeds, rss: totalFeeds - watchFeeds, watch: watchFeeds },
        snapshots,
        bindings: { kv: !!kv, browser: !!c.env?.BROWSER, jinaKey: !!c.env?.JINA_API_KEY },
        ts: new Date().toISOString(),
    });
});

/** DELETE /api/watch/snapshots — wipe all watch:snap:* and watch:items:* KV entries */
app.delete('/api/watch/snapshots', async (c) => {
    const key = c.env?.ACCESS_KEY;
    const provided = c.req.header('X-Access-Key') ?? c.req.query('key');
    if (key && provided !== key) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json({ error: 'KV not available' }, 503);
    }
    const [snaps, items] = await Promise.all([kv.list({ prefix: 'watch:snap:' }), kv.list({ prefix: 'watch:items:' })]);
    const keys = [...snaps.keys, ...items.keys].map((k) => k.name);
    await Promise.all(keys.map((k) => kv.delete(k)));
    return c.json({ deleted: keys.length });
});

app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
