import { load } from 'cheerio';

import type { Route } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/trending-simple/:since?/:language?',
    categories: ['programming'],
    example: '/github/trending-simple/daily/any',
    parameters: {
        since: 'Time range: daily (default), weekly, monthly',
        language: 'Programming language filter, use "any" for all (default)',
    },
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
            source: ['github.com/trending'],
            target: '/trending-simple/daily/any',
        },
    ],
    name: 'Trending Repositories (no auth)',
    maintainers: [],
    handler,
    url: 'github.com/trending',
};

async function handler(ctx: any) {
    const since = ctx.req.param('since') ?? 'daily';
    const language = ctx.req.param('language') === 'any' ? '' : (ctx.req.param('language') ?? '');

    const url = `https://github.com/trending/${encodeURIComponent(language)}?since=${since}`;

    const { data: html } = await got(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    });

    const $ = load(html);

    const items = $('article.Box-row')
        .toArray()
        .map((el) => {
            const $el = $(el);

            const repoPath = $el.find('h2 a').attr('href')?.replace(/^\//, '') ?? '';
            const [owner, name] = repoPath.split('/');
            const repoUrl = `https://github.com/${repoPath}`;

            const description = $el.find('p').first().text().trim();
            const language = $el.find('[itemprop="programmingLanguage"]').text().trim();
            const stars = $el.find('a[href$="/stargazers"]').text().trim().replaceAll(',', '');
            const forks = $el.find('a[href$="/forks"]').text().trim().replaceAll(',', '');
            const starsToday = $el.find('.float-sm-right').text().trim();

            return {
                title: `${owner}/${name}`,
                link: repoUrl,
                description: [description ? `<p>${description}</p>` : '', `<p>⭐ ${stars} stars · 🍴 ${forks} forks · ${starsToday}</p>`, language ? `<p>Language: ${language}</p>` : '', `<p><a href="${repoUrl}">${repoUrl}</a></p>`]
                    .filter(Boolean)
                    .join('\n'),
                author: owner,
                category: language ? [language] : [],
            };
        })
        .filter((item) => item.title !== '/');

    const langLabel = language || 'all languages';
    return {
        title: `GitHub Trending – ${since} (${langLabel})`,
        link: url,
        description: `Trending GitHub repositories (${since}, ${langLabel})`,
        item: items,
    };
}
