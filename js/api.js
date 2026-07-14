// js/api.js

// 定义生产环境的基础 URL
const BASE_URL = 'https://checklist-backend-bqsf.onrender.com/api';

const api = axios.create({
    baseURL: BASE_URL,
    // 建议加上超时限制，防止后端容器冷启动时请求挂起
    timeout: 10000
});

// 添加请求拦截器
api.interceptors.request.use(config => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        // 携带用户身份
        config.headers['X-User-ID'] = userId;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

// 将 api 挂载到全局 window 对象上，方便在 HTML 中直接使用
window.api = api;