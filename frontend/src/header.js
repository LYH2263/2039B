import { fetchApi } from './config.js';

let currentUser = null;

export async function renderHeader(activeLink = '') {
    try {
        const data = await fetchApi('/user_login.php');
        if (data.logged_in) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));
        } else {
            currentUser = null;
            localStorage.removeItem('currentUser');
        }
    } catch (e) {
        const stored = localStorage.getItem('currentUser');
        currentUser = stored ? JSON.parse(stored) : null;
    }

    const nav = document.createElement('nav');
    nav.className = 'navbar navbar-expand-lg navbar-light bg-white mb-4 shadow-sm';
    
    let userMenu = '';
    if (currentUser) {
        userMenu = `
            <li class="nav-item">
                <a class="nav-link position-relative" href="/messages.html">
                    <i class="bi bi-chat-dots me-1"></i>私信
                    <span class="position-absolute top-50 start-100 translate-middle badge rounded-pill bg-danger d-none" id="navUnreadBadge" style="font-size: 0.65rem; transform: translate(-20%, -50%) !important;">
                        0
                    </span>
                </a>
            </li>
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-bs-toggle="dropdown">
                    <i class="bi bi-person-circle me-1"></i>${escapeHtml(currentUser.nickname)}
                </a>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><span class="dropdown-item-text text-muted">@${escapeHtml(currentUser.username)}</span></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="/messages.html"><i class="bi bi-chat-dots me-2"></i>我的私信</a></li>
                    <li><a class="dropdown-item" href="/stories.html"><i class="bi bi-book me-2"></i>接龙故事</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button class="dropdown-item text-danger" id="logoutBtn"><i class="bi bi-box-arrow-right me-2"></i>退出登录</button></li>
                </ul>
            </li>
        `;
    } else {
        userMenu = `
            <li class="nav-item"><a class="nav-link" href="/login.html">登录</a></li>
            <li class="nav-item"><a class="nav-link" href="/register.html">注册</a></li>
        `;
    }

    nav.innerHTML = `
        <div class="container">
            <a class="navbar-brand" href="/">极简论坛</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav me-auto">
                    <li class="nav-item"><a class="nav-link ${activeLink === 'home' ? 'active' : ''}" href="/">首页</a></li>
                    <li class="nav-item"><a class="nav-link ${activeLink === 'stories' ? 'active' : ''}" href="/stories.html">接龙故事</a></li>
                    <li class="nav-item"><a class="nav-link ${activeLink === 'create' ? 'active' : ''}" href="/create_post.html">发布新帖</a></li>
                </ul>
                <ul class="navbar-nav">
                    <li class="nav-item"><a class="nav-link" href="/admin/index.html">后台</a></li>
                    ${userMenu}
                </ul>
            </div>
        </div>
    `;
    document.body.prepend(nav);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetchApi('/user_logout.php', { method: 'POST' });
                localStorage.removeItem('currentUser');
                window.location.reload();
            } catch (e) {
                alert('退出失败，请重试');
            }
        });
    }

    if (currentUser) {
        loadUnreadCount();
    }
}

export async function loadUnreadCount() {
    try {
        const data = await fetchApi('/unread_count.php');
        const count = data.data?.unread_count || 0;
        updateNavUnreadBadge(count);
    } catch (e) {
        console.warn('获取未读消息数失败', e);
    }
}

export function updateNavUnreadBadge(count) {
    const badge = document.getElementById('navUnreadBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
}

export function getCurrentUser() {
    if (!currentUser) {
        const stored = localStorage.getItem('currentUser');
        currentUser = stored ? JSON.parse(stored) : null;
    }
    return currentUser;
}

export function requireLogin() {
    const user = getCurrentUser();
    if (!user) {
        if (confirm('请先登录后再操作')) {
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
        return false;
    }
    return true;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
