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

// 💡 挂载到 window 上，供直接打开html文件时全局调用
window.scanLocalUserIds = function scanLocalUserIds() {
    const idSet = new Set();

    // 1. 检查全局账号池记录
    const storedUsers = localStorage.getItem('logged_users');
    if (storedUsers) {
        try {
            const parsedUsers = JSON.parse(storedUsers);
            if (Array.isArray(parsedUsers)) {
                parsedUsers.forEach(id => idSet.add(String(id)));
            }
        } catch (e) { }
    }

    // 2. 检查当前的 userId
    const currentUserId = localStorage.getItem('userId');
    if (currentUserId) idSet.add(String(currentUserId));

    // 3. 遍历整个 localStorage 键名和对应的值，深度提取隐藏的 userId
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);

        // 兼容命名格式：匹配下划线加数字结尾，如 _44, _1
        const match1 = key.match(/_(\d+)$/);
        if (match1 && match1[1]) {
            idSet.add(match1[1]);
        }

        // 尝试解析 Value 是否为 JSON（对象或数组），如果是，则递归查找里面所有的 userId 字段
        if (value && (value.startsWith('[') || value.startsWith('{'))) {
            try {
                const parsedData = JSON.parse(value);
                const findUserIds = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    for (let k in obj) {
                        if (k === 'userId' && obj[k] !== undefined && obj[k] !== null) {
                            idSet.add(String(obj[k]));
                        } else if (typeof obj[k] === 'object') {
                            findUserIds(obj[k]);
                        }
                    }
                };
                findUserIds(parsedData);
            } catch (e) { }
        }
    }

    // 转换为数字排序，让下拉框井井有条
    return Array.from(idSet).sort((a, b) => Number(a) - Number(b));
};

// ==========================================
// 🚀 统一注册 PWA Service Worker
// ==========================================
// if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
//     window.addEventListener('load', () => {
//         // 使用相对路径 './sw.js'，确保无论在哪个页面引入 api.js 都能正确找到根目录下的 sw.js
//         navigator.serviceWorker.register('./sw.js')
//             .then((registration) => {
//                 console.log('[PWA] Service Worker 注册成功，Scope:', registration.scope);
//             })
//             .catch((error) => {
//                 console.log('[PWA] Service Worker 注册失败:', error);
//             });
//     });
// }
