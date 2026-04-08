import type { KVNamespace } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import type { Context } from 'hono';

type Bindings = {
    BROWSER?: unknown;
    CACHE?: KVNamespace;
    ACCESS_KEY?: string;
};

type WatchItem = {
    title: string;
    description: string;
    pubDate: string;
    guid: string;
};

const MAX_ITEMS = 20;

/** Hashes a string with SHA-256 and returns the first 16 hex characters. */
async function sha256Short(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}

/**
 * Strips HTML tags, scripts, and styles from a page and returns normalised
 * plain text. Used for content-change hashing — not for display.
 */
function extractText(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ')
        .replace(/&[a-z]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Escapes a string for safe inclusion in XML attributes and text nodes. */
function escXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Returns true if the hostname looks like a private/loopback address.
 * Guards against SSRF attacks.
 */
function isPrivateHost(hostname: string): boolean {
    return /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
}

/** Builds a minimal RSS 2.0 XML document from the stored watch items. */
function buildRss(title: string, link: string, selfUrl: string, items: WatchItem[]): string {
    const itemsXml = items
        .map(
            (item) => `
  <item>
    <title><![CDATA[${item.title}]]></title>
    <link>${escXml(link)}</link>
    <description><![CDATA[${item.description}]]></description>
    <pubDate>${item.pubDate}</pubDate>
    <guid isPermaLink="false">${escXml(item.guid)}</guid>
  </item>`
        )
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${escXml(link)}</link>
    <description><![CDATA[Monitoring changes on ${link}]]></description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escXml(selfUrl)}" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`;
}

const app = new Hono<{ Bindings: Bindings }>();

/**
 * GET /watch?url=https://example.com&label=My+Site
 *
 * Fetches the target URL, extracts plain text, hashes it, and compares against
 * the previous snapshot stored in KV. If the content changed (or this is the
 * first visit), a new RSS item is prepended to the stored change history and the
 * snapshot is updated. Returns an RSS 2.0 feed of all detected changes.
 *
 * The KV CACHE binding is used with two keys per watched URL:
 *   watch:snap:{hash16}  — last-seen content hash
 *   watch:items:{hash16} — JSON array of up to 20 change items
 */
/**
 * Fetches a URL via the Jina AI Reader proxy, which renders JavaScript and
 * returns clean markdown. Suitable for SPAs and JS-heavy pages.
 * Free tier, no API key required.
 */
async function fetchViaJina(url: string): Promise<string> {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
        headers: {
            'User-Agent': 'RSSHub/1.0 (+https://rsshub.app)',
            Accept: 'text/plain',
        },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
        throw new Error(`Jina returned HTTP ${res.status}`);
    }
    // Jina returns markdown — already clean, no HTML stripping needed
    return (await res.text()).trim();
}

app.get('/', async (c: Context<{ Bindings: Bindings }>) => {
    const rawUrl = c.req.query('url');
    const label = c.req.query('label') ?? '';
    const useJs = c.req.query('js') === 'true';

    if (!rawUrl) {
        return c.text('Missing required query parameter: url', 400);
    }

    // Validate URL and guard against SSRF
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return c.text('Invalid URL', 400);
    }
    if (!['http:', 'https:'].includes(target.protocol)) {
        return c.text('Only http and https URLs are supported', 400);
    }
    if (isPrivateHost(target.hostname)) {
        return c.text('Private and loopback addresses are not allowed', 403);
    }

    const feedTitle = label || `Watch: ${target.hostname}`;
    const kv = c.env?.CACHE;
    // Include js flag in the hash so static and JS-rendered watches are independent
    const urlHash = await sha256Short(rawUrl + (useJs ? ':js' : ''));
    const snapKey = `watch:snap:${urlHash}`;
    const itemsKey = `watch:items:${urlHash}`;

    // Load stored change history
    const storedItems: WatchItem[] = kv ? ((JSON.parse((await kv.get(itemsKey)) ?? '[]')) as WatchItem[]) : [];

    // Fetch the target page — direct fetch or via Jina AI for JS-rendered sites
    let fetchedText = '';
    let fetchError = '';
    try {
        if (useJs) {
            fetchedText = await fetchViaJina(rawUrl);
        } else {
            const res = await fetch(rawUrl, {
                headers: { 'User-Agent': 'RSSHub/1.0 (+https://rsshub.app)' },
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                fetchError = `HTTP ${res.status}`;
            } else {
                fetchedText = extractText(await res.text());
            }
        }
    } catch (err) {
        fetchError = String(err);
    }

    if (fetchedText && kv) {
        const newContentHash = await sha256Short(fetchedText);
        const prevContentHash = await kv.get(snapKey);

        if (prevContentHash !== newContentHash) {
            const isFirst = prevContentHash === null;
            const pubDate = new Date().toUTCString();
            const snippet = fetchedText.slice(0, 800);

            storedItems.unshift({
                title: isFirst ? `First snapshot: ${feedTitle}` : `Changed: ${feedTitle}`,
                description: isFirst
                    ? `<p>Monitoring started.</p><pre>${escXml(snippet)}</pre>`
                    : `<p>Content changed at ${pubDate}</p><pre>${escXml(snippet)}</pre>`,
                pubDate,
                guid: `${rawUrl}:${newContentHash}`,
            });

            const trimmed = storedItems.slice(0, MAX_ITEMS);
            await Promise.all([kv.put(snapKey, newContentHash), kv.put(itemsKey, JSON.stringify(trimmed))]);
            storedItems.splice(0, storedItems.length, ...trimmed);
        }
    }

    // If there are no items yet (KV unavailable or first fetch failed), return a placeholder
    if (!storedItems.length) {
        storedItems.push({
            title: fetchError ? `Error fetching ${feedTitle}: ${fetchError}` : `Waiting for first snapshot: ${feedTitle}`,
            description: fetchError ? `<p>Could not fetch: ${escXml(fetchError)}</p>` : '<p>No changes recorded yet. Poll again to capture the first snapshot.</p>',
            pubDate: new Date().toUTCString(),
            guid: `${rawUrl}:pending`,
        });
    }

    const selfUrl = c.req.url;
    const rss = buildRss(feedTitle, rawUrl, selfUrl, storedItems);
    return c.body(rss, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
});

export default app;
