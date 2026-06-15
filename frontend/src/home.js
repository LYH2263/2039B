import { fetchApi, formatDate } from './config.js';
import { renderHeader, getCurrentUser } from './header.js';
import { renderLevelBadge, escapeHtml } from './level_badge.js';
import { loadFollowStatus, renderFollowButton, bindFollowButtons, renderFollowStats } from './follow.js';

renderHeader('home');

const app = document.getElementById('app');

async function loadPosts(page = 1) {
    try {
        const data = await fetchApi(`/posts.php?page=${page}`);
        await renderPosts(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

async function enrichPostsWithAuthorInfo(posts) {
    const currentUser = getCurrentUser();
    const nicknameToUserId = new Map();

    for (const post of posts) {
        if (post.author_level && post.author_level.user_id) {
            nicknameToUserId.set(post.author_name, post.author_level.user_id);
        }
    }

    const tasks = posts.map(async (post) => {
        let userId = nicknameToUserId.get(post.author_name) || post.author_user_id || 0;

        if (!userId) {
            try {
                const searchData = await fetchApi(`/users_search.php?keyword=${encodeURIComponent(post.author_name)}`);
                const matched = (searchData.data?.list || []).find(u => u.nickname === post.author_name);
                if (matched) userId = matched.user_id || matched.id;
            } catch (e) { }
        }

        post.author_user_id = userId;

        if (userId && currentUser) {
            try {
                const status = await loadFollowStatus(userId);
                post.author_follow_status = status;
            } catch (e) {
                post.author_follow_status = { is_following: false, is_self: false, stats: { followers: 0, followings: 0 } };
            }
        } else {
            post.author_follow_status = {
                is_following: false,
                is_self: currentUser && currentUser.nickname === post.author_name,
                stats: { followers: 0, followings: 0 }
            };
        }

        return post;
    });

    return Promise.all(tasks);
}

async function renderPosts({ posts, pagination }) {
    const enrichedPosts = await enrichPostsWithAuthorInfo(posts);

    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3>最新帖子</h3>
                    <a href="/create_post.html" class="btn btn-primary">我要发帖</a>
                </div>
    `;

    if (enrichedPosts.length === 0) {
        html += `<div class="alert alert-info text-center">暂无帖子，快来发布第一条吧！</div>`;
    } else {
        html += `<div class="list-group">`;
        enrichedPosts.forEach(post => {
            const authorBadgeHtml = renderLevelBadge(post.author_level, 'sm');
            const followStatus = post.author_follow_status || {};
            const isSelf = followStatus.is_self || (getCurrentUser() && getCurrentUser().nickname === post.author_name);
            const followBtnHtml = post.author_user_id ? renderFollowButton(post.author_user_id, {
                isFollowing: followStatus.is_following,
                isSelf: isSelf,
                size: 'sm'
            }) : '';

            html += `
                <div class="list-group-item list-group-item-action p-3 post-item" data-post-id="${post.id}">
                    <div class="d-flex w-100 justify-content-between align-items-start mb-2">
                        <h5 class="mb-1 text-primary post-title" style="cursor:pointer;" onclick="window.location.href='/post.html?id=${post.id}'">${escapeHtml(post.title)}</h5>
                        <small class="text-muted flex-shrink-0 ms-3">${formatDate(post.created_at)}</small>
                    </div>
                    <p class="mb-2 text-truncate post-excerpt" style="max-width: 80%; cursor:pointer;" onclick="window.location.href='/post.html?id=${post.id}'">${escapeHtml(post.content.substring(0, 100))}...</p>
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <small class="text-muted d-flex align-items-center gap-2 flex-wrap">
                            <span>作者:</span>
                            <span class="author-name-with-badge">
                                <span>${escapeHtml(post.author_name)}</span>
                                ${authorBadgeHtml}
                            </span>
                            <span>|</span>
                            <span>评论: <span class="badge bg-secondary rounded-pill">${post.comment_count}</span></span>
                        </small>
                        <div class="d-flex align-items-center gap-2">
                            ${post.author_follow_status?.stats ? renderFollowStats(post.author_follow_status.stats, { withLabels: false, separator: ' / ' }) : ''}
                            ${followBtnHtml}
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
            html += `<li class="page-item"><button class="page-link" onclick="window.location.search='?page=${pagination.current_page - 1}'">上一页</button></li>`;
        }
        for (let i = 1; i <= pagination.total_pages; i++) {
            html += `<li class="page-item ${i === pagination.current_page ? 'active' : ''}">
                <button class="page-link" onclick="window.location.search='?page=${i}'">${i}</button>
            </li>`;
        }
        if (pagination.current_page < pagination.total_pages) {
            html += `<li class="page-item"><button class="page-link" onclick="window.location.search='?page=${pagination.current_page + 1}'">下一页</button></li>`;
        }
        html += `</ul></nav>`;
    }

    html += `</div></div>`;
    app.innerHTML = html;

    bindFollowButtons(app);
}

const urlParams = new URLSearchParams(window.location.search);
const page = parseInt(urlParams.get('page')) || 1;
loadPosts(page);
