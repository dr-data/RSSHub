import { describe, expect, it, vi } from 'vitest';
import { route } from './feed';
import * as cheerio from 'cheerio';

// Mock ofetch
vi.mock('@/utils/ofetch', () => ({
    default: vi.fn(),
}));

// Mock puppeteer
vi.mock('@/utils/puppeteer', () => ({
    default: vi.fn(),
}));

import ofetch from '@/utils/ofetch';

describe('Universal Feed', () => {
    it('should generate feed items correctly from html', async () => {
        const mockHtml = `
            <html>
                <body>
                    <div class="item">
                        <h2 class="title">Title 1</h2>
                        <a class="link" href="/post/1">Link 1</a>
                        <div class="desc">Desc 1</div>
                        <span class="date">2023-01-01</span>
                        <span class="author">Author 1</span>
                    </div>
                    <div class="item">
                        <h2 class="title">Title 2</h2>
                        <a class="link" href="/post/2">Link 2</a>
                        <div class="desc">Desc 2</div>
                        <span class="date">2023-01-02</span>
                        <span class="author">Author 2</span>
                    </div>
                </body>
            </html>
        `;

        (ofetch as any).mockResolvedValue(mockHtml);

        const ctx = {
            req: {
                query: (key: string) => {
                    const params = {
                        url: 'https://example.com',
                        item: '.item',
                        title: '.title',
                        link: '.link',
                        desc: '.desc',
                        date: '.date',
                        author: '.author',
                    };
                    return params[key];
                },
            },
            cache: {
                tryGet: async (key: string, fn: () => Promise<any>) => await fn(),
            }
        };

        const result = await route.handler(ctx);

        expect(result.title).toBe('RSS Feed for https://example.com');
        expect(result.item).toHaveLength(2);
        expect(result.item[0]).toEqual({
            title: 'Title 1',
            link: 'https://example.com/post/1',
            description: 'Desc 1',
            pubDate: '2023-01-01',
            author: 'Author 1',
        });
        expect(result.item[1]).toEqual({
            title: 'Title 2',
            link: 'https://example.com/post/2',
            description: 'Desc 2',
            pubDate: '2023-01-02',
            author: 'Author 2',
        });
    });

    it('should throw error if url or item selector is missing', async () => {
         const ctx = {
            req: {
                query: (key: string) => {
                    return null;
                },
            },
            cache: {
                tryGet: async (key: string, fn: () => Promise<any>) => await fn(),
            }
        };

        await expect(route.handler(ctx)).rejects.toThrow('Url and item selector are required');
    });
});
