import { fetchApi, formatDate } from './config.js';
import { renderHeader, loadUnreadCount, updateNavUnreadBadges, requireLogin } from './header.js';

renderHeader();

const app = document.getElementById('app');
let currentPage = 1;
let currentType = 'all';
let notifications = [];
let pagination = null;
let unreadCount = 0;

if (!requireLogin()) {
    app.innerHTML = '<div class="alert alert-warning">请先登录后查看提醒</div>';
} else {
    initNotificationsPage();
}

async function initNotificationsPage() {
    await loadNotifications();
}

async function loadNotifications(page = 1, type = 'all') {
    currentPage = page;
    currentType = type;
    
    try {
        const data = await fetchApi(`/notifications.php?page=${page}&type=${type}`);
        notifications = data.data.list;
        pagination = data.data.pagination;
        unreadCount = data.data.unread_count;
        
        renderNotificationsPage();
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

function renderNotificationsPage() {
    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item"><a href="/">首页</a></li>
                        <li class="breadcrumb-item active" aria-current="page">我的提醒</li>
                    </ol>
                </nav>

                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h4 class="mb-0">
                            <i class="bi bi-bell me-2"></i>我的提醒
                            ${unreadCount > 0 ? `<span class="badge bg-danger ms-2">${unreadCount} 条未读</span>` : ''}
                        </h4>
                        <div>
                            <div class="btn-group btn-group-sm me-2">
                                <button class="btn btn-outline-primary ${currentType === 'all' ? 'active' : ''}" data-type="all">全部</button>
                                <button class="btn btn-outline-primary ${currentType === 'unread' ? 'active' : ''}" data-type="unread">未读</button>
                                <button class="btn btn-outline-primary ${currentType === 'mention' ? 'active' : ''}" data-type="mention">@提及</button>
                            </div>
                            ${unreadCount > 0 ? `
                                <button class="btn btn-outline-success btn-sm" id="markAllReadBtn">
                                    <i class="bi bi-check-all me-1"></i>全部已读
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="card-body">
    `;

    if (notifications.length === 0) {
        html += `
            <div class="text-center py-5">
                <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
                <p class="text-muted mt-3">暂无提醒</p>
            </div>
        `;
    } else {
        html += `<div class="list-group list-group-flush">`;
        
        notifications.forEach(notification => {
            const iconClass = notification.type === 'mention' ? 'bi-at text-primary' : 'bi-chat-square text-info';
            const unreadClass = !notification.is_read ? 'bg-light' : '';
            
            html += `
                <div class="list-group-item list-group-item-action border-0 rounded mb-2 ${unreadClass} notification-item" 
                     data-id="${notification.id}"
                     data-post-id="${notification.post_id}"
                     data-source-type="${notification.source_type}"
                     data-source-id="${notification.source_id}"
                     style="cursor: pointer;">
                    <div class="d-flex gap-3">
                        <div class="flex-shrink-0">
                            <div class="rounded-circle bg-light d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
                                <i class="bi ${iconClass} fs-4"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start">
                                <h6 class="mb-1">
                                    ${escapeHtml(notification.title)}
                                    ${!notification.is_read ? '<span class="badge bg-danger ms-2">新</span>' : ''}
                                </h6>
                                <small class="text-muted">${formatDate(notification.created_at)}</small>
                            </div>
                            <p class="mb-1 text-muted">
                                ${notification.content ? escapeHtml(notification.content) : ''}
                            </p>
                            <div class="d-flex align-items-center gap-2">
                                <small class="text-muted">
                                    <i class="bi bi-person me-1"></i>${escapeHtml(notification.actor_nickname)}
                                </small>
                                <span class="text-muted">·</span>
                                <small class="text-primary">
                                    <i class="bi bi-arrow-right me-1"></i>点击查看详情
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        
        if (pagination.total_pages > 1) {
            html += renderPagination();
        }
    }

    html += `
                    </div>
                </div>
            </div>
        </div>
    `;

    app.innerHTML = html;

    document.querySelectorAll('.btn-group button[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            loadNotifications(1, btn.dataset.type);
        });
    });

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllAsRead);
    }

    document.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => handleNotificationClick(item));
    });
}

function renderPagination() {
    let html = '<nav class="mt-4"><ul class="pagination justify-content-center">';
    
    if (currentPage > 1) {
        html += `
            <li class="page-item">
                <button class="page-link" data-page="${currentPage - 1}">上一页</button>
            </li>
        `;
    } else {
        html += `<li class="page-item disabled"><span class="page-link">上一页</span></li>`;
    }
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(pagination.total_pages, currentPage + 2);
    
    if (startPage > 1) {
        html += `<li class="page-item"><button class="page-link" data-page="1">1</button></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <button class="page-link" data-page="${i}">${i}</button>
            </li>
        `;
    }
    
    if (endPage < pagination.total_pages) {
        if (endPage < pagination.total_pages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><button class="page-link" data-page="${pagination.total_pages}">${pagination.total_pages}</button></li>`;
    }
    
    if (currentPage < pagination.total_pages) {
        html += `
            <li class="page-item">
                <button class="page-link" data-page="${currentPage + 1}">下一页</button>
            </li>
        `;
    } else {
        html += `<li class="page-item disabled"><span class="page-link">下一页</span></li>`;
    }
    
    html += '</ul></nav>';
    
    setTimeout(() => {
        document.querySelectorAll('.pagination button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                loadNotifications(parseInt(btn.dataset.page), currentType);
            });
        });
    }, 0);
    
    return html;
}

async function handleNotificationClick(item) {
    const notificationId = parseInt(item.dataset.id);
    const postId = parseInt(item.dataset.postId);
    
    try {
        const data = await fetchApi('/notifications.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'mark_read',
                id: notificationId
            })
        });
        
        updateNavUnreadBadges(0, data.data.unread_count, data.data.unread_count);
        
        window.location.href = `/post.html?id=${postId}`;
    } catch (error) {
        console.error('标记已读失败:', error);
        window.location.href = `/post.html?id=${postId}`;
    }
}

async function markAllAsRead() {
    if (!confirm('确定要将所有提醒标记为已读吗？')) return;
    
    try {
        const data = await fetchApi('/notifications.php', {
            method: 'PUT',
            body: JSON.stringify({
                action: 'mark_all_read'
            })
        });
        
        updateNavUnreadBadges(0, 0, 0);
        loadNotifications(currentPage, currentType);
    } catch (error) {
        console.error('标记已读失败:', error);
        alert('标记失败，请重试');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
