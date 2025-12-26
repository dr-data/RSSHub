import * as cheerio from 'cheerio';

import type { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import puppeteer from '@/utils/puppeteer';

export const route: Route = {
    path: '/feed',
    categories: ['other'],
    example: '/universal/feed?url=https%3A%2F%2Fgithub.com%2FDIYgod%2FRSSHub%2Freleases&item=.Box-row&title=.Link--primary&link=.Link--primary&desc=.markdown-body&date=relative-time',
    parameters: {
        url: 'Target URL',
        item: 'CSS selector for items',
        title: 'CSS selector for title',
        desc: 'CSS selector for description',
        link: 'CSS selector for link',
        date: 'CSS selector for date',
        author: 'CSS selector for author',
        puppeteer: 'Set to 1 to use Puppeteer',
    },
    name: 'Universal Feed',
    maintainers: ['DIYgod'],
    handler,
};

async function handler(ctx) {
    const url = ctx.req.query('url');
    const itemSelector = ctx.req.query('item');
    const titleSelector = ctx.req.query('title');
    const descSelector = ctx.req.query('desc');
    const linkSelector = ctx.req.query('link');
    const dateSelector = ctx.req.query('date');
    const authorSelector = ctx.req.query('author');
    const usePuppeteer = ctx.req.query('puppeteer') === '1';

    if (!url || !itemSelector) {
        throw new Error('Url and item selector are required');
    }

    const items = await ctx.cache.tryGet(`universal:${url}:${itemSelector}:${titleSelector}:${descSelector}:${linkSelector}:${dateSelector}:${authorSelector}:${usePuppeteer}`, async () => {
        let $;
        if (usePuppeteer) {
            const browser = await puppeteer();
            const page = await browser.newPage();
            try {
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                });
                const content = await page.content();
                $ = cheerio.load(content);
            } finally {
                await page.close();
            }
        } else {
            const response = await ofetch(url);
            $ = cheerio.load(response);
        }

        return $(itemSelector)
            .toArray()
            .map((elem) => {
                const $item = $(elem);
                // eslint-disable-next-line unicorn/no-array-callback-reference
                const title = titleSelector ? $item.find(titleSelector).text().trim() : 'No Title';
                // eslint-disable-next-line unicorn/no-array-callback-reference
                const linkUrl = linkSelector ? $item.find(linkSelector).attr('href') : url;
                // eslint-disable-next-line unicorn/no-array-callback-reference
                const description = descSelector ? $item.find(descSelector).html() : '';
                // eslint-disable-next-line unicorn/no-array-callback-reference
                const pubDate = dateSelector ? $item.find(dateSelector).attr('datetime') || $item.find(dateSelector).text().trim() : undefined;
                // eslint-disable-next-line unicorn/no-array-callback-reference
                const author = authorSelector ? $item.find(authorSelector).text().trim() : undefined;

                return {
                    title,
                    link: linkUrl ? new URL(linkUrl, url).href : undefined,
                    description,
                    pubDate,
                    author,
                };
            });
    });

    return {
        title: `RSS Feed for ${url}`,
        link: url,
        item: items,
    };
}
