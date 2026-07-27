// js/app.js

const { createApp, ref, onMounted, computed, watch } = Vue;

// 使用全局挂载的 api 实例（来自 api.js）
const request = window.api;

createApp({
    setup() {
        // 定义响应式状态
        const dateDialog = ref(null); // 对应 <dialog ref="dateDialog">
        const loading = ref(true);
        const newTodoTitle = ref('');
        const tempCatId = ref(0);
        const tempDesc = ref(''); // 新增响应式变量，用于存储任务描述
        const tempDate = ref(''); // 利用现有的 ref 机制绑定 dialog 输入框
        const tempTitle = ref('');
        // 普通的响应式数组（const todoList = ref([])），用来存放从后端加载的所有、完整的待办事项数据。数据的唯一来源（Single Source of Truth）：无论是增、删、改、查，所有的操作最终都是直接对 todoList 里面的元素进行变更。
        const todoList = ref([]);
        const updateDialog = ref(null);
        let editingItem = null;

        // 💡 对话框逻辑相关的响应式变量
        const msgDialog = ref(null);
        const dialogMessage = ref("");
        const isConfirmMode = ref(false);
        const showDontAskAgain = ref(false);       // 控制是否显示“下次不再提示”
        const dontAskAgainChecked = ref(false);    // 记录勾选框状态
        let dialogResolve = null;
        let currentConfirmKey = null;              // 用于标识当前是哪个操作触发的确认（如删除）

        // 普通提示框 (替代原 alert)
        const showDialog = (msg) => {
            isConfirmMode.value = false;
            showDontAskAgain.value = false;
            dialogMessage.value = msg;
            if (msgDialog.value && typeof msgDialog.value.showModal === 'function') {
                msgDialog.value.showModal();
            }
        };

        // 确认交互框 (替代原 confirm，返回 Promise<boolean>)
        const showConfirm = (msg, options = {}) => {
            isConfirmMode.value = true;
            showDontAskAgain.value = !!options.showDontAskAgain;
            currentConfirmKey = options.key || null;
            dontAskAgainChecked.value = false;

            dialogMessage.value = msg;
            if (msgDialog.value && typeof msgDialog.value.showModal === 'function') {
                msgDialog.value.showModal();
            }
            return new Promise((resolve) => {
                dialogResolve = resolve;
            });
        };

        // 对话框“确定”按钮点击
        const handleDialogConfirm = () => {
            msgDialog.value.close();
            if (currentConfirmKey && dontAskAgainChecked.value) {
                // 如果用户勾选了“下次不再提示”，将其存入 localStorage
                localStorage.setItem(currentConfirmKey, 'true');
            }
            if (dialogResolve) {
                dialogResolve(true);
                dialogResolve = null;
            }
        };

        // 对话框“取消”按钮点击
        const handleDialogCancel = () => {
            msgDialog.value.close();
            if (dialogResolve) {
                dialogResolve(false);
                dialogResolve = null;
            }
        };

        // 在 setup() 中定义分类
        // 1. 响应式存储本地离线分类
        const dbCategories = ref([
            { id: 1, name: '未分类' },
            { id: 2, name: '每日' },
            { id: 3, name: '单次' },
            { id: 4, name: '工作' },
            { id: 5, name: '英语' },
            { id: 6, name: '阅读' },
            { id: 7, name: '健康' }
        ]);

        // 2. 构造一个包含“全部”的完整分类列表
        const categories = computed(() => {
            // id: 0 代表“全部”
            // console.log("计算属性 categories 被访问，当前 dbCategories: " + JSON.stringify(dbCategories.value));
            return [{ id: 0, name: '全部' }, ...dbCategories.value];
        });

        // 3. 选中项存储的是整个对象，不仅仅是 id
        const activeCategory = ref({ id: 0, name: '全部' }); // 当前选中的分类

        // 根据当前用户动态生成 Storage Key
        const getStorageKey = () => {
            const userId = localStorage.getItem('userId') || 'default';
            console.log("------------localStorage.getItem('userId'):" + userId);
            return `todo_list_data_${userId}`;
        };

        // 🔍 查询全件 (GET)
        const loadTodos = async () => {
            loading.value = true;
            console.log("loadTodos执行")
            const storageKey = getStorageKey(); // 👈 获取当前用户的专属 Key

            // 辅助函数：统一处理高亮逻辑
            const processItems = (rawList) => {
                const storedId = sessionStorage.getItem('highlight_id');
                const expiry = sessionStorage.getItem('highlight_expiry');
                const now = Date.now();

                return rawList.map(item => {

                    // 清洗时间：强制转为 HH:mm 格式
                    let cleanTime = '-';
                    if (item.startTime && item.startTime !== '-') {

                        // 如果包含秒，只截取前5位
                        cleanTime = item.startTime.substring(0, 5);
                    }

                    // 判断：如果有存储的ID，且没过期，则设为 true
                    const shouldHighlight = (storedId == item.id && now < expiry);

                    if (shouldHighlight) {
                        const remainingTime = expiry - now;
                        // 💡 修复隐患：确保定时器时间大于 0，避免负数导致立即失效或异常
                        const safeTimeout = remainingTime > 0 ? remainingTime : 5000;
                        setTimeout(() => {
                            item.isUpdating = false;
                        }, safeTimeout);
                    }

                    return {
                        ...item,
                        dueDate: item.dueDate || '2111-11-11',
                        startTime: timeOptions.includes(cleanTime) ? cleanTime : '08:00', // 👈 增加兜底
                        isUpdating: shouldHighlight
                    };
                });
            };

            try {
                // 1. 先尝试秒开：读取本地缓存并处理高亮后立即渲染
                const localData = localStorage.getItem(storageKey);
                if (localData) {
                    try {
                        const parsedLocal = JSON.parse(localData);
                        console.log("------------先尝试秒开：读取本地缓存并处理高亮后立即渲染---------");
                        todoList.value = processItems(parsedLocal);
                        console.log("------------已加载 localData---------");
                    } catch (e) {
                        console.error("解析本地缓存失败", e);
                    }
                }

                // 2. 发起网络请求获取最新数据
                const response = await request.get('/item/list').catch(() => null);

                // 清理过期的会话存储
                const now = Date.now();
                const expiry = sessionStorage.getItem('highlight_expiry');
                if (expiry && now >= expiry) {
                    sessionStorage.removeItem('highlight_id');
                    sessionStorage.removeItem('highlight_expiry');
                }

                if (response && response.data.code === 200) {
                    // 先执行一次同步（把之前断网时存的本地数据传上去）
                    await syncOfflineData();

                    // 然后再正常处理数据并更新视图
                    todoList.value = processItems(response.data.data);
                    // 🔥 关键：将后端最新数据同步写入 localStorage，保证下次秒开是最新的
                    localStorage.setItem(storageKey, JSON.stringify(response.data.data));

                } else if (response) {
                    // 后端返回业务错误码
                    showDialog('数据加载失败：' + response.data.message);
                } else {
                    // response 为 null 说明网络断开或后端未启动
                    if (!localData) {
                        showDialog('无法连接到后端服务，且无本地缓存可用！');
                    } else {
                        console.log("网络请求失败，当前正在使用本地缓存数据兜底");
                    }
                }
            } catch (err) {
                console.error(err);
                showDialog('无法连接到后端服务，请确认后端已启动！');
            } finally {
                loading.value = false;
            }
        };

        // 💡 添加任务 (POST) - 包含离线降级与本地持久化兜底
        const addTodo = async () => {
            if (!newTodoTitle.value) return showDialog('任务名不能为空！');
            // 1. 获取当前选中的分类 ID
            let targetCategoryId = activeCategory.value.id;

            console.log("添加任务时，当前选中分类ID:", targetCategoryId, "类型:", typeof targetCategoryId);
            // 2. 逻辑守门员：如果选中了“全部”(id=0)，则强制将其 ID 改为 1 (未分类)
            if (targetCategoryId === 0) {
                targetCategoryId = 1;
            }
            try {
                const response = await request.post('/item/add', {
                    title: newTodoTitle.value,
                    categoryId: targetCategoryId,
                    isCompleted: 0
                }).catch(() => null);

                if (response && response.data.code === 200) {
                    newTodoTitle.value = ''; // 清空输入框
                    await loadTodos();       // 刷新列表
                } else {
                    console.log('添加失败: ' + (response ? response.data.message : '网络异常'));

                    // 离线状态下前端直接创建并持久化
                    console.log("后端请求失败，正在启用前端离线直接创建兜底...");

                    // 1. 构造一个临时的本地任务对象（用负数或时间戳作为临时 id 避免冲突）
                    const offlineItem = {
                        id: Date.now(), // 临时唯一 ID
                        title: newTodoTitle.value,
                        categoryId: targetCategoryId,
                        isCompleted: 0,
                        dueDate: '2111-11-11',
                        startTime: '08:00',
                        isSynced: false, // 👈 核心：标记为未同步状态
                        sortOrder: todoList.value.length > 0 ? todoList.value[todoList.value.length - 1].sortOrder + 1 : 1
                    };

                    // 2. 压入本地响应式列表
                    todoList.value.push(offlineItem);

                    // 3. 强行同步写入 localStorage（因为有 watch，其实会自动写，但这里安全起见也可以手动触发或清空输入框）
                    newTodoTitle.value = '';

                    showDialog('已为您在本地离线创建任务，恢复网络后将同步为最新状态同步。');
                }
            } catch (err) {
                console.error(err);
                showDialog('发生异常，请检查网络连接！');
            }
        };

        // 🔄 关键：Checkbox 状态触发变更 (POST/PUT)
        // 对应前后端数据模型转换逻辑
        const handleStatusToggle = async (item) => {
            try {
                // 依据后端实现，这里将整条 item（包含最新的 isCompleted 数字）传给后端
                const response = await request.post('/item/update', {
                    id: item.id,
                    title: item.title,
                    isCompleted: item.isCompleted, // 此时值已经是自动转换好的 1 或 0
                    categoryId: item.categoryId
                }).catch(() => null);

                if (response && response.data.code !== 200) {
                    console.log('状态更新失败: ' + response.data.message);
                    // 冗余安全设计（回滚）：后端若失败，前端状态倒腾回去
                    item.isCompleted = item.isCompleted === 1 ? 0 : 1;
                }
            } catch (err) {
                console.error('网络请求失败，状态回滚', err);
                item.isCompleted = item.isCompleted === 1 ? 0 : 1;
            }
        };

        // 批量切换状态
        const toggleAllStatus = async () => {
            // 1. 判断：如果当前列表里有任何一个是未完成的，就全部置为完成；否则全部置为未完成
            const hasUncompleted = filteredTodoList.value.some(item => item.isCompleted === 0);
            const newStatus = hasUncompleted ? 1 : 0;

            // 2. 构造发送给后端的数组
            // 我们只需要发送包含 id 和目标 isCompleted 的最小化对象集
            const itemsToUpdate = filteredTodoList.value.map(item => ({
                id: item.id,
                isCompleted: newStatus
            }));

            try {
                // 3. 发送批量请求
                // 确保使用配置好的拦截器实例
                const response = await request.post('/item/updateBatch', itemsToUpdate).catch(() => null);

                // 4. 根据后端返回的 code 处理结果
                if (response && response.data.code === 200) {
                    // 批量更新成功：更新本地列表的响应式状态
                    filteredTodoList.value.forEach(item => {
                        item.isCompleted = newStatus;
                    });
                } else {
                    // 错误处理
                    console.log('联网环境的批量更新失败: ' + (response ? response.data.message : '网络异常或离线'));
                }
            } catch (err) {
                console.error("出现了预料外的异常,状态回滚:", err);
                filteredTodoList.value.forEach(item => {
                    item.isCompleted = newStatus === 1 ? 0 : 1;
                });
            }
        };

        // 📝 修改任务文本内容 (POST)
        const updateTodoTitle = async (item) => {
            const newTitle = prompt("修改任务内容:", item.title);
            // 逻辑守门员：处理空值、无变化或取消的情况
            if (newTitle === null || newTitle === item.title || newTitle.trim() === '') return;

            try {
                const response = await request.post('/item/update', {
                    id: item.id,
                    title: newTitle,
                    isCompleted: item.isCompleted,
                    categoryId: item.categoryId
                }).catch(() => null);

                item.title = newTitle;
                if (response && response.data.code === 200) {
                    await loadTodos(); // 刷新列表
                }
            } catch (err) {
                console.error(err);
            }
        };

        // 💬 打开修改对话框
        const openUpdateDialog = (item) => {
            editingItem = item;
            tempTitle.value = item.title;
            tempCatId.value = item.categoryId;
            tempDesc.value = item.description || ""; // 💡 2. 赋值时带上原描述，若为空则给空串
            updateDialog.value.showModal();
        };

        // 保存修改（支持离线）
        const saveUpdate = async () => {
            if (!tempTitle.value.trim()) return;

            // 1. 无论线上线下，先把内存中正在编辑的对象更新掉（保证页面立刻响应）
            editingItem.title = tempTitle.value;
            editingItem.categoryId = tempCatId.value;
            editingItem.description = tempDesc.value;

            // 2. 关闭弹窗
            updateDialog.value.close();

            try {
                // 3. 尝试向后端发送更新请求
                const response = await request.post('/item/update', {
                    id: editingItem.id,
                    title: editingItem.title,
                    isCompleted: editingItem.isCompleted,
                    dueDate: editingItem.dueDate,
                    startTime: editingItem.startTime,
                    categoryId: editingItem.categoryId,
                    description: editingItem.description
                }).catch(() => null);

                if (response && response.data.code === 200) {
                    // 联网成功：顺便调用 loadTodos 保持绝对同步
                    await loadTodos();
                } else {
                    // 离线或后端返回错误：因为前面已经改了 editingItem，
                    // 且 todoList 触发了 watch，数据会自动写入 localStorage，所以这里只需给个温和的提示或静默降级
                    console.log("后端同步失败，已通过本地缓存完成离线修改。");
                }
            } catch (err) {
                console.error("保存修改异常:", err);
            }
        };

        // 💡 修改任务截止日期为今天
        const updateToday = (item) => {
            editingItem = item;
            tempDate.value = item.dueDate === '2111-11-11' ? new Date().toISOString().split('T')[0] : item.dueDate;
            dateDialog.value.showModal();
        };

        // 通过日期修改对话框,修改截止日期
        const confirmDateUpdate = async () => {
            if (editingItem) {
                editingItem.dueDate = tempDate.value;
                await updateDate(editingItem);
                dateDialog.value.close();
            }
        };

        // 🗓️ 日期选择器清除事件处理
        const handleDateClear = (event, item) => {
            // 如果用户点击了清除，event.target.value 会变为空字符串
            console.log("日期选择器触发事件，当前值:", event.target.value);
            if (event.target.value === '') {
                item.dueDate = '2111-11-11';
                // console.log("用户清除了日期，自动设置为每日标记:", item.dueDate);
            }
            updateDate(item);
        };

        // 💡 修改任务截止日期 (POST)
        const updateDate = async (item) => {
            try {
                const response = await request.post('/item/update', {
                    id: item.id,
                    title: item.title,
                    isCompleted: item.isCompleted,
                    dueDate: item.dueDate,
                    startTime: item.startTime
                }).catch(() => null);

                if (response && response.data.code === 200) {
                    await loadTodos(); // 刷新列表
                } else {
                    console.log('联网环境的日期修改失败: ' + (response ? response.data.message : '网络异常'));
                }
            } catch (err) {
                // 💡 记录代码运行期的异常日志，方便你调试查错
                console.error("程序运行异常:", err);

                // 💡 给用户一个安全的底线提示
                showDialog("发生了一些意外，请稍后重试");
            }
        };

        // 🗑️ 删除任务 (支持“下次不再提示”)
        const deleteTodo = async (id) => {
            const skipConfirm = localStorage.getItem('skip_delete_confirm') === 'true';

            if (!skipConfirm) {
                const confirmed = await showConfirm('确定删除吗？(将会放入回收站)', {
                    showDontAskAgain: true,
                    key: 'skip_delete_confirm'
                });
                if (!confirmed) return;
            }

            try {
                const response = await request.post(`/item/delete/${id}`).catch(() => null);

                // 本地直接移除
                todoList.value = todoList.value.filter(item => item.id !== id);

                if (response && response.data.code === 200) {
                    await loadTodos(); // 刷新列表
                } else {
                    console.log("联网环境的删除失败: " + (response ? response.data.message : '网络异常'));
                }
            } catch (err) {
                console.error(err);
                showDialog("网络请求失败，请稍后再试");
            }
        };

        // 时间选择器选项生成（每半小时一个选项）
        const timeOptions = [];
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hour = h.toString().padStart(2, '0');
                const minute = m.toString().padStart(2, '0');
                timeOptions.push(`${hour}:${minute}`);
            }
        }

        // 统一的更新时间逻辑
        const updateTime = async (item) => {
            // 1. 立即给该项设置标红状态
            item.isUpdating = true;

            // 存入当前时间戳，确保能记录是哪一个被更新了
            sessionStorage.setItem('highlight_id', item.id);
            sessionStorage.setItem('highlight_expiry', Date.now() + 5000); // 5秒后过期

            try {
                await request.post('/item/update', {
                    id: item.id,
                    title: item.title,
                    isCompleted: item.isCompleted,
                    dueDate: item.dueDate,
                    startTime: item.startTime,
                    categoryId: item.categoryId
                }).catch(() => null);

                // 2. 标红 5 秒后恢复
                setTimeout(() => {
                    item.isUpdating = false;
                }, 5000);

                // 3. 排序重排：刷新列表
                // 注意：因为刷新会导致 DOM 重绘，只要 item 对象在列表里，状态就会保留
                await loadTodos();

            } catch (err) {
                showDialog("时间更新失败: " + err.message);
            }
        };

        // 监听 todoList 的变化，自动实现数据持久化（LocalStorage）
        watch(todoList, (newValue) => {
            const storageKey = getStorageKey(); // 👈 获取当前用户的专属 Key
            localStorage.setItem(storageKey, JSON.stringify(newValue));
        }, { deep: true });

        // 强制聚焦输入框函数
        const focusInput = () => {
            // 💡 新增：强制聚焦到输入框
            setTimeout(() => {
                const input = document.querySelector('input[type="text"]');
                if (input) {
                    input.focus();
                }
            }, 500); // 延迟 500ms，确保数据加载完成且 DOM 渲染完毕
        };

        // 1. 定义搜索关键词变量
        const searchKeyword = ref("");

        // 计算属性：根据 activeCategory 过滤 todoList
        const filteredTodoList = computed(() => {
            // focusInput(); //调用了包含 setTimeout 和 DOM 操作的 focusInput()。由于计算属性会频繁触发，这不仅会严重干扰用户输入，还极易引发渲染性能崩溃。

            // 1. 先根据当前选中的分类进行过滤
            let list = todoList.value.filter(item => Number(item.deleteFlag) === 0);
            if (activeCategory.value.id !== 0) {
                list = list.filter(item => item.categoryId === activeCategory.value.id);
            }

            // 2. 如果用户输入了搜索关键词，再对上一步的结果进行模糊匹配
            if (searchKeyword.value) {
                const keyword = searchKeyword.value.toLowerCase();
                list = list.filter(item => item.title.toLowerCase().includes(keyword));
            }

            return list;
        });

        // 3. 在 setup 内部使用 request
        const loadCategories = async () => {
            try {
                // 1. 加上离线兜底，防止断网时报错
                const res = await request.get('/category/list').catch(() => null);
                // 2. 只有请求成功拿到数据时才更新
                if (res && res.data) {
                    dbCategories.value = res.data;

                    // 3. 必须保留这个状态恢复，防止当前选中分类丢失引用
                    if (activeCategory.value.id !== 0) {
                        const restored = dbCategories.value.find(c => c.id === activeCategory.value.id);
                        if (restored) activeCategory.value = restored;
                    }
                }
            } catch (error) {
                console.error("加载分类失败", error);
            }
        };

        // 退出登录函数 (已将原有 confirm 改为 showConfirm)
        const logout = async () => {
            const confirmed = await showConfirm("确定要退出登录吗？");
            if (!confirmed) return;

            // 1. 清除本地存储的 userId
            localStorage.removeItem('userId');

            // 2. 跳转回登录页
            window.location.href = 'login.html';

        };

        // 🔄 自动同步本地离线未上传的数据
        const syncOfflineData = async () => {
            // 1. 检查当前网络是不是通的（可以简单试探一下，或者直接发请求）
            // 2. 筛选出所有未同步的数据 (isSynced === false)
            const unsyncedItems = todoList.value.filter(item => item.isSynced === false);

            if (unsyncedItems.length === 0) return;

            console.log(`检测到有 ${unsyncedItems.length} 条本地离线数据需要同步...`);

            for (const item of unsyncedItems) {
                try {
                    // 发送请求给后端创建
                    const response = await request.post('/item/add', {
                        title: item.title,
                        categoryId: item.categoryId,
                        isCompleted: item.isCompleted,
                        dueDate: item.dueDate,
                        startTime: item.startTime
                    }).catch(() => null);

                    if (response && response.data.code === 200) {
                        // 同步成功！
                        console.log(`离线任务 "${item.title}" 同步成功！`);
                        showDialog("本地离线数据已成功同步至云端！");
                        item.isSynced = true; // 标记为已同步
                    }
                } catch (err) {
                    console.error(`离线任务 "${item.title}" 同步失败:`, err);
                    // 如果某一条同步失败，可以跳过，等下一次再试
                }
            }
        };

        // 1. 导出 localStorage 数据为 JSON 文件
        const exportLocalStorage = () => {
            try {
                const backupData = {};
                // 遍历当前浏览器的 localStorage，把所有键值对存入对象
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    backupData[key] = localStorage.getItem(key);
                }

                const dataStr = JSON.stringify(backupData, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                // 生成带当前日期的备份文件名
                const dateStr = new Date().toISOString().slice(0, 10);
                a.download = `checklist-backup-${dateStr}.json`;
                a.click();

                URL.revokeObjectURL(url);
                showDialog("数据导出成功！请妥善保存下载的 JSON 文件。");
            } catch (err) {
                console.error("导出数据失败", err);
                showDialog("数据导出失败。");
            }
        };

        // 2. 触发隐藏的 file input 点击
        const fileInput = ref(null);
        const triggerImport = () => {
            if (fileInput.value) {
                fileInput.value.click();
            }
        };

        // 3. 读取导入的 JSON 文件并覆盖/写入 localStorage
        const importLocalStorage = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            // 1. 获取当前登录的 userId 作为目标归属 ID
            const currentUserId = localStorage.getItem('userId');
            if (!currentUserId) {
                showDialog("错误: 当前未检测到登录用户 (currentUserId 为空)，无法归属导入数据！");
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const rawData = JSON.parse(e.target.result);

                    // 递归替换对象/数组中所有名为 userId 的字段值
                    const replaceUserId = (obj) => {
                        if (!obj || typeof obj !== 'object') return;
                        for (let key in obj) {
                            if (key === 'userId') {
                                obj[key] = currentUserId; // 强制设为当前登录 ID
                            } else if (typeof obj[key] === 'object') {
                                replaceUserId(obj[key]);
                            }
                        }
                    };

                    // 遍历导入的整个字典
                    for (const key in rawData) {
                        if (Object.prototype.hasOwnProperty.call(rawData, key)) {
                            let value = rawData[key];

                            // 策略 A: 如果 Key 本身带有旧的用户后缀（例如 checklist_12），我们将其重定向到当前用户（checklist_44）
                            // 假设你的 key 格式是 名字_ID，例如 tasks_12
                            let newKey = key.replace(/_(\d+)$/, `_${currentUserId}`);

                            // 策略 B: 尝试解析 Value 的 JSON 内容，把内部的 userId 替换掉
                            if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
                                try {
                                    const parsedValue = JSON.parse(value);
                                    replaceUserId(parsedValue);
                                    value = JSON.stringify(parsedValue); // 重新转回字符串
                                } catch (err) {
                                    // 如果不是合法的 JSON 字符串，保持原样
                                }
                            } else if (typeof value === 'object' && value !== null) {
                                replaceUserId(value);
                            }

                            // 写入修改后的 Key 和 Value
                            localStorage.setItem(newKey, value);
                        }
                    }

                    showDialog(`数据导入成功！所有数据已自动关联至当前账号 (ID: ${currentUserId})。页面即将刷新...`);
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);

                } catch (error) {
                    console.error("导入解析失败:", error);
                    showDialog("导入失败：文件格式不正确或不是有效的 JSON 备份文件。");
                } finally {
                    event.target.value = ''; // 清空选择器，允许重复导入同名文件
                }
            };
            reader.readAsText(file);
        };

        // 1. 当前激活的 User ID（默认取当前的 userId 或默认值）
        const currentUserId = ref(localStorage.getItem('userId') || '1');

        // 2. 自动扫描本地所有出现过的 userId 列表
        const allDiscoveredUserIds = ref([]);
        const scanLocalUserIds = () => {
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

                // 尝试解析 Value 是否为 JSON（无论是对象还是数组），如果是，则递归查找里面所有的 userId 字段
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

                // 匹配键名或包含的合理数字
                const matchAllNums = key.match(/\d+/g);
                if (matchAllNums) {
                    matchAllNums.forEach(num => {
                        if (num.length <= 6) {
                            idSet.add(num);
                        }
                    });
                }
            }

            // 转换为数字排序，确保下拉框井井有条
            allDiscoveredUserIds.value = Array.from(idSet).sort((a, b) => Number(a) - Number(b));
        };

        // 3. 切换离线账号的处理函数
        const handleUserSwitch = () => {
            const targetId = currentUserId.value;
            console.log("切换到离线账号:", targetId);

            // 修改本地的 userId 缓存
            localStorage.setItem('userId', targetId);

            // 2. 切换用户前先清空当前列表，避免触发 watch 错误写入旧缓存
            todoList.value = [];

            // 如果你有针对不同用户独立缓存的数据结构（例如前文提到的多账号隔离字典），可以在这里切换对应的数据
            // 如果你纯粹依靠导入导出的全量数据，切换 userId 后，可在此处触发一次界面数据的重新加载或过滤
            if (typeof loadTodos === 'function') {
                loadTodos(); // 重新加载当前用户的待办数据
            }

            // 给出友好的提示并刷新或重新渲染
            showDialog(`已切换至账号 ${targetId}`);
        };

        // 初始化时执行一次扫描
        scanLocalUserIds();

        // 生命周期钩子：挂载完成时加载数据
        onMounted(() => {
            // 🛡️ 登录校验：如果没找到登录信息，直接重定向
            if (!localStorage.getItem('userId')) {
                showDialog("请先登录！");
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 100);
                return;
            }

            // 只负责拉起初始化流程，具体“怎么同步”、“怎么加载”交给 loadTodos 内部去收敛
            loadCategories();
            loadTodos();
            focusInput();
        });

        // 将模版需要使用的变量和函数暴露出去
        return {
            activeCategory,
            addTodo,
            categories,
            confirmDateUpdate,
            dateDialog,
            dbCategories,
            deleteTodo,
            dialogMessage,
            dontAskAgainChecked,
            filteredTodoList,
            focusInput,
            handleDateClear,
            handleDialogCancel,
            handleDialogConfirm,
            handleStatusToggle,
            isConfirmMode,
            loadTodos,
            loading,
            logout,
            msgDialog,
            newTodoTitle,
            openUpdateDialog,
            saveUpdate,
            searchKeyword,
            showConfirm,
            showDialog,
            showDontAskAgain,
            tempCatId,
            tempDesc,
            tempDate,
            tempTitle,
            timeOptions,
            todoList,
            toggleAllStatus,
            updateDialog,
            updateTime,
            updateToday,
            updateTodoTitle,
            exportLocalStorage,
            triggerImport,
            importLocalStorage,
            fileInput,
            currentUserId,
            allDiscoveredUserIds,
            handleUserSwitch
        };
    }
}).mount('#app'); // 挂载容器
