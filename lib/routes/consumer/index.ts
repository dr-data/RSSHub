import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/:category?/:language?/:keyword?',
    categories: ['new-media'],
    example: '/consumer',
    parameters: { category: '分类，见下表，默认为測試及調查', language: '语言，见下表，默认为繁体中文', keyword: '关键字，默认为空' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['consumer.org.hk/'],
        },
    ],
    name: '文章',
    maintainers: ['nczitzk'],
    handler,
    url: 'consumer.org.hk/',
    description: `分类

| 测试及调查 | 生活资讯 | 投诉实录  | 议题评论 |
| ---------- | -------- | --------- | -------- |
| test       | life     | complaint | topic    |

  语言

| 简体中文 | 繁体中文 |
| -------- | -------- |
| sc       | tc       |`,
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? 'test';
    const language = ctx.req.param('language') ?? 'tc';
    const keyword = ctx.req.param('keyword') ?? '';

    const rootUrl = 'https://www.consumer.org.hk';
    // NOTE: the original `/tc/free-article/free-article-<category>` path was
    // retired by consumer.org.hk in a 2024+ site migration; the current
    // article root is `/<language>` with detail pages at `/<language>/article/<slug>`.
    // We keep the legacy path as a primary probe so the route still behaves if
    // the upstream ever restores it, and fall back to scraping the language
    // root when the probe 404s. Either way we produce a valid feed so the
    // subscriber doesn't get stuck with a permanent errorAt.
    const legacyUrl = `${rootUrl}/${language}/free-article/free-article-${category}?category=free-article-${category}&q=${keyword}`;
    const fallbackUrl = `${rootUrl}/${language}`;

    let sourceUrl = legacyUrl;
    let response;
    try {
        response = await got({ method: 'get', url: legacyUrl });
    } catch (error: any) {
        // RSSHub's `got` is an ofetch shim; FetchError exposes `.status` /
        // `.statusCode` / `.response?.status` depending on path. Accept any of
        // them so the fallback kicks in on real 404s rather than rethrowing.
        const statusCode = error?.response?.status ?? error?.response?.statusCode ?? error?.status ?? error?.statusCode;
        if (statusCode !== 404) {
            throw error;
        }
        sourceUrl = fallbackUrl;
        response = await got({ method: 'get', url: fallbackUrl });
    }

    const $ = load(response.data);

    interface FeedItem {
        title: string;
        link: string;
        pubDate?: Date;
        description?: string;
    }

    // Strategy 1: legacy layout selectors (still used if the page structure
    // survived the migration).
    let items: FeedItem[] = $('.half-img-blk__title, .img-plate-blk__title')
        .find('a')
        .toArray()
        .map((raw) => {
            const a = $(raw);
            return {
                title: a.text(),
                link: `${rootUrl}${a.attr('href')}`,
                pubDate: parseDate(a.parent().prev().find('li').first().text(), 'YYYY.MM'),
            };
        });

    // Strategy 2: new site layout surfaces article detail pages at
    // `/<language>/article/<slug>`. Pick up any anchor matching that shape so
    // the feed keeps flowing after the migration.
    if (items.length === 0) {
        const seen = new Set<string>();
        items = $(`a[href^="/${language}/article/"]`)
            .toArray()
            .map<FeedItem | null>((raw) => {
                const a = $(raw);
                const href = a.attr('href') ?? '';
                if (!href || seen.has(href)) {
                    return null;
                }
                seen.add(href);
                const title = a.text().trim() || a.attr('title') || href;
                return { title, link: `${rootUrl}${href}` };
            })
            .filter((x): x is FeedItem => x !== null);
    }

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const detailResponse = await got({ method: 'get', url: item.link });
                    const content = load(detailResponse.data);
                    item.description = content('.ckec').html() || content('main').html() || '';
                } catch {
                    // Detail fetch failure should not kill the whole feed.
                    item.description = '';
                }
                return item;
            })
        )
    );

    return {
        title: $('title').text() || 'Consumer Council HK',
        link: sourceUrl,
        description: sourceUrl === fallbackUrl ? 'Legacy /free-article path retired upstream; showing articles from the language root.' : undefined,
        item: items,
    };
}
