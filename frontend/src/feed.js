import { fetchApi, formatDate } from './config.js';
import { renderHeader, getCurrentUser, requireLogin } from './header.js';
import { renderLevelBadge, escapeHtml } from './level_badge.js';
import { renderFollowButton, bindFollowButtons, renderFollowStats, toggleFollow } from './follow.js';

renderHeader('feed');

const app = document.getElementById('app');
let isLoading = false;

async function loadFeed(page = 1) {
    if (isLoading) return;
    const currentUser = getCurrentUser();
    if (!currentUser) {
        renderLoginPrompt();
        return;
    }

    isLoading = true;
    try {
        const data = await fetchApi(`/feed.php?page=${page}`);
        renderFeed(data, page);
    } catch (error) {
        if (error.message.includes('请先登录') || error.message.includes('登录')) {
            renderLoginPrompt();
        } else {
            app.innerHTML = `<div class="alert alert-danger">加载失败: ${escapeHtml(error.message)}</div>`;
        }
    } finally {
        isLoading = false;
    }
}

function renderLoginPrompt() {
    app.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-8">
                <div class="card shadow-sm">
                    <div class="card-body text-center py-5">
                        <div class="mb-4">
                            <i class="bi bi-person-circle text-primary" style="font-size: 4rem;"></i>
                        </div>
                        <h3 class="card-title mb-3">登录后查看你的动态</h3>
                        <p class="text-muted mb-4">
                            关注感兴趣的作者，第一时间获取他们发布的新帖子。<br>
                            登录后即可开启属于你的信息流。
                        </p>
                        <div class="d-flex justify-content-center gap-3">
                            <a href="/login.html?redirect=${encodeURIComponent('/feed.html')}" class="btn btn-primary">
                                <i class="bi bi-box-arrow-in-right me-1"></i>立即登录
                            </a>
                            <a href="/register.html" class="btn btn-outline-secondary">
                                <i class="bi bi-person-plus me-1"></i>注册账号
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderEmptyNoFollowing() {
    return `
        <div class="card shadow-sm">
            <div class="card-body text-center py-5">
                <div class="mb-4">
                    <i class="bi bi-people text-secondary" style="font-size: 4rem;"></i>
                </div>
                <h4 class="card-title mb-3">你还没有关注任何人</h4>
                <p class="text-muted mb-4">
                    去发现有趣的作者，关注他们后，<br>
                    他们发布的新帖子就会出现在这里啦~
                </p>
                <div class="d-flex justify-content-center gap-3">
                    <a href="/" class="btn btn-primary">
                        <i class="bi bi-house me-1"></i>去首页逛逛
                    </a>
                    <a href="/create_post.html" class="btn btn-outline-secondary">
                        <i class="bi bi-pencil me-1"></i>自己发帖
                    </a>
                </div>
            </div>
        </div>
    `;
}

function renderEmptyNoPosts() {
    return `
        <div class="card shadow-sm">
            <div class="card-body text-center py-5">
                <div class="mb-4">
                    <i class="bi bi-inbox text-secondary" style="font-size: 4rem;"></i>
                </div>
                <h4 class="card-title mb-3">关注的人还没有发布新动态</h4>
                <p class="text-muted mb-4">
                    稍安勿躁，你的关注列表里的作者们可能正在创作中。<br>
                    也可以去关注更多有趣的作者~
                </p>
                <div class="d-flex justify-content-center gap-3">
                    <a href="/" class="btn btn-primary">
                        <i class="bi bi-house me-1"></i>去发现更多作者
                    </a>
                    <button onclick="window.location.reload()" class="btn btn-outline-secondary">
                        <i class="bi bi-arrow-clockwise me-1"></i>刷新看看
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderFeed({ posts, pagination, message }, currentPage) {
    const followingCount = pagination?.following_count ?? 0;
    const followerCount = pagination?.follower_count ?? 0;
    const currentUser = getCurrentUser();

    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <div class="row mb-4">
                    <div class="col-md-8">
                        <div class="d-flex justify-content-between align-items-center mb-0">
                            <h3 class="mb-0">我的动态</h3>
                            <button onclick="window.location.reload()" class="btn btn-outline-secondary btn-sm">
                                <i class="bi bi-arrow-clockwise me-1"></i>刷新
                            </button>
                        </div>
                        <p class="text-muted small mt-2 mb-0">
                            ${message ? escapeHtml(message) : `共 ${pagination.total_posts || 0} 条动态`}
                        </p>
                    </div>
                    <div class="col-md-4">
                        <div class="card border-0 bg-light shadow-sm h-100">
                            <div class="card-body py-2 px-3">
                                <div class="d-flex justify-content-around align-items-center text-center">
                                    <div>
                                        <div class="h5 mb-0"><strong>${followingCount}</strong></div>
                                        <small class="text-muted">关注</small>
                                    </div>
                                    <div class="vr"></div>
                                    <div>
                                        <div class="h5 mb-0"><strong>${followerCount}</strong></div>
                                        <small class="text-muted">粉丝</small>
                                    </div>
                                    <div class="vr"></div>
                                    <div>
                                        <div class="h5 mb-0"><strong>${pagination.total_posts || 0}</strong></div>
                                        <small class="text-muted">动态</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
    `;

    if (followingCount === 0) {
        html += renderEmptyNoFollowing();
    } else if (posts.length === 0) {
        html += renderEmptyNoPosts();
    } else {
        html += `<div class="list-group">`;
        posts.forEach(post => {
            const authorBadgeHtml = renderLevelBadge(post.author_level, 'sm');
            const authorUserId = post.author_user_id || 0;
            const isFollowingAuthor = post.is_following_author === true;
            const isSelf = currentUser && Number(currentUser.id) === Number(authorUserId);

            const followBtnHtml = authorUserId ? renderFollowButton(authorUserId, {
                isFollowing: isFollowingAuthor,
                isSelf: isSelf,
                size: 'sm'
            }) : '';

            html += `
                <div class="list-group-item list-group-item-action p-4 feed-post-item" data-post-id="${post.id}">
                    <div class="d-flex justify-content-between align-items-start mb-3 gap-3 flex-wrap">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <div class="author-avatar rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0"
                                 style="width:40px;height:40px;font-size:16px;font-weight:600;">
                                ${escapeHtml((post.author_name || 'U').substring(0, 1))}
                            </div>
                            <div>
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <strong>${escapeHtml(post.author_name || '匿名')}</strong>
                                    ${authorBadgeHtml}
                                </div>
                                <small class="text-muted">
                                    ${post.author_follow_stats ? renderFollowStats(post.author_follow_stats, { withLabels: false, separator: ' · ' }) : ''}
                                    ${post.author_follow_stats ? ' · ' : ''}
                                    ${formatDate(post.created_at)}
                                </small>
                            </div>
                        </div>
                        ${followBtnHtml}
                    </div>
                    <div onclick="window.location.href='/post.html?id=${post.id}'" style="cursor:pointer;">
                        <h5 class="mb-2 text-primary">${escapeHtml(post.title)}</h5>
                        <p class="mb-3" style="white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                            ${escapeHtml(post.content)}
                        </p>
                    </div>
                    <div class="d-flex justify-content-between align-items-center small text-muted">
                        <div class="d-flex gap-3">
                            <span><i class="bi bi-chat-dots me-1"></i>评论 ${post.comment_count || 0}</span>
                        </div>
                        <a href="/post.html?id=${post.id}" class="text-primary text-decoration-none">
                            查看详情 <i class="bi bi-chevron-right"></i>
                        </a>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (pagination && pagination.total_pages > 1) {
        html += `<nav class="mt-4"><ul class="pagination justify-content-center">`;
        if (pagination.current_page > 1) {
            html += `<li class="page-item"><button class="page-link" onclick="changePage(${pagination.current_page - 1})">上一页</button></li>`;
        }
        const start = Math.max(1, pagination.current_page - 2);
        const end = Math.min(pagination.total_pages, pagination.current_page + 2);
        for (let i = start; i <= end; i++) {
            html += `<li class="page-item ${i === pagination.current_page ? 'active' : ''}">
                <button class="page-link" onclick="changePage(${i})">${i}</button>
            </li>`;
        }
        if (pagination.current_page < pagination.total_pages) {
            html += `<li class="page-item"><button class="page-link" onclick="changePage(${pagination.current_page + 1})">下一页</button></li>`;
        }
        html += `</ul></nav>`;
    }

    html += `</div></div>`;
    app.innerHTML = html;

    bindFollowButtons(app, {
        onStatusChanged: (userId, data) => {
            const cards = app.querySelectorAll(`[data-author-user-id="${userId}"], .follow-btn[data-user-id="${userId}"]`);
            cards.forEach(() => {
                if (data.stats) {
                    const statEls = app.querySelectorAll('.follow-stats');
                }
            });
        }
    });
}

window.changePage = function (page) {
    const url = new URL(window.location);
    url.searchParams.set('page', page);
    window.history.pushState({}, '', url);
    loadFeed(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

const urlParams = new URLSearchParams(window.location.search);
const initialPage = parseInt(urlParams.get('page')) || 1;
loadFeed(initialPage);
