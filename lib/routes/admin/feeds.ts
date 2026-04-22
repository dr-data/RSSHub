import type { KVNamespace } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { Hono } from 'hono';

type Bindings = {
    BROWSER?: unknown;
    CACHE?: KVNamespace;
    ACCESS_KEY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_API_BASE?: string;
};

type Feed = {
    id: string;
    path: string;
    label: string;
    addedAt: string;
    lastStatus?: 'ok' | 'error';
    lastError?: string;
    lastTestedAt?: string;
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

/** POST /api/feeds/:id/test — test a feed by id */
app.post('/:id/test', async (c) => {
    if (!isAuthorized(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json({ error: 'KV not available' }, 503);
    }
    const id = c.req.param('id');
    const feeds = await getFeeds(kv);
    const feedIndex = feeds.findIndex((f) => f.id === id);
    if (feedIndex === -1) {
        return c.json({ error: 'Feed not found' }, 404);
    }

    const feed = feeds[feedIndex];
    const url = new URL(feed.path, new URL(c.req.url).origin).toString();

    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'RSSHub-Dashboard/1.0' } });
        if (res.ok) {
            feed.lastStatus = 'ok';
            feed.lastError = undefined;
        } else {
            feed.lastStatus = 'error';
            feed.lastError = `HTTP ${res.status}: ${res.statusText}`;
        }
    } catch (error: any) {
        feed.lastStatus = 'error';
        feed.lastError = error.message || String(error);
    }

    feed.lastTestedAt = new Date().toISOString();
    feeds[feedIndex] = feed;
    await kv.put(KV_KEY, JSON.stringify(feeds));

    return c.json(feed);
});

/** POST /api/feeds/:id/smart-fix — use AI to suggest a fix for a feed error */
app.post('/:id/smart-fix', async (c) => {
    if (!isAuthorized(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const openAIApiKey = c.env?.OPENAI_API_KEY;
    if (!openAIApiKey) {
        return c.json({ error: 'OPENAI_API_KEY is not set in environment variables' }, 400);
    }
    const openAIApiBase = c.env?.OPENAI_API_BASE || 'https://api.openai.com/v1';

    const kv = c.env?.CACHE;
    if (!kv) {
        return c.json({ error: 'KV not available' }, 503);
    }

    const id = c.req.param('id');
    const feeds = await getFeeds(kv);
    const feed = feeds.find((f) => f.id === id);

    if (!feed) {
        return c.json({ error: 'Feed not found' }, 404);
    }

    if (!feed.lastError) {
        return c.json({ suggestion: 'No recent error found for this feed.' });
    }

    try {
        const prompt = `The RSS feed route "${feed.path}" failed with the following error:\n\n${feed.lastError}\n\nPlease suggest a technical explanation and a possible fix for this issue in the context of an RSS scraper. Keep it concise.`;

        const response = await fetch(`${openAIApiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openAIApiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${errBody}`);
        }

        const data = (await response.json()) as any;
        const suggestion = data.choices?.[0]?.message?.content || 'No suggestion could be generated.';

        return c.json({ suggestion });
    } catch (error: any) {
        return c.json({ error: error.message || 'Failed to communicate with AI service' }, 500);
    }
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
