import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import { parseDate } from '@/utils/parse-date';
import puppeteer from '@/utils/puppeteer';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/:fSeg/:sSeg/:tSeg?/:lSeg?',
    categories: ['government'],
    example: '/jtysGansu/jtys/c106454/xxgk_list.shtml',
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
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    handler,
    name: '甘肃省交通运输厅',
    maintainers: ['OtacodeZ'],
    description: `订阅甘肃省交通运输厅的zfxx-right更新`,
};
async function handler(ctx) {
    const fSeg = ctx.req.param('fSeg') ?? '';
    const sSeg = ctx.req.param('sSeg') ?? '';
    const tSeg = ctx.req.param('tSeg') ?? '';
    const lSeg = ctx.req.param('lSeg') ?? '';

    const rootUrl = 'https://jtys.gansu.gov.cn';
    const pathSegments = [fSeg, sSeg, tSeg, lSeg].filter(Boolean);
    const currentUrl = `${rootUrl}/${pathSegments.join('/')}`;
    const browser = await puppeteer();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const type = request.resourceType();
        if (['document', 'script', 'xhr', 'fetch'].includes(type)) {
            request.continue();
        } else {
            request.abort();
        }
    });

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    logger.http(`Requesting ${currentUrl}`);

    try {
        await page.goto(currentUrl, {
            waitUntil: 'networkidle2', // 等待网络空闲
            timeout: 30000, // 超时时间 30 秒
        });

        const response = await page.content();

        const $ = load(response);
        const title = $('title').text();

        const list = $('div.zfxx-right li,div.right-con li')
            .toArray()
            .map((item) => {
                const $item = $(item);
                const a = $item.find('a').first();
                const releLink = a.attr('href') ?? '';
                return {
                    title: a.text().trim(),
                    link: `${rootUrl}${releLink}`,
                    pubDate: timezone(parseDate($item.find('b').text()), +8),
                };
            });

        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link, async () => {
                    const page = await browser.newPage();
                    await page.setRequestInterception(true);
                    page.on('request', (request) => {
                        const type = request.resourceType();
                        if (['document', 'script', 'xhr', 'fetch'].includes(type)) {
                            request.continue();
                        } else {
                            request.abort();
                        }
                    });
                    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                    logger.http(`Requesting ${item.link}`);

                    await page.goto(item.link, {
                        waitUntil: 'networkidle2', // 等待网络空闲
                        timeout: 30000, // 超时时间 30 秒
                    });

                    const response = await page.content();
                    page.close();
                    const $ = load(response);

                    const itemDescription = $('#zoom').first().html();

                    const $desc = load(itemDescription, null, false);
                    // 提示：加上 null, false 可以防止 Cheerio 自动包裹 <html> 和 <body> 标签

                    // A. 剔除所有不需要的标签和组件
                    $desc('style, script, link, iframe').remove(); // 砍掉样式、脚本和外链
                    $desc('.share-tools, #share-qrcode, .share-btn').remove(); // 砍掉分享按钮和二维码
                    $desc('.con-h').remove(); // 砍掉正文里重复的标题（阅读器一般会自带大标题）
                    // C. 抹除所有标签的内联样式（防止破坏阅读器的黑夜模式或默认字号）
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
    } finally {
        // 【注意4】无论成功还是失败，都必须在 finally 里关闭浏览器，防止僵尸进程常驻内存
        await page.close();
        await browser.close();
    }
}
