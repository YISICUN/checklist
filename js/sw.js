// sw.js(Service Worker)
const CACHE_NAME = 'checklist-pwa-v1';

// 需要离线缓存的核心静态资源（包括你的页面、CDN、图标等）
const ASSETS_TO_CACHE = [
    './index.html',
    './trash.html',
    './js/api.js',
    './assets/images/favicon.ico',
    // 引入的 CDN 资源也可以预先缓存
    'https://unpkg.com/vue@3.5.40/dist/vue.global.js',
    'https://unpkg.com/axios@1.7.2/dist/axios.min.js'
];

// 1. 安装阶段：下载并缓存核心静态资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] 正在缓存静态资源');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // 跳过等待，直接激活新的 Service Worker
    self.skipWaiting();
});

// 2. 激活阶段：清理旧版本的缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] 清理旧缓存:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clientsClaim();
});

// 3. 请求拦截与缓存策略：优先从缓存读取，或者“网络优先/缓存降级”
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 对于后端 API 接口请求（假设你的 API 带有 /item/ 或其他特定路径）
    // 通常采用“网络优先”，断网时再由前端业务代码的 try...catch / LocalStorage 兜底
    if (url.pathname.startsWith('/item/') || url.pathname.startsWith('/user/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // 如果断网，API 请求失败，可以返回一个自定义的离线 JSON 响应
                return new Response(
                    JSON.stringify({ code: 503, message: '当前处于离线状态，操作暂未同步到服务器' }),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // 对于静态资源（HTML, JS, CSS, 图片等）：采用“缓存优先，后台更新”策略
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // 如果缓存中找到了，直接返回缓存（秒开）
                return cachedResponse;
            }
            // 没找到则发起真实网络请求
            return fetch(event.request).then((response) => {
                // 可以把动态请求到的静态资源也顺手存入缓存
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            }).catch(() => {
                // 如果既不在缓存又断网了，如果是 HTML 请求，可以返回离线提示页面
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
