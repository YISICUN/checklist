// js/api.js

// 定义生产环境的基础 URL
const BASE_URL = 'https://checklist-backend-bqsf.onrender.com/api';

const api = axios.create({
    baseURL: BASE_URL,
    // 建议加上超时限制，防止后端容器冷启动时请求挂起
    timeout: 2000
});

// 添加请求拦截器
api.interceptors.request.use(config => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        // 携带用户身份
        config.headers['userId'] = userId;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

// 将 api 挂载到全局 window 对象上，方便在 HTML 中直接使用
window.api = api;


// ==========================================
// 🚀 统一注册 PWA Service Worker
// ==========================================
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        // 使用相对路径 './sw.js'，确保无论在哪个页面引入 api.js 都能正确找到根目录下的 sw.js
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('[PWA] Service Worker 注册成功，Scope:', registration.scope);
            })
            .catch((error) => {
                console.log('[PWA] Service Worker 注册失败:', error);
            });
    });
}
