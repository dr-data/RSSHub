import type { FC } from 'hono/jsx';

import { Layout } from '@/views/layout';

const Webapp: FC = () => (
    <Layout>
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6 text-[#F5712C]">RSSHub Feed Builder</h1>
            <p className="mb-8 text-zinc-600">Create your own RSS feed from any website by specifying CSS selectors.</p>

            <div className="bg-white shadow-md rounded-lg p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
                    <input type="text" id="url" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder="https://example.com/blog" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item Selector (Required)</label>
                        <input type="text" id="item" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder=".article-card" />
                        <p className="text-xs text-gray-500 mt-1">The CSS selector that matches each item in the list.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title Selector</label>
                        <input type="text" id="title" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder="h2.title" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link Selector</label>
                        <input type="text" id="link" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder="a.read-more" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description Selector</label>
                        <input type="text" id="desc" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder=".summary" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date Selector</label>
                        <input type="text" id="date" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder=".pub-date" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Author Selector</label>
                        <input type="text" id="author" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5712C]" placeholder=".author-name" />
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <input type="checkbox" id="puppeteer" className="rounded text-[#F5712C] focus:ring-[#F5712C]" />
                    <label className="text-sm font-medium text-gray-700">Use Puppeteer (for JS-heavy sites)</label>
                </div>

                <button id="generate-btn" className="w-full bg-[#F5712C] text-white font-bold py-3 px-4 rounded-md hover:bg-[#DD4A15] transition-colors">
                    Generate Feed URL
                </button>

                <div id="result-container" className="hidden mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Your RSSHub Feed URL:</p>
                    <div className="flex space-x-2">
                        <input type="text" id="result-url" readOnly className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-600" />
                        <a id="preview-link" href="#" target="_blank" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300">
                            Preview
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <script
            dangerouslySetInnerHTML={{
                __html: `
            document.getElementById('generate-btn').addEventListener('click', () => {
                const url = document.getElementById('url').value;
                const item = document.getElementById('item').value;
                const title = document.getElementById('title').value;
                const link = document.getElementById('link').value;
                const desc = document.getElementById('desc').value;
                const date = document.getElementById('date').value;
                const author = document.getElementById('author').value;
                const usePuppeteer = document.getElementById('puppeteer').checked;

                if (!url || !item) {
                    alert('URL and Item Selector are required!');
                    return;
                }

                const params = new URLSearchParams();
                params.append('url', url);
                params.append('item', item);
                if (title) params.append('title', title);
                if (link) params.append('link', link);
                if (desc) params.append('desc', desc);
                if (date) params.append('date', date);
                if (author) params.append('author', author);
                if (usePuppeteer) params.append('puppeteer', '1');

                const feedPath = '/universal/feed?' + params.toString();
                const fullUrl = window.location.origin + feedPath;

                document.getElementById('result-url').value = fullUrl;
                document.getElementById('preview-link').href = feedPath;
                document.getElementById('result-container').classList.remove('hidden');
            });
        `,
            }}
        />
    </Layout>
);

export default Webapp;
