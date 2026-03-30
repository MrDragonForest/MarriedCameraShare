// ====== 配置 ======
const CONFIG = {
    ITEMS_PER_PAGE: 20,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    CAPTCHA_EXPIRE: 5 * 60 * 1000, // 5分钟
    REGISTER_LIMIT: 3, // 5分钟内最多注册3次
    REGISTER_TIME_WINDOW: 5 * 60 * 1000, // 5分钟
};

// 由于 GitHub Pages 是静态托管，需要用 JSON 文件模拟后端
// 实际部署时需要后端服务或使用 localStorage + GitHub API 存储
const DATA_PATH = {
    users: 'data/users.json',
    posts: 'data/posts.json',
    images: 'images/'
};

// ====== 状态 ======
let state = {
    currentUser: null,
    users: [],
    posts: [],
    captcha: '',
    captchaExpire: 0,
    selectedFiles: [],
    selectedTags: [],
    currentPage: 1,
    filteredPosts: [],
    filters: {
        username: '',
        date: '',
        tag: ''
    }
};

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    checkLoginStatus();
    initEventListeners();
    generateCaptcha();
});

// ====== 数据加载 ======
async function loadData() {
    try {
        // 尝试从 localStorage 加载（开发环境）
        const savedUsers = localStorage.getItem('mcs_users');
        const savedPosts = localStorage.getItem('mcs_posts');
        
        if (savedUsers) {
            state.users = JSON.parse(savedUsers);
        } else {
            // 默认用户数据
            state.users = {
                users: [
                    { username: 'admin', password: hashCode('123456'), nickname: '管理员', createdAt: new Date().toISOString() }
                ],
                registerLogs: []
            };
            saveUsers();
        }
        
        if (savedPosts) {
            state.posts = JSON.parse(savedPosts);
        } else {
            state.posts = { posts: [] };
            savePosts();
        }
    } catch (e) {
        console.error('加载数据失败:', e);
    }
}

function saveUsers() {
    localStorage.setItem('mcs_users', JSON.stringify(state.users));
}

function savePosts() {
    localStorage.setItem('mcs_posts', JSON.stringify(state.posts));
}

// ====== 密码哈希 ======
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

// ====== 登录状态 ======
function checkLoginStatus() {
    const savedUser = localStorage.getItem('mcs_currentUser');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
        updateUIForLoggedIn();
    }
}

function updateUIForLoggedIn() {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('uploadBtn').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('filterBar').style.display = 'flex';
    document.getElementById('welcomeText').textContent = `👤 ${state.currentUser.nickname || state.currentUser.username}`;
    
    // 加载图片列表
    loadPhotoList();
    // 加载用户筛选选项
    loadUserFilterOptions();
}

function updateUIForLoggedOut() {
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('filterBar').style.display = 'none';
    document.getElementById('photoList').innerHTML = '';
    document.getElementById('pagination').innerHTML = '';
}

// ====== 事件监听 ======
function initEventListeners() {
    // 登录/注册弹窗
    document.getElementById('loginBtn').addEventListener('click', () => showModal('authModal'));
    
    // 关闭弹窗
    document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.close;
            if (modalId) hideModal(modalId);
        });
    });
    
    // 点击遮罩关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal(modal.id);
        });
    });
    
    // 登录/注册切换
    document.getElementById('authSwitch').addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });
    
    // 登录/注册表单提交
    document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
    
    // 验证码点击刷新
    document.getElementById('captchaImg').addEventListener('click', generateCaptcha);
    
    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // 上传按钮
    document.getElementById('uploadBtn').addEventListener('click', () => showModal('uploadModal'));
    
    // 上传区域点击
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    
    // 文件选择
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    
    // 拖拽上传
    document.getElementById('uploadArea').addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    document.getElementById('uploadArea').addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFiles(e.dataTransfer.files);
    });
    
    // 添加标签
    document.getElementById('addTagBtn').addEventListener('click', addTag);
    document.getElementById('tagInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    });
    
    // 确认上传
    document.getElementById('confirmUploadBtn').addEventListener('click', handleUpload);
    
    // 筛选
    document.getElementById('filterBtn').addEventListener('click', applyFilters);
    document.getElementById('resetFilterBtn').addEventListener('click', resetFilters);
}

// ====== 模态框 ======
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ====== 验证码 ======
function generateCaptcha() {
    const chars = '0123456789';
    let captcha = '';
    for (let i = 0; i < 4; i++) {
        captcha += chars[Math.floor(Math.random() * chars.length)];
    }
    state.captcha = captcha;
    state.captchaExpire = Date.now() + CONFIG.CAPTCHA_EXPIRE;
    
    // 生成简单的验证码图片（使用 Canvas）
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 38;
    const ctx = canvas.getContext('2d');
    
    // 背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 100, 38);
    
    // 文字
    ctx.fillStyle = '#333';
    ctx.font = '24px Arial';
    ctx.fillText(captcha, 20, 28);
    
    // 干扰线
    ctx.strokeStyle = '#ccc';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 100, Math.random() * 38);
        ctx.lineTo(Math.random() * 100, Math.random() * 38);
        ctx.stroke();
    }
    
    document.getElementById('captchaImg').src = canvas.toDataURL();
}

function validateCaptcha(input) {
    if (Date.now() > state.captchaExpire) {
        generateCaptcha();
        return false;
    }
    return input.toLowerCase() === state.captcha.toLowerCase();
}

// ====== 登录/注册 ======
let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').textContent = isRegisterMode ? '注册' : '登录';
    document.getElementById('authSubmitBtn').textContent = isRegisterMode ? '注册' : '登录';
    document.getElementById('captchaGroup').style.display = isRegisterMode ? 'block' : 'none';
    document.getElementById('authSwitchText').textContent = isRegisterMode ? '已有账号？' : '没有账号？';
    document.getElementById('authSwitch').textContent = isRegisterMode ? '立即登录' : '立即注册';
    generateCaptcha();
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const captcha = document.getElementById('captcha').value.trim();
    
    if (!username || !password) {
        alert('请填写完整信息');
        return;
    }
    
    if (isRegisterMode) {
        // 注册
        if (!validateCaptcha(captcha)) {
            alert('验证码错误');
            generateCaptcha();
            return;
        }
        
        // 检查频繁注册
        const now = Date.now();
        const recentLogs = state.users.registerLogs.filter(log => 
            now - new Date(log.time).getTime() < CONFIG.REGISTER_TIME_WINDOW
        );
        
        if (recentLogs.length >= CONFIG.REGISTER_LIMIT) {
            alert('注册过于频繁，请稍后再试');
            return;
        }
        
        // 检查用户名是否存在
        if (state.users.users.some(u => u.username === username)) {
            alert('用户名已存在');
            return;
        }
        
        // 创建新用户
        const newUser = {
            username,
            password: hashCode(password),
            nickname: username,
            createdAt: new Date().toISOString()
        };
        
        state.users.users.push(newUser);
        state.users.registerLogs.push({
            ip: '127.0.0.1',
            time: new Date().toISOString()
        });
        
        saveUsers();
        
        // 自动登录
        state.currentUser = newUser;
        localStorage.setItem('mcs_currentUser', JSON.stringify(newUser));
        
        alert('注册成功！');
        hideModal('authModal');
        updateUIForLoggedIn();
        
    } else {
        // 登录
        const user = state.users.users.find(u => 
            u.username === username && u.password === hashCode(password)
        );
        
        if (!user) {
            alert('用户名或密码错误');
            return;
        }
        
        state.currentUser = user;
        localStorage.setItem('mcs_currentUser', JSON.stringify(user));
        
        hideModal('authModal');
        updateUIForLoggedIn();
    }
    
    // 重置表单
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('captcha').value = '';
}

function handleLogout() {
    state.currentUser = null;
    localStorage.removeItem('mcs_currentUser');
    updateUIForLoggedOut();
}

// ====== 筛选 ======
function loadUserFilterOptions() {
    const select = document.getElementById('filterUser');
    select.innerHTML = '<option value="">全部用户</option>';
    
    const users = [...new Set(state.posts.posts.map(p => p.username))];
    users.forEach(username => {
        const option = document.createElement('option');
        option.value = username;
        option.textContent = state.posts.posts.find(p => p.username === username)?.nickname || username;
        select.appendChild(option);
    });
}

function applyFilters() {
    state.filters = {
        username: document.getElementById('filterUser').value,
        date: document.getElementById('filterDate').value,
        tag: document.getElementById('filterTag').value.trim()
    };
    state.currentPage = 1;
    loadPhotoList();
}

function resetFilters() {
    state.filters = { username: '', date: '', tag: '' };
    document.getElementById('filterUser').value = '';
    document.getElementById('filterDate').value = '';
    document.getElementById('filterTag').value = '';
    state.currentPage = 1;
    loadPhotoList();
}

function getFilteredPosts() {
    return state.posts.posts.filter(post => {
        if (state.filters.username && post.username !== state.filters.username) return false;
        if (state.filters.date && post.date !== state.filters.date) return false;
        if (state.filters.tag && !post.tags.some(t => t.includes(state.filters.tag))) return false;
        return true;
    });
}

// ====== 图片列表 ======
function loadPhotoList() {
    const filtered = getFilteredPosts();
    state.filteredPosts = filtered;
    
    // 按日期分组
    const grouped = {};
    filtered.forEach(post => {
        if (!grouped[post.date]) {
            grouped[post.date] = [];
        }
        grouped[post.date].push(post);
    });
    
    // 排序日期（从新到旧）
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    // 分页（每页20条，按天计算）
    const itemsPerPage = CONFIG.ITEMS_PER_PAGE;
    let currentItems = 0;
    let currentPage = 1;
    const paginatedGroups = {};
    
    for (const date of sortedDates) {
        if (currentItems + grouped[date].length > currentPage * itemsPerPage) {
            if (currentItems < currentPage * itemsPerPage) {
                // 当天照片跨页
                const remaining = currentPage * itemsPerPage - currentItems;
                paginatedGroups[date] = grouped[date].slice(0, remaining);
                currentItems += grouped[date].length;
            } else {
                currentPage++;
                paginatedGroups[date] = grouped[date].slice(0, itemsPerPage);
                currentItems += grouped[date].length;
            }
        } else {
            paginatedGroups[date] = grouped[date];
            currentItems += grouped[date].length;
        }
    }
    
    // 渲染
    const container = document.getElementById('photoList');
    
    if (Object.keys(paginatedGroups).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📷</div>
                <div class="empty-state-text">暂无照片，快来上传吧！</div>
            </div>
        `;
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    
    let html = '';
    for (const [date, posts] of Object.entries(paginatedGroups)) {
        const dateObj = new Date(date);
        const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
        
        html += `
            <div class="date-group">
                <div class="date-group-header">📅 ${formattedDate}</div>
                <div class="photo-grid">
        `;
        
        posts.forEach(post => {
            const tagsHtml = post.tags?.map(t => `<span class="photo-tag">${t}</span>`).join('') || '';
            html += `
                <div class="photo-card" onclick="showImagePreview('${post.filename}', '${post.nickname}', '${post.date}', '${post.tags?.join(', ') || ''}')">
                    <img src="${DATA_PATH.images}${post.filename}" alt="照片" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22160%22><rect fill=%22%23eee%22 width=%22100%22 height=%22160%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>图片加载失败</text></svg>'">
                    <div class="photo-card-info">
                        <div class="photo-card-user">👤 ${post.nickname || post.username}</div>
                        <div class="photo-card-tags">${tagsHtml}</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // 渲染分页
    renderPagination(filtered.length);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    const container = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button class="pagination-btn" onclick="goToPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += `<span class="pagination-btn">...</span>`;
        }
    }
    
    // 下一页
    html += `<button class="pagination-btn" onclick="goToPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    
    container.innerHTML = html;
}

function goToPage(page) {
    const totalPages = Math.ceil(state.filteredPosts.length / CONFIG.ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    
    state.currentPage = page;
    loadPhotoList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ====== 上传 ======
function handleFileSelect(e) {
    handleFiles(e.target.files);
}

function handleFiles(files) {
    state.selectedFiles = [];
    state.selectedTags = [];
    
    const validFiles = Array.from(files).filter(file => {
        if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
            alert(`不支持的文件类型: ${file.type}`);
            return false;
        }
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            alert(`文件过大: ${file.name} (最大10MB)`);
            return false;
        }
        return true;
    });
    
    if (validFiles.length === 0) return;
    
    state.selectedFiles = validFiles;
    renderPreview();
    showModal('uploadModal');
}

function renderPreview() {
    const previewArea = document.getElementById('previewArea');
    const previewGrid = document.getElementById('previewGrid');
    const selectedCount = document.getElementById('selectedCount');
    
    if (state.selectedFiles.length === 0) {
        previewArea.style.display = 'none';
        return;
    }
    
    previewArea.style.display = 'block';
    selectedCount.textContent = state.selectedFiles.length;
    
    previewGrid.innerHTML = '';
    
    state.selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}" alt="预览">
                <button class="remove-btn" onclick="removeFile(${index})">×</button>
            `;
            previewGrid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removeFile(index) {
    state.selectedFiles.splice(index, 1);
    renderPreview();
}

function addTag() {
    const input = document.getElementById('tagInput');
    const tag = input.value.trim();
    
    if (tag && !state.selectedTags.includes(tag)) {
        state.selectedTags.push(tag);
        renderTags();
    }
    
    input.value = '';
}

function renderTags() {
    const container = document.getElementById('selectedTags');
    container.innerHTML = state.selectedTags.map(tag => `
        <span class="selected-tag">
            ${tag}
            <span class="remove-tag" onclick="removeTag('${tag}')">×</span>
        </span>
    `).join('');
}

function removeTag(tag) {
    state.selectedTags = state.selectedTags.filter(t => t !== tag);
    renderTags();
}

async function handleUpload() {
    if (state.selectedFiles.length === 0) {
        alert('请选择要上传的照片');
        return;
    }
    
    const btn = document.getElementById('confirmUploadBtn');
    btn.disabled = true;
    btn.textContent = '上传中...';
    
    try {
        for (const file of state.selectedFiles) {
            // 生成文件名
            const ext = file.name.split('.').pop();
            const randomName = Math.random().toString(36).substring(2, 10);
            const today = new Date().toISOString().split('T')[0];
            const filename = `${today}/${randomName}.${ext}`;
            
            // 转换为 Base64 存储（实际项目应该用后端存储）
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            
            // 存储到 posts
            const post = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                username: state.currentUser.username,
                nickname: state.currentUser.nickname || state.currentUser.username,
                date: today,
                filename: filename,
                tags: [...state.selectedTags],
                uploadTime: new Date().toISOString(),
                data: base64 // 实际项目应存储到服务器
            };
            
            state.posts.posts.unshift(post);
        }
        
        savePosts();
        
        alert('上传成功！');
        
        // 关闭弹窗并重置
        hideModal('uploadModal');
        state.selectedFiles = [];
        state.selectedTags = [];
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('tagInput').value = '';
        document.getElementById('selectedTags').innerHTML = '';
        
        // 刷新列表
        loadPhotoList();
        loadUserFilterOptions();
        
    } catch (e) {
        console.error('上传失败:', e);
        alert('上传失败，请重试');
    }
    
    btn.disabled = false;
    btn.textContent = '确认上传';
}

// ====== 图片预览 ======
function showImagePreview(filename, nickname, date, tags) {
    // 先尝试从 posts 中找到原始 base64 数据
    const post = state.posts.posts.find(p => p.filename === filename);
    const src = post?.data || `${DATA_PATH.images}${filename}`;
    
    document.getElementById('previewImage').src = src;
    document.getElementById('previewImage').onerror = function() {
        this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23eee%22 width=%22200%22 height=%22200%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>图片加载失败</text></svg>';
    };
    
    document.getElementById('previewInfo').innerHTML = `
        <p>👤 ${nickname} | 📅 ${date} | 🏷️ ${tags || '无标签'}</p>
    `;
    
    showModal('previewModal');
}

// ====== 工具函数 ======
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// 暴露给全局
window.goToPage = goToPage;
window.removeFile = removeFile;
window.removeTag = removeTag;
window.showImagePreview = showImagePreview;
