// js/app.js

const { createApp, ref, onMounted, computed, watch } = Vue;

// 使用全局挂载的 api 实例（来自 api.js）
const request = window.api;

// 使用反引号 (backticks) 来拼接 后端基础 API 路径
// const BASE_URL = 'https://checklist-backend-bqsf.onrender.com/api';
const BASE_URL_item = `${BASE_URL}/item`;
const BASE_URL_category = `${BASE_URL}/category`;

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
            msgDialog.value.showModal();
        };

        // 确认交互框 (替代原 confirm，返回 Promise<boolean>)
        const showConfirm = (msg, options = {}) => {
            isConfirmMode.value = true;
            showDontAskAgain.value = !!options.showDontAskAgain;
            currentConfirmKey = options.key || null;
            dontAskAgainChecked.value = false;

            dialogMessage.value = msg;
            msgDialog.value.showModal();
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
        // 1. 响应式存储后端分类
        const dbCategories = ref([
            { id: 1, name: '默认分类' }
        ]);

        // 2. 构造一个包含“全部”的完整分类列表
        const categories = computed(() => {
            // id: 0 代表“全部”
            // console.log("计算属性 categories 被访问，当前 dbCategories: " + JSON.stringify(dbCategories.value));
            return [{ id: 0, name: '全部' }, ...dbCategories.value];
        });

        // 3. 选中项存储的是整个对象，不仅仅是 id
        const activeCategory = ref({ id: 0, name: '全部' }); // 当前选中的分类

        // 🔍 查询全件 (GET)
        const loadTodos = async () => {
            loading.value = true;

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
                        startTime: timeOptions.includes(cleanTime) ? cleanTime : '08:00', // 👈 增加兜底
                        isUpdating: shouldHighlight
                    };
                });
            };

            try {
                // 1. 先尝试秒开：读取本地缓存并处理高亮后立即渲染
                const localData = localStorage.getItem('todo_list_data');
                if (localData) {
                    try {
                        const parsedLocal = JSON.parse(localData);
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
                    // 3. 后端请求成功：处理数据并更新视图
                    todoList.value = processItems(response.data.data);

                    // 🔥 关键：将后端最新数据同步写入 localStorage，保证下次秒开是最新的
                    localStorage.setItem('todo_list_data', JSON.stringify(response.data.data));

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
                    showDialog('添加失败: ' + (response ? response.data.message : '网络异常'));

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
                        sortOrder: todoList.value.length > 0 ? todoList.value[todoList.value.length - 1].sortOrder + 1 : 1
                    };

                    // 2. 压入本地响应式列表
                    todoList.value.push(offlineItem);

                    // 3. 强行同步写入 localStorage（因为有 watch，其实会自动写，但这里安全起见也可以手动触发或清空输入框）
                    newTodoTitle.value = '';

                    showDialog('已为您在本地离线创建任务，恢复网络后请注意同步。');
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
                    isCompleted: item.isCompleted // 此时值已经是自动转换好的 1 或 0
                }).catch(() => null);

                if (response && response.data.code !== 200) {
                    showDialog('状态更新失败: ' + response.data.message);
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
                // const response = await axios.post(`${BASE_URL_item}/updateBatch`, itemsToUpdate);
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
                    showDialog('批量更新失败: ' + (response ? response.data.message : '网络异常'));
                    filteredTodoList.value.forEach(item => {
                        item.isCompleted = newStatus === 1 ? 0 : 1; // 修正回滚
                    });
                }
            } catch (err) {
                console.error("网络请求异常:", err);
                showDialog("网络波动，请检查连接");
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
                } else {
                    showDialog('修改失败: ' + (response ? response.data.message : '网络异常'));
                }
            } catch (err) {
                console.error(err);
            }
        };

        // 💬 修改任务内容和分类的对话框
        const openUpdateDialog = (item) => {
            editingItem = item;
            tempTitle.value = item.title;
            tempCatId.value = item.categoryId;
            tempDesc.value = item.description || ""; // 💡 2. 赋值时带上原描述，若为空则给空串
            updateDialog.value.showModal();
        };

        // 保存修改
        const saveUpdate = async () => {
            if (!tempTitle.value.trim()) return;
            try {
                await request.post('/item/update', {
                    ...editingItem,
                    title: tempTitle.value,
                    categoryId: tempCatId.value,
                    description: tempDesc.value
                }).catch(() => null);

                editingItem.title = tempTitle.value;
                editingItem.categoryId = tempCatId.value;
                editingItem.description = tempDesc.value;
                updateDialog.value.close();
                await loadTodos();
            } catch (err) {
                showDialog('修改失败: ' + err.message);
            }
        };

        // 💡 修改任务截止日期为今天
        const updateToday = (item) => {
            editingItem = item;
            tempDate.value = item.dueDate === '2111-11-11' ? new Date().toISOString().split('T')[0] : item.dueDate;
            dateDialog.value.showModal();
        };

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
            // console.log("日期选择器触发事件，当前event:", event);
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
                    showDialog('修改失败: ' + (response ? response.data.message : '网络异常'));
                }
            } catch (err) {
                console.error(err);
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
                    showDialog("删除失败: " + (response ? response.data.message : '网络异常'));
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
                    startTime: item.startTime
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

        // 更换排序
        const moveTask = async (item, type) => {
            // alert(`移动任务ID=${item.id}，类型=${type}`);
            const idx = todoList.value.findIndex(t => t.id === item.id);
            let prevOrder = null;
            let nextOrder = null;

            if (type === 'top') {
                // 置顶：prev为null，next为当前列表第一个的sortOrder
                nextOrder = todoList.value[0].sortOrder;
            } else if (type === 'bottom') {
                // 置底：prev为当前列表最后一个的sortOrder，next为null
                prevOrder = todoList.value[todoList.value.length - 1].sortOrder;
            } else if (type === 'up' && idx > 0) {
                // 上移：prev为idx-2的，next为idx-1的
                prevOrder = idx > 1 ? todoList.value[idx - 2].sortOrder : null;
                nextOrder = todoList.value[idx - 1].sortOrder;
            } else if (type === 'down' && idx < todoList.value.length - 1) {
                // 下移：prev为idx+1的，next为idx+2的
                prevOrder = todoList.value[idx + 1].sortOrder;
                nextOrder = idx < todoList.value.length - 2 ? todoList.value[idx + 2].sortOrder : null;
            } else {
                // 边界情况提示
                if (type === 'up' || type === 'top') {
                    showDialog("已经是顶部啦，不能再往上移动了！");
                } else if (type === 'down' || type === 'bottom') {
                    showDialog("已经是底部啦，不能再往下移动了！");
                }
                return; // 已在边界或非法操作
            }

            try {
                await request.post('/item/move', {
                    targetId: item.id,
                    prevOrder: prevOrder,
                    nextOrder: nextOrder
                });
                await loadTodos(); // 重新加载数据刷新列表
            } catch (e) {
                showDialog("移动失败: " + e.message);
            }
        };

        // 监听 todoList 的变化，自动实现数据持久化（LocalStorage）
        watch(todoList, (newValue) => {
            localStorage.setItem('todo_list_data', JSON.stringify(newValue));
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
            let list = todoList.value;
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

        // // 1. 在 setup 最外部或者 mount 之前定义 request
        // const request = axios.create({
        //     baseURL: 'https://checklist-backend-bqsf.onrender.com/api'
        // });

        // // 2. 拦截器只注册一次，全局生效
        // request.interceptors.request.use(config => {
        //     const userId = localStorage.getItem('userId');
        //     if (userId) {
        //         config.headers['userId'] = userId;
        //     }
        //     return config;
        // }, error => Promise.reject(error));

        // 3. 在 setup 内部使用 request
        const loadCategories = async () => {
            try {
                // 直接使用定义好的 request 实例
                const res = await request.get('/category/list');
                dbCategories.value = res.data;

                if (activeCategory.value.id !== 0) {
                    const restored = dbCategories.value.find(c => c.id === activeCategory.value.id);
                    if (restored) activeCategory.value = restored;
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
            moveTask,
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
            updateDate,
            updateDialog,
            updateTime,
            updateToday,
            updateTodoTitle
        };
    }
}).mount('#app'); // 挂载容器
