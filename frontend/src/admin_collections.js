import { fetchApi } from './config.js';
import { renderAdminHeader } from './admin_header.js';
import { escapeHtml } from './level_badge.js';
import './styles.css';

renderAdminHeader('collections');

const app = document.getElementById('app');

loadCollections();

async function loadCollections() {
    try {
        const data = await fetchApi('/admin/collections.php');
        renderCollections(data.collections);
    } catch (error) {
        app.innerHTML = `<div class="container mt-4"><div class="alert alert-danger shadow-sm">${error.message}</div></div>`;
    }
}

function renderCollections(collections) {
    let html = `
    <div class="container fade-in py-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2 class="fw-bold text-dark">合集管理</h2>
            <span class="badge bg-primary fs-6">${collections.length} 个合集</span>
        </div>
    `;

    if (collections.length === 0) {
        html += `<div class="alert alert-info">暂无合集</div>`;
    } else {
        html += `
        <div class="card border-0 shadow-sm">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>标题</th>
                            <th>作者</th>
                            <th>帖子数</th>
                            <th>创建时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        collections.forEach(col => {
            html += `
                <tr>
                    <td>${col.id}</td>
                    <td>
                        <a href="/collection.html?id=${col.id}" target="_blank" class="text-decoration-none">
                            ${escapeHtml(col.title)}
                        </a>
                    </td>
                    <td>${escapeHtml(col.author_nickname || '')}</td>
                    <td><span class="badge bg-secondary">${col.post_count}</span></td>
                    <td><small class="text-muted">${new Date(col.created_at).toLocaleString()}</small></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-collection-btn" data-id="${col.id}">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-collection-btn" data-id="${col.id}" data-title="${escapeHtml(col.title)}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div>`;
    }

    html += `</div>`;
    app.innerHTML = html;

    document.querySelectorAll('.delete-collection-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const title = btn.dataset.title;
            if (!confirm(`确定要删除合集「${title}」吗？`)) return;
            try {
                await fetchApi(`/admin/collections.php?id=${id}`, { method: 'DELETE' });
                loadCollections();
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        });
    });

    document.querySelectorAll('.view-collection-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
                const data = await fetchApi(`/admin/collections.php?id=${id}`);
                showCollectionDetail(data);
            } catch (e) {
                alert('加载失败: ' + e.message);
            }
        });
    });
}

function showCollectionDetail({ collection, posts }) {
    let postsHtml = '';
    if (posts.length === 0) {
        postsHtml = '<p class="text-muted">暂无帖子</p>';
    } else {
        postsHtml = '<div class="list-group">';
        posts.forEach((post, i) => {
            const statusBadge = post.status === 'published'
                ? '<span class="badge bg-success">已发布</span>'
                : '<span class="badge bg-warning text-dark">待发布</span>';
            postsHtml += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge bg-primary me-2">${i + 1}</span>
                        <a href="/post.html?id=${post.id}" target="_blank">${escapeHtml(post.title)}</a>
                        ${statusBadge}
                        <small class="text-muted ms-2">${escapeHtml(post.author_name)}</small>
                    </div>
                </div>
            `;
        });
        postsHtml += '</div>';
    }

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${escapeHtml(collection.title)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="text-muted">${escapeHtml(collection.description || '暂无简介')}</p>
                    <div class="mb-2">
                        <small class="text-muted">作者: ${escapeHtml(collection.author_nickname || '')} · 创建时间: ${new Date(collection.created_at).toLocaleString()}</small>
                    </div>
                    <h6>帖子目录 (${posts.length})</h6>
                    ${postsHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
}
