import { fetchApi, formatDate } from './config.js';
import { renderAdminHeader } from './admin_header.js';
import './styles.css';

renderAdminHeader('posts');

const app = document.getElementById('app');

const STATUS_MAP = {
    published: { label: '已发布', class: 'bg-success', icon: 'bi-check-circle' },
    scheduled: { label: '待发布', class: 'bg-warning text-dark', icon: 'bi-clock-history' }
};

function renderStatusBadge(post) {
    const info = STATUS_MAP[post.status] || { label: '未知', class: 'bg-secondary', icon: 'bi-question-circle' };
    let extra = '';
    if (post.status === 'scheduled' && post.scheduled_at) {
        extra = `<div class="small text-muted mt-1"><i class="bi bi-calendar-event"></i> ${formatDate(post.scheduled_at)}</div>`;
    }
    return `
        <span class="badge ${info.class}">
            <i class="bi ${info.icon}"></i> ${info.label}
        </span>
        ${extra}
    `;
}

function renderTimeInfo(post) {
    let lines = [];
    lines.push(`<div class="small"><i class="bi bi-pencil-square"></i> 创建: ${formatDate(post.created_at)}</div>`);
    if (post.status === 'published') {
        lines.push(`<div class="small text-success"><i class="bi bi-send"></i> 发布: ${formatDate(post.published_at || post.created_at)}</div>`);
    } else if (post.status === 'scheduled' && post.scheduled_at) {
        const now = new Date();
        const scheduled = new Date(post.scheduled_at);
        const diffMs = scheduled - now;
        const diffMins = Math.round(diffMs / 60000);
        let countdown = '';
        if (diffMins > 0) {
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            if (hours > 0) {
                countdown = `（约 ${hours}小时${mins > 0 ? mins + '分钟' : ''} 后发布）`;
            } else {
                countdown = `（约 ${mins} 分钟后发布）`;
            }
        }
        lines.push(`<div class="small text-warning"><i class="bi bi-alarm"></i> 计划: ${formatDate(post.scheduled_at)} ${countdown}</div>`);
    }
    return lines.join('');
}

async function loadPosts() {
    try {
        const data = await fetchApi('/admin/posts.php');
        renderPosts(data.posts);
    } catch (error) {
        app.innerHTML = `<div class="container mt-4"><div class="alert alert-danger shadow-sm">${error.message}</div></div>`;
    }
}

function renderPosts(posts) {
    const stats = {
        total: posts.length,
        published: posts.filter(p => p.status === 'published').length,
        scheduled: posts.filter(p => p.status === 'scheduled').length
    };

    let html = `
    <div class="container fade-in py-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h3 class="fw-bold text-dark mb-0">帖子管理</h3>
                <p class="text-muted small mb-0">管理所有发布的帖子</p>
            </div>
            <a href="/admin/index.html" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left"></i> 返回仪表盘
            </a>
        </div>

        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card border-0 shadow-sm bg-info-subtle">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small">帖子总数</div>
                                <div class="fw-bold fs-3">${stats.total}</div>
                            </div>
                            <i class="bi bi-files fs-1 text-info opacity-50"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm bg-success-subtle">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small">已发布</div>
                                <div class="fw-bold fs-3 text-success">${stats.published}</div>
                            </div>
                            <i class="bi bi-check-circle-fill fs-1 text-success opacity-50"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm bg-warning-subtle">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small">待发布</div>
                                <div class="fw-bold fs-3 text-warning">${stats.scheduled}</div>
                            </div>
                            <i class="bi bi-clock-history fs-1 text-warning opacity-50"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-4">ID</th>
                                <th>标题</th>
                                <th>作者</th>
                                <th>状态</th>
                                <th>时间信息</th>
                                <th>评论数</th>
                                <th class="text-end pe-4">操作</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    if (posts.length === 0) {
        html += `<tr><td colspan="7" class="text-center py-4 text-muted">暂无帖子</td></tr>`;
    } else {
        posts.forEach(post => {
            const isScheduled = post.status === 'scheduled';
            const hasScheduleTime = isScheduled && post.scheduled_at;

            let actionButtons = `
                <a href="/admin/edit_post.html?id=${post.id}" class="btn btn-sm btn-outline-primary me-1 mb-1">
                    <i class="bi bi-pencil"></i> 编辑
                </a>
                <a href="/post.html?id=${post.id}" target="_blank" class="btn btn-sm btn-outline-secondary me-1 mb-1 ${post.status !== 'published' ? 'disabled' : ''}" ${post.status !== 'published' ? 'aria-disabled="true"' : ''}>
                    <i class="bi bi-eye"></i> 查看
                </a>
            `;

            if (isScheduled) {
                actionButtons += `
                    <button class="btn btn-sm btn-success me-1 mb-1 publish-now-btn" data-id="${post.id}" title="立即发布">
                        <i class="bi bi-lightning-charge-fill"></i> 立即发布
                    </button>
                `;
                if (hasScheduleTime) {
                    actionButtons += `
                        <button class="btn btn-sm btn-outline-warning me-1 mb-1 cancel-btn" data-id="${post.id}" title="取消计划">
                            <i class="bi bi-x-circle"></i> 取消计划
                        </button>
                    `;
                }
            }

            actionButtons += `
                <button class="btn btn-sm btn-outline-danger mb-1 delete-btn" data-id="${post.id}">
                    <i class="bi bi-trash"></i> 删除
                </button>
            `;

            html += `
                <tr class="${isScheduled ? 'table-warning table-opacity-25' : ''}">
                    <td class="ps-4 fw-bold text-muted">#${post.id}</td>
                    <td>
                        <div class="fw-medium text-dark mb-1">${escapeHtml(post.title)}</div>
                        <div class="small text-muted text-truncate" style="max-width: 240px;">${escapeHtml(post.content.substring(0, 80))}${post.content.length > 80 ? '...' : ''}</div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="avatar-circle me-2 bg-light text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; font-weight: bold; font-size: 14px;">
                                ${escapeHtml(post.author_name).charAt(0).toUpperCase()}
                            </div>
                            <span>${escapeHtml(post.author_name)}</span>
                        </div>
                    </td>
                    <td>${renderStatusBadge(post)}</td>
                    <td>${renderTimeInfo(post)}</td>
                    <td><span class="badge bg-light text-dark border">${post.comment_count}</span></td>
                    <td class="text-end pe-4">
                        <div class="d-flex justify-content-end flex-wrap">
                            ${actionButtons}
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div></div></div></div>`;
    app.innerHTML = html;

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('确定要删除这篇帖子及其所有评论吗？此操作不可恢复。')) {
                const id = e.currentTarget.getAttribute('data-id');
                try {
                    await fetchApi(`/admin/posts.php?id=${id}`, { method: 'DELETE' });
                    loadPosts();
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    });

    document.querySelectorAll('.publish-now-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm('确定要立即发布这篇帖子吗？发布后将在前台可见。')) {
                try {
                    const data = await fetchApi('/admin/posts.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'publish_now', id: parseInt(id) })
                    });
                    alert(data.message);
                    loadPosts();
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    });

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm('确定要取消这个发布计划吗？取消后帖子将保留但不会自动发布。')) {
                try {
                    const data = await fetchApi('/admin/posts.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'cancel_schedule', id: parseInt(id) })
                    });
                    alert(data.message);
                    loadPosts();
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

loadPosts();
