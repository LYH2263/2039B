import { fetchApi, formatDate } from './config.js';
import { renderHeader, requireLogin } from './header.js';

renderHeader('stories');

const app = document.getElementById('app');
let currentPage = 1;
let currentStatus = 'all';

async function loadStories(page = 1, status = 'all') {
    try {
        const url = status === 'all' 
            ? `/stories.php?page=${page}` 
            : `/stories.php?page=${page}&status=${status}`;
        const data = await fetchApi(url);
        renderStories(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

function renderStories({ stories, pagination }) {
    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3><i class="bi bi-book me-2"></i>接龙故事</h3>
                    <button class="btn btn-primary" onclick="createStory()">
                        <i class="bi bi-plus-circle me-1"></i>创建接龙
                    </button>
                </div>
                
                <div class="btn-group mb-4" role="group">
                    <button type="button" class="btn btn-outline-secondary ${currentStatus === 'all' ? 'active' : ''}" onclick="filterStories('all')">全部</button>
                    <button type="button" class="btn btn-outline-secondary ${currentStatus === 'active' ? 'active' : ''}" onclick="filterStories('active')">进行中</button>
                    <button type="button" class="btn btn-outline-secondary ${currentStatus === 'closed' ? 'active' : ''}" onclick="filterStories('closed')">已封笔</button>
                </div>
    `;

    if (stories.length === 0) {
        html += `<div class="alert alert-info text-center py-5">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            暂无接龙故事，快来创建第一个吧！
        </div>`;
    } else {
        html += `<div class="row g-4">`;
        stories.forEach(story => {
            const statusBadge = story.status === 'active' 
                ? '<span class="badge bg-success">进行中</span>'
                : '<span class="badge bg-secondary">已封笔</span>';
            
            const lockInfo = story.lock_user_id 
                ? `<div class="text-warning small mt-1"><i class="bi bi-lock-fill"></i> ${escapeHtml(story.lock_user_nickname)} 正在续写</div>`
                : '';

            html += `
                <div class="col-md-6">
                    <div class="card h-100 shadow-sm hover-shadow">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h5 class="card-title text-primary mb-0">${escapeHtml(story.title)}</h5>
                                ${statusBadge}
                            </div>
                            <p class="card-text text-muted small mb-2">
                                <i class="bi bi-person-circle me-1"></i>${escapeHtml(story.author_nickname)}
                                <span class="mx-2">|</span>
                                <i class="bi bi-clock me-1"></i>${formatDate(story.created_at)}
                            </p>
                            <p class="card-text text-truncate" style="max-height: 3em; overflow: hidden;">
                                ${escapeHtml(story.opening_paragraph)}
                            </p>
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted small">
                                    <i class="bi bi-file-text me-1"></i>共 ${story.paragraph_count} 段
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-fonts me-1"></i>每段上限 ${story.max_words_per_paragraph} 字
                                </div>
                                <a href="/story_detail.html?id=${story.id}" class="btn btn-sm btn-outline-primary">
                                    查看详情 <i class="bi bi-arrow-right ms-1"></i>
                                </a>
                            </div>
                            ${lockInfo}
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
            html += `<li class="page-item"><button class="page-link" onclick="loadStories(${pagination.current_page - 1}, '${currentStatus}')">上一页</button></li>`;
        }
        for (let i = 1; i <= pagination.total_pages; i++) {
            html += `<li class="page-item ${i === pagination.current_page ? 'active' : ''}">
                <button class="page-link" onclick="loadStories(${i}, '${currentStatus}')">${i}</button>
            </li>`;
        }
        if (pagination.current_page < pagination.total_pages) {
            html += `<li class="page-item"><button class="page-link" onclick="loadStories(${pagination.current_page + 1}, '${currentStatus}')">下一页</button></li>`;
        }
        html += `</ul></nav>`;
    }

    html += `</div></div>`;
    app.innerHTML = html;
}

window.createStory = function() {
    if (!requireLogin()) return;
    window.location.href = '/create_story.html';
};

window.filterStories = function(status) {
    currentStatus = status;
    currentPage = 1;
    loadStories(currentPage, currentStatus);
};

window.loadStories = loadStories;

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

loadStories(currentPage, currentStatus);
