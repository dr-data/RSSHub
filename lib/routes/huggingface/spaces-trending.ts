import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/spaces-trending/:limit?',
    categories: ['programming'],
    example: '/huggingface/spaces-trending',
    parameters: { limit: 'Number of spaces to return (default: 20, max: 50)' },
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
            source: ['huggingface.co/spaces'],
            target: '/spaces-trending',
        },
    ],
    name: 'Trending Spaces',
    maintainers: [],
    handler,
    url: 'huggingface.co/spaces',
};

interface HFSpace {
    _id: string;
    id: string;
    likes: number;
    trendingScore: number;
    private: boolean;
    sdk: string;
    tags: string[];
    createdAt: string;
}

async function handler(ctx: any) {
    const limit = Math.min(Number(ctx.req.param('limit') ?? 20), 50);

    const response = await fetch(`https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=${limit}`);
    const spaces: HFSpace[] = await response.json();

    const items = spaces.map((space) => {
        const org = space.id.split('/')[0];
        const url = `https://huggingface.co/spaces/${space.id}`;
        return {
            title: space.id,
            link: url,
            description: `<p><strong>${space.id}</strong></p>
<p>SDK: ${space.sdk ?? 'N/A'} · Likes: ${space.likes} · Trending score: ${space.trendingScore}</p>
<p>Tags: ${space.tags?.join(', ') || 'none'}</p>
<p><a href="${url}">Open Space →</a></p>`,
            pubDate: parseDate(space.createdAt),
            author: org,
            category: space.tags ?? [],
        };
    });

    return {
        title: 'Hugging Face – Trending Spaces',
        link: 'https://huggingface.co/spaces',
        description: 'Trending spaces on Hugging Face, ranked by trendingScore',
        item: items,
    };
}
