// ====== 配置 ======
const CONFIG = {
    ITEMS_PER_PAGE: 20,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    CAPTCHA_EXPIRE: 5 * 60 * 1000, // 5分钟
    REGISTER_LIMIT: 3, // 5分钟内最多注册3次
    REGISTER_TIME_WINDOW: 5 * 60 * 1000, // 5分钟
};

// GitHub 配置
const GITHUB_CONFIG = {
    owner: 'MrDragonForest',
    repo: 'MarriedCameraShare',
    branch: 'main',
    token: '' // 将在登录时设置
};

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
    // 检查是否已有 GitHub token
    const savedToken = localStorage.getItem('mcs_github_token');
    if (savedToken) {
        GITHUB_CONFIG.token = savedToken;
    }
    
    await loadData();
    checkLoginStatus();
    initEventListeners();
    generateCaptcha();
});

// ====== GitHub API =====
async function githubUploadImage(file) {
    const today = new Date().toISOString().split('T')[0];
    const ext = file.name.split('.').pop() || 'jpg';
    const randomName = Math.random().toString(36).substring(2, 10);
    const filename = `${today}/${randomName}.${ext}`;
    
    // 读取文件为 base64
    const reader = new FileReader();
    const base64 = await new Promise((resolve) => {
        reader.onload = () => {
            // 移除 data:image/xxx;base64, 前缀
            const result = reader.result.split(',')[1];
            resolve(result);
        };
        reader.readAsDataURL(file);
    });
    
    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${DATA_PATH.images}${filename}`;
    
    const data = {
        message: `upload: ${filename}`,
        content: base,
        branch: GITHUB_CONFIG.branch
    };
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_CONFIG.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
    }
    
    const result = await response.json();
    return {
        filename: filename,
        sha: result.content.sha,
        path: result.content.path
    };
}

async function githubUpdatePosts(posts) {
    // 先获取当前的 posts.json
    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${DATA_PATH.posts}`;
    
    // 获取现有文件的 sha
    const getResp = await fetch(url, {
        headers: {
            'Authorization': `token ${GITHUB_CONFIG.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    const existing = await getResp.json();
    const sha = existing.sha;
    
    // 更新文件
    const content = btoa(JSON.stringify({ posts }, null, 2));
    
    const updateResp = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_CONFIG.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'update: posts.json',
            content: content,
            sha: sha,
            branch: GITHUB_CONFIG.branch
        })
    });
    
    if (!updateResp.ok) {
        const error = await updateResp.json();
        throw new Error(error.message || 'Update failed');
    }
    
    return await updateResp.json();
}

// ====== 数据加载 ======
async function loadData() {
    if (!GITHUB_CONFIG.token) {
        // 没有 token，只用 localStorage
        const savedUsers = localStorage.getItem('mcs_users');
        const savedPosts = localStorage.getItem('mcs_posts');
        
        if (savedUsers) {
            state.users = JSON.parse(savedUsers);
        } else {
            state.users = {
                users: [
                    { username: 'admin', password: hashCode('123456'), nickname: '管理员', createdAt: new Date().toISOString() }
                ],
                registerLogs: []
            };
        }
        
        if (savedPosts) {
            state.posts = JSON.parse(savedPosts);
        } else {
            state.posts = { posts: [] };
        }
        return;
    }
    
    try {
        // 从 GitHub 加载数据
        const postsResp = await fetch(`https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${DATA_PATH.posts}`);
        if (postsResp.ok) {
            state.posts = await postsResp.json();
        } else {
            state.posts = { posts: [] };
        }
        
        // 用户数据还是用 localStorage（注册需要频繁更新）
        const savedUsers = localStorage.getItem('mcs_users');
        if (savedUsers) {
            state.users = JSON.parse(savedUsers);
        } else {
            state.users = {
                users: [
                    { username: 'admin', password: hashCode('123456'), nickname: '管理员', createdAt: new Date().toISOString() }
                ],
                registerLogs: []
            };
        }
    } catch (e) {
        console.error('加载数据失败:', e);
        state.posts = { posts: [] };
    }
}

function saveUsers() {
    localStorage.setItem('mcs_users', JSON.stringify(state.users));
}

function savePosts() {
    if (GITHUB_CONFIG.token) {
        // 保存到 GitHub
        githubUpdatePosts(state.posts.posts).then(() => {
            console.log('Posts saved to GitHub');
        }).catch(e => {
            console.error('Save to GitHub failed:', e);
            // 降级到 localStorage
            localStorage.setItem('mcs_posts', JSON.stringify(state.posts));
        });
    } else {
        localStorage.setItem('mcs_posts', JSON.stringify(state.posts));
    }
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
    
    loadPhotoList();
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
    document.getElementById('loginBtn').addEventListener('click', () => showModal('authModal'));
    
    document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.close;
            if (modalId) hideModal(modalId);
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal(modal.id);
        });
    });
    
    document.getElementById('authSwitch').addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });
    
    document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
    
    document.getElementById('captchaImg').addEventListener('click', generateCaptcha);
    
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    document.getElementById('uploadBtn').addEventListener('click', () => showModal('uploadModal'));
    
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    
    document.getElementById('uploadArea').addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    document.getElementById('uploadArea').addEventListener('drop', (e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    });
    
    document.getElementById('addTagBtn').addEventListener('click', addTag);
    document.getElementById('tagInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    });
    
    document.getElementById('confirmUploadBtn').addEventListener('click', handleUpload);
    
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
    
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 38;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 100, 38);
    
    ctx.fillStyle = '#333';
    ctx.font = '24px Arial';
    ctx.fillText(captcha, 20, 28);
    
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
    
    // 如果填写了 GitHub token，保存
    const githubToken = document.getElementById('githubToken')?.value.trim();
    if (githubToken) {
        GITHUB_CONFIG.token = githubToken;
        localStorage.setItem('mcs_github_token', githubToken);
    }
    
    if (!username || !password) {
        alert('请填写用户名和密码');
        return;
    }
    
    if (isRegisterMode) {
        if (!validateCaptcha(captcha)) {
            alert('验证码错误');
            generateCaptcha();
            return;
        }
        
        const now = Date.now();
        const recentLogs = state.users.registerLogs.filter(log => 
            now - new Date(log.time).getTime() < CONFIG.REGISTER_TIME_WINDOW
        );
        
        if (recentLogs.length >= CONFIG.REGISTER_LIMIT) {
            alert('注册过于频繁，请稍后再试');
            return;
        }
        
        if (state.users.users.some(u => u.username === username)) {
            alert('用户名已存在');
            return;
        }
        
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
        
        state.currentUser = newUser;
        localStorage.setItem('mcs_currentUser', JSON.stringify(newUser));
        
        alert('注册成功！');
        hideModal('authModal');
        updateUIForLoggedIn();
        
    } else {
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
        
        // 重新加载数据（如果有 GitHub token）
        if (GITHUB_CONFIG.token) {
            await loadData();
            loadPhotoList();
        }
    }
    
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
        if (state.filters.tag && !post.tags?.some(t => t.includes(state.filters.tag))) return false;
        return true;
    });
}

// ====== 图片列表 ======
function loadPhotoList() {
    const filtered = getFilteredPosts();
    state.filteredPosts = filtered;
    
    const grouped = {};
    filtered.forEach(post => {
        if (!grouped[post.date]) {
            grouped[post.date] = [];
        }
        grouped[post.date].push(post);
    });
    
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    const container = document.getElementById('photoList');
    
    if (sortedDates.length === 0) {
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
    for (const [date, posts] of Object.entries(grouped)) {
        const dateObj = new Date(date);
        const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
        
        html += `
            <div class="date-group">
                <div class="date-group-header">📅 ${formattedDate}</div>
                <div class="photo-grid">
        `;
        
        posts.forEach(post => {
            const tagsHtml = post.tags?.map(t => `<span class="photo-tag">${t}</span>`).join('') || '';
            const imgUrl = GITHUB_CONFIG.token 
                ? `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${DATA_PATH.images}${post.filename}`
                : post.data;
            
            html += `
                <div class="photo-card" onclick="showImagePreview('${post.filename}', '${post.nickname}', '${post.date}', '${post.tags?.join(', ') || ''}')">
                    <img src="${imgUrl}" alt="照片" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22160%22><rect fill=%22%23eee%22 width=%22100%22 height=%22160%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>图片加载失败</text></svg>'">
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
    html += `<button class="pagination-btn" onclick="goToPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += `<span class="pagination-btn">...</span>`;
        }
    }
    
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
    
    if (!GITHUB_CONFIG.token) {
        alert('请先在登录页面填写 GitHub Token 才能上传图片到仓库');
        return;
    }
    
    const btn = document.getElementById('confirmUploadBtn');
    btn.disabled = true;
    btn.textContent = '上传中...';
    
    try {
        for (const file of state.selectedFiles) {
            // 上传到 GitHub
            const result = await githubUploadImage(file);
            
            const today = new Date().toISOString().split('T')[0];
            
            const post = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                username: state.currentUser.username,
                nickname: state.currentUser.nickname || state.currentUser.username,
                date: today,
                filename: result.filename,
                tags: [...state.selectedTags],
                uploadTime: new Date().toISOString()
            };
            
            state.posts.posts.unshift(post);
        }
        
        await savePosts();
        
        alert('上传成功！');
        
        hideModal('uploadModal');
        state.selectedFiles = [];
        state.selectedTags = [];
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('tagInput').value = '';
        document.getElementById('selectedTags').innerHTML = '';
        
        loadPhotoList();
        loadUserFilterOptions();
        
    } catch (e) {
        console.error('上传失败:', e);
        alert('上传失败: ' + e.message);
    }
    
    btn.disabled = false;
    btn.textContent = '确认上传';
}

// ====== 图片预览 ======
function showImagePreview(filename, nickname, date, tags) {
    const imgUrl = GITHUB_CONFIG.token 
        ? `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${DATA_PATH.images}${filename}`
        : '';
    
    document.getElementById('previewImage').src = imgUrl;
    document.getElementById('previewImage').onerror = function() {
        this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23eee%22 width=%22200%22 height=%22200%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>图片加载失败</text></svg>';
    };
    
    document.getElementById('previewInfo').innerHTML = `
        <p>👤 ${nickname} | 📅 ${date} | 🏷️ ${tags || '无标签'}</p>
    `;
    
    showModal('previewModal');
}

// ====== 工具函数 ======
window.goToPage = goToPage;
window.removeFile = removeFile;
window.removeTag = removeTag;
window.showImagePreview = showImagePreview;
