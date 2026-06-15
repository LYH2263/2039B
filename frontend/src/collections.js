import { fetchApi, formatDate } from './config.js';
import { renderHeader, getCurrentUser, requireLogin } from './header.js';
import { renderLevelBadge, escapeHtml } from './level_badge.js';
import './styles.css';

renderHeader('collections');

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const authorId = urlParams.get('author_id');

loadCollections(1);

async function loadCollections(page = 1) {
    try {
        let endpoint = `/collections.php?action=list&page=${page}`;
        if (authorId) {
            endpoint += `&author_id=${authorId}`;
        }
        const data = await fetchApi(endpoint);
        renderCollections(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

async function renderCollections({ collections, pagination }) {
    const currentUser = getCurrentUser();

    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3>${authorId ? 'TA的合集' : '合集/专栏'}</h3>
                    ${currentUser ? `<a href="/create_collection.html" class="btn btn-primary"><i class="bi bi-plus-circle me-1"></i>创建合集</a>` : ''}
                </div>
    `;

    if (collections.length === 0) {
        html += `<div class="alert alert-info text-center">暂无合集，快来创建第一个吧！</div>`;
    } else {
        html += `<div class="row g-4">`;
        collections.forEach(col => {
            const coverHtml = col.cover_image
                ? `<img src="${escapeHtml(col.cover_image)}" class="card-img-top" alt="${escapeHtml(col.title)}" style="height: 180px; object-fit: cover;">`
                : `<div class="card-img-top bg-primary bg-opacity-10 d-flex align-items-center justify-content-center" style="height: 180px;">
                       <i class="bi bi-book-half text-primary" style="font-size: 3rem;"></i>
                   </div>`;

            html += `
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 shadow-sm collection-card" style="cursor: pointer;" onclick="window.location.href='/collection.html?id=${col.id}'">
                        ${coverHtml}
                        <div class="card-body">
                            <h5 class="card-title text-primary">${escapeHtml(col.title)}</h5>
                            <p class="card-text text-muted small">${escapeHtml(col.description || '暂无简介')}</p>
                        </div>
                        <div class="card-footer bg-white d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                <i class="bi bi-person me-1"></i>${escapeHtml(col.author_nickname || '')}
                            </small>
                            <small class="text-muted">
                                <i class="bi bi-file-text me-1"></i>${col.post_count} 篇
                            </small>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (pagination.total_pages > 1) {
        html += `<nav class="mt-4"><ul class="pagination justify-content-center">`;
        if (pagination.current_page > 1) {
            html += `<li class="page-item"><button class="page-link" data-page="${pagination.current_page - 1}">上一页</button></li>`;
        }
        for (let i = 1; i <= pagination.total_pages; i++) {
            html += `<li class="page-item ${i === pagination.current_page ? 'active' : ''}">
                <button class="page-link" data-page="${i}">${i}</button>
            </li>`;
        }
        if (pagination.current_page < pagination.total_pages) {
            html += `<li class="page-item"><button class="page-link" data-page="${pagination.current_page + 1}">下一页</button></li>`;
        }
        html += `</ul></nav>`;
    }

    html += `</div></div>`;
    app.innerHTML = html;

    app.querySelectorAll('.page-link[data-page]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.target.dataset.page);
            loadCollections(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}
