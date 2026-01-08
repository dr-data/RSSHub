import { describe, expect, it, vi } from 'vitest';

import ofetch from '@/utils/ofetch';
import puppeteer from '@/utils/puppeteer';

import { route } from './feed';

// Mock ofetch
vi.mock('@/utils/ofetch', () => ({
    default: vi.fn(),
}));

// Mock puppeteer
vi.mock('@/utils/puppeteer', () => ({
    default: vi.fn(),
}));

describe('Universal Feed', () => {
    it('should generate feed items correctly from html using ofetch', async () => {
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
                tryGet: async (_key: string, fn: () => Promise<any>) => await fn(),
            },
        };

        const result = await route.handler(ctx);

        expect(result.title).toBe('RSS Feed for https://example.com');
        expect(result.item).toHaveLength(1);
        expect(result.item[0]).toEqual({
            title: 'Title 1',
            link: 'https://example.com/post/1',
            description: 'Desc 1',
            pubDate: '2023-01-01',
            author: 'Author 1',
        });
    });

    it('should generate feed items correctly using puppeteer', async () => {
        const mockHtml = `
            <html>
                <body>
                    <div class="item">
                        <h2 class="title">Puppeteer Title</h2>
                        <a class="link" href="/puppeteer">Puppeteer Link</a>
                    </div>
                </body>
            </html>
        `;

        const mockPage = {
            goto: vi.fn(),
            content: vi.fn().mockResolvedValue(mockHtml),
            close: vi.fn(),
        };

        const mockBrowser = {
            newPage: vi.fn().mockResolvedValue(mockPage),
        };

        (puppeteer as any).mockResolvedValue(mockBrowser);

        const ctx = {
            req: {
                query: (key: string) => {
                    const params = {
                        url: 'https://example.com',
                        item: '.item',
                        title: '.title',
                        link: '.link',
                        puppeteer: '1',
                    };
                    return params[key];
                },
            },
            cache: {
                tryGet: async (_key: string, fn: () => Promise<any>) => await fn(),
            },
        };

        const result = await route.handler(ctx);

        expect(puppeteer).toHaveBeenCalled();
        expect(mockBrowser.newPage).toHaveBeenCalled();
        expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
        expect(mockPage.content).toHaveBeenCalled();
        expect(mockPage.close).toHaveBeenCalled();

        expect(result.title).toBe('RSS Feed for https://example.com');
        expect(result.item[0].title).toBe('Puppeteer Title');
        expect(result.item[0].link).toBe('https://example.com/puppeteer');
    });

    it('should throw error if url or item selector is missing', async () => {
        const ctx = {
            req: {
                query: (_key: string) => null,
            },
            cache: {
                tryGet: async (_key: string, fn: () => Promise<any>) => await fn(),
            },
        };

        await expect(route.handler(ctx)).rejects.toThrow('Url and item selector are required');
    });
});
