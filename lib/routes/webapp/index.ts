import type { Route } from '@/types';
import Webapp from '@/views/webapp';

export const route: Route = {
    path: '/',
    categories: ['other'],
    name: 'Feed Builder',
    maintainers: ['DIYgod'],
    handler,
};

function handler(ctx) {
    return ctx.html(Webapp({}));
}
