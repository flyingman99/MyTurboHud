/**
 * 红果短剧 · TVBox js0 源（hongguo.js）
 * ------------------------------------------------------------------
 * 适用：FongMi 系 TVBox 客户端（TVBoxOSC / TVBoxOS / 影视仓 / takagen99 Box 等，
 *      QuickJS 引擎；站点配置 type=3，api 指向本文件）。
 *
 * 数据链路（全部走官网公开页面/接口，无任何逆向）：
 *   首页/分类  GET /                      解析 SSR 卡片（href="/detail?series_id=" + img alt + 全N集）
 *   分类翻页  GET /category/{tid}?page=N  同上
 *   搜索      GET /api/search/result/?query=关键词   JSON（series_id/封面/集数）
 *   详情      GET /detail?series_id={id}  解析 SSR 的 vid_list（全剧每集视频ID，一次拿全）
 *   播放      https://hongguoduanju.com/video/public/{vid}/360p.mp4 （直链，需 Referer 头）
 *
 * 说明：
 *   - 站点只提供 360p 一路转码（播放器 JS 亦只拼接 360p），属站点自身限制；
 *   - 连载中的剧集存在"未上线"集，直链会 404，播放器报错属正常现象，换已上线集即可；
 *   - CSS 类名带构建哈希（pc-xxx-XXXX）会随官网改版变化，故本源一律用
 *     URL 结构 / JSON 键名 / 属性文案等稳定锚点解析，不依赖易变的类名。
 */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var HOST = 'https://hongguoduanju.com';

var rule = {
    title: '红果短剧',
    host: HOST,
    hostJs: '',
    headers: { 'User-Agent': UA },
    timeout: 15000,
    limit: 36,
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    play_parse: false,
    isVideo: 'http'
};

// ————— HTTP 助手 —————
function hgGet(url) {
    try {
        return req(url, {
            method: 'GET',
            headers: {
                'User-Agent': UA,
                'Referer': HOST + '/',
                'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            }
        });
    } catch (e) {
        return { content: '' };
    }
}

// SSR JSON 字符串反转义
function hgUnescape(s) {
    if (!s) return '';
    return String(s)
        .replace(/\\u002F/g, '/')
        .replace(/\\u003D/g, '=')
        .replace(/\\u0026/g, '&')
        .replace(/\\u0027/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\\\/g, '\\');
}

/**
 * 解析卡片列表（首页/分类通用）。
 * 锚点：href="/detail?series_id=数字"；块内取 img(非空alt) 与 全N集。
 */
function hgParseCards(html) {
    var list = [];
    if (!html) return list;
    var seen = {};
    var re = /href="\/detail\?series_id=(\d+)"([\s\S]*?)(?=href="\/detail\?series_id=|$)/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var id = m[1];
        if (seen[id]) continue;
        var chunk = m[2].slice(0, 3000);
        // 真实封面 img：有 src 且 alt 非空（占位图 alt 为空，自动跳过）
        var pic = '';
        var altName = '';
        var imgRe = /<img[^>]*>/g;
        var im;
        while ((im = imgRe.exec(chunk)) !== null) {
            var tag = im[0];
            var src = /src="([^"]+)"/.exec(tag);
            var alt = /alt="([^"]*)"/.exec(tag);
            if (src && alt && alt[1] && /^https?:/.test(src[1])) {
                pic = src[1];
                altName = alt[1];
                break;
            }
        }
        // 剧名：优先卡片标题 <p class="pc-card-title-XXX">NAME</p>
        var name = '';
        var t = /<p class="[^"]*card-title[^"]*">\s*([^<]+?)\s*</.exec(chunk);
        if (t) name = t[1];
        if (!name) name = altName;
        if (!name) continue;
        seen[id] = 1;
        var remark = '';
        var r = /全\s*(\d+)\s*集/.exec(chunk);
        if (r) remark = '全' + r[1] + '集';
        list.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark
        });
    }
    return list;
}

function init(filter) {}

/** 首页：分类导航 + 推荐短剧列表 */
function home(filter) {
    var html = hgGet(HOST + '/').content;
    return JSON.stringify({
        class: [
            { type_id: 'real-drama', type_name: '真人剧' },
            { type_id: 'ai-drama', type_name: 'AI剧' },
            { type_id: 'comic-drama', type_name: '漫剧' }
        ],
        list: hgParseCards(html)
    });
}

function homeVod() {}

/** 分类：tid 为分类ID，pg 为页码（?page=N） */
function category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    var html = hgGet(HOST + '/category/' + tid + '?page=' + pg).content;
    var list = hgParseCards(html);
    return JSON.stringify({
        page: pg,
        pagecount: list.length > 0 ? 9999 : pg,
        limit: 36,
        total: 9999,
        list: list
    });
}

/** 搜索：/api/search/result/?query=关键词 */
function search(key, quick) {
    var list = [];
    try {
        var res = hgGet(HOST + '/api/search/result/?query=' + encodeURIComponent(key));
        var d = JSON.parse(res.content || '{}');
        var items = d.searchList || [];
        for (var i = 0; i < items.length; i++) {
            var vd = items[i].video_data || {};
            var sid = vd.series_id || items[i].keyword;
            if (!sid) continue;
            var remark = vd.episode_right_text || (vd.episode_cnt ? '全' + vd.episode_cnt + '集' : '');
            list.push({
                vod_id: String(sid),
                vod_name: vd.series_title || items[i].name || '',
                vod_pic: vd.series_cover || '',
                vod_remarks: remark
            });
        }
    } catch (e) {}
    return JSON.stringify({ page: 1, pagecount: 1, limit: 30, total: list.length, list: list });
}

/** 详情：一次请求拿全剧元数据 + 全量 vid_list（每集视频ID） */
function detail(id) {
    var html = hgGet(HOST + '/detail?series_id=' + id).content;
    var title = '';
    var t = /pc-hero-title-[^"]*">\s*([^<]+?)\s*</.exec(html);
    if (t) title = t[1];
    if (!title) {
        var tt = /<title[^>]*>([^<_]+)/.exec(html);
        if (tt) title = tt[1].trim();
    }
    var pic = '';
    var p = /"series_cover":"((?:[^"\\]|\\.)*)"/.exec(html);
    if (p) pic = hgUnescape(p[1]);
    var intro = '';
    var di = /"series_intro":"((?:[^"\\]|\\.)*)"/.exec(html);
    if (di) intro = hgUnescape(di[1]);
    var cnt = '';
    var c = /"episode_cnt":(\d+)/.exec(html);
    if (c) cnt = c[1];
    // 全剧视频ID列表；详情页没有则退回播放页再取一次
    var vids = [];
    var m = /"vid_list":\[([\d,"]+)\]/.exec(html);
    if (m) {
        vids = m[1].replace(/"/g, '').split(',');
    } else {
        var ph = hgGet(HOST + '/player/' + id).content;
        var m2 = /"vid_list":\[([\d,"]+)\]/.exec(ph);
        if (m2) vids = m2[1].replace(/"/g, '').split(',');
    }
    var urls = [];
    for (var i = 0; i < vids.length; i++) {
        var vid = vids[i].replace(/[^\d]/g, '');
        if (!vid) continue;
        urls.push('第' + (i + 1) + '集$' + HOST + '/video/public/' + vid + '/360p.mp4');
    }
    return JSON.stringify({
        list: [{
            vod_id: id,
            vod_name: title,
            vod_pic: pic,
            vod_year: '',
            vod_area: '',
            vod_actor: '',
            vod_director: '',
            vod_content: intro,
            vod_remarks: cnt ? '全' + cnt + '集' : '',
            vod_play_from: '红果',
            vod_play_url: urls.join('#')
        }]
    });
}

/** 播放：直链 MP4；官网 CDN 校验 Referer，必须带上 */
function play(flag, id, vipFlags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: {
            'User-Agent': UA,
            'Referer': HOST + '/',
            'Connection': 'keep-alive'
        },
        subs: []
    });
}

// —— 导出（JsSpider 会将 __JS_SPIDER__ = 重写为 export default）——
__JS_SPIDER__ = {
    rule: rule,
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    search: search,
    play: play
};
