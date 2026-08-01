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

// 根据当前用户动态生成 Storage Key
window.getStorageKey = function getStorageKey() {
    const userId = localStorage.getItem('userId') || 'default';
    return `todo_list_data_${userId}`;
};

// 💡 新增/更新：将 localStorage 中导入的数据与 DB 比对，若不存在则调用 add，若 updateTime 大于 DB 则调用 update
window.syncImportedDataToDB = async function syncImportedDataToDB() {
    const userId = localStorage.getItem('userId') || 'default';
    const storageKey = `todo_list_data_${userId}`;;
    const localDataStr = localStorage.getItem(storageKey);
    if (!localDataStr) return;

    let localItems = [];
    try {
        localItems = JSON.parse(localDataStr);
    } catch (e) {
        console.error("解析本地导入数据失败", e);
        return;
    }

    if (!Array.isArray(localItems) || localItems.length === 0) return;

    try {
        // 1. 获取后端当前的最新数据列表，用于对比
        const response = await window.api.get('/item/list').catch(() => null);
        if (!response || response.data.code !== 200) {
            console.error("获取云端数据失败，无法进行比对同步");
            return;
        }

        const dbItems = response.data.data || [];
        // 将 DB 数据转为以 id 为 key 的 Map，方便快速查找
        const dbItemMap = new Map();
        dbItems.forEach(dbItem => {
            dbItemMap.set(dbItem.id, dbItem);
        });

        // 2. 遍历本地导入的数据
        for (const localItem of localItems) {
            const dbItem = dbItemMap.get(localItem.id);

            if (!dbItem) {
                // 💡 情况 A：DB 里没有这条数据，调用添加接口 (add)
                console.log(`云端未找到任务 [ID: ${localItem.id}]，正在执行新增插入...`);
                await window.api.post('/item/add', {
                    title: localItem.title,
                    categoryId: localItem.categoryId || 1,
                    isCompleted: localItem.isCompleted || 0,
                    dueDate: localItem.dueDate || '2111-11-11',
                    startTime: localItem.startTime || '08:00',
                    description: localItem.description || ''
                }).catch(err => {
                    console.error(`新增任务 [ID: ${localItem.id}] 到 DB 失败:`, err);
                });
            } else {
                // 💡 情况 B：DB 里存在该条数据，检查 updateTime 是否大于云端
                const localUpdateTime = localItem.updateTime ? new Date(localItem.updateTime).getTime() : 0;
                const dbUpdateTime = dbItem.update_time || dbItem.updateTime ? new Date(dbItem.update_time || dbItem.updateTime).getTime() : 0;

                if (localUpdateTime > dbUpdateTime) {
                    console.log(`本地任务 [ID: ${localItem.id}] 的 updateTime 大于云端，正在更新至 DB...`);

                    // 调用后端更新接口 (update)
                    await window.api.post('/item/update', {
                        id: localItem.id,
                        title: localItem.title,
                        isCompleted: localItem.isCompleted,
                        dueDate: localItem.dueDate,
                        startTime: localItem.startTime,
                        categoryId: localItem.categoryId,
                        description: localItem.description
                    }).catch(err => {
                        console.error(`更新任务 [ID: ${localItem.id}] 到 DB 失败:`, err);
                    });
                }
            }
        }
        console.log("导入数据的云端比对、新增与更新检查已全部完成。");
    } catch (err) {
        console.error("同步导入数据到 DB 发生异常:", err);
    }
}

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
