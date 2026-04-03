import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/',
    categories: ['blog'],
    example: '/',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    handler,
    name: 'overreacted',
    maintainers: ['OtacodeZ'],
    description: `subscribe blog of overreacted`,
};
async function handler() {
    const rootUrl = 'https://overreacted.io';

    const currentUrl = rootUrl;

    const response = await ofetch(currentUrl);
    const $ = load(response);
    const title = $('title').text();

    const list = $('main div a')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const a = $item;
            const releLink = a.attr('href') ?? '';
            return {
                title: $item.find('h2').text(),
                link: `${rootUrl}${releLink}`,
                pubDate: timezone(parseDate($item.find('p').first().text()), +8),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const response = await ofetch(item.link);
                const $ = load(response);
                const itemDescription = $('main').first().html();
                const $desc = load(itemDescription, null, false);
                // 提示：加上 null, false 可以防止 Cheerio 自动包裹 <html> 和 <body> 标签

                // A. 剔除所有不需要的标签和组件
                $desc('style, script').remove(); // 砍掉样式、脚本和外链
                $desc('*').each((index, element) => {
                    // 移除 style 属性（比如 text-indent: 2em、margin 等）
                    $desc(element).removeAttr('style');
                    // 移除没用的 class，让 HTML 保持最简
                    $desc(element).removeAttr('class');
                });

                // 4. 拿到洗干净后的 HTML
                item.description = $desc.html().trim();

                return item;
            })
        )
    );
    return {
        title: title,
        link: currentUrl,
        item: items,
    };
}
