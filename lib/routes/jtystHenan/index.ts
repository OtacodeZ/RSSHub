import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/:fSeg/:sSeg/:tSeg?/:lSeg?',
    categories: ['government'],
    example: '/jtystHenan/zc/zdgk/zcwj',
    parameters: {
        fSeg: {
            description: '一级路径',
        },
        sSeg: {
            description: '二级路径',
        },
        tSeg: {
            description: '三级路径',
        },
        lSeg: {
            description: '四级路径',
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    handler,
    name: '河南省交通运输厅',
    maintainers: ['OtacodeZ'],
    description: `订阅河南省交通运输厅的news_box更新`,
};
async function handler(ctx) {
    const fSeg = ctx.req.param('fSeg') ?? '';
    const sSeg = ctx.req.param('sSeg') ?? '';
    const tSeg = ctx.req.param('tSeg') ?? '';
    const lSeg = ctx.req.param('lSeg') ?? '';

    const rootUrl = 'https://jtyst.henan.gov.cn';
    const fUrl = fSeg === '' ? '' : `/${fSeg}`;
    const sUrl = sSeg === '' ? '' : `/${sSeg}`;
    const tUrl = tSeg === '' ? '' : `/${tSeg}`;
    const lUrl = lSeg === '' ? '' : `/${lSeg}`;

    const currentUrl = `${rootUrl}${fUrl}${sUrl}${tUrl}${lUrl}`;

    const response = await ofetch(currentUrl);
    const $ = load(response);
    const title = $('title').text();

    const list = $('div.news_box li')
        .toArray()
        .map((item) => {
            item = $(item);
            const a = item.find('a').first();
            return {
                title: a.text(),
                link: a.attr('href') ?? '',
                pubDate: timezone(parseDate(item.find('span').text()), +8),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const response = await ofetch(item.link);
                const $ = load(response);
                item.description = $('.content').first().html();

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
