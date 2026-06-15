import { fetchApi, formatDate } from './config.js';
import { renderHeader, getCurrentUser, requireLogin } from './header.js';
import { renderLevelBadge, escapeHtml } from './level_badge.js';
import './styles.css';

renderHeader('collections');

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const collectionId = urlParams.get('id');

let currentCollection = null;
let dragSrcIndex = null;

if (!collectionId) {
    app.innerHTML = '<div class="alert alert-danger">无效的合集ID</div>';
} else {
    loadCollection(collectionId);
}

async function loadCollection(id) {
    try {
        const data = await fetchApi(`/collection.php?id=${id}`);
        currentCollection = data;
        renderCollection(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

function renderCollection({ collection, posts, is_owner }) {
    document.title = `${collection.title} - 极简论坛`;

    const currentUser = getCurrentUser();
    const coverHtml = collection.cover_image
        ? `<img src="${escapeHtml(collection.cover_image)}" class="rounded" alt="${escapeHtml(collection.title)}" style="max-height: 200px; object-fit: cover;">`
        : `<div class="rounded bg-primary bg-opacity-10 d-flex align-items-center justify-content-center" style="width: 100%; max-height: 200px; min-height: 120px;">
               <i class="bi bi-book-half text-primary" style="font-size: 3rem;"></i>
           </div>`;

    let ownerActions = '';
    if (is_owner) {
        ownerActions = `
            <div class="d-flex gap-2 flex-wrap mt-3">
                <a href="/create_collection.html?id=${collection.id}" class="btn btn-outline-primary btn-sm">
                    <i class="bi bi-pencil me-1"></i>编辑合集
                </a>
                <button class="btn btn-outline-success btn-sm" id="addPostBtn">
                    <i class="bi bi-plus-circle me-1"></i>添加帖子
                </button>
                <button class="btn btn-outline-danger btn-sm" id="deleteCollectionBtn">
                    <i class="bi bi-trash me-1"></i>删除合集
                </button>
            </div>
        `;
    }

    let postsListHtml = '';
    if (posts.length === 0) {
        postsListHtml = `<div class="text-muted text-center py-4">暂无帖子，${is_owner ? '快去添加吧！' : '等待作者更新。'}</div>`;
    } else {
        posts.forEach((post, index) => {
            const dateStr = formatDate(post.published_at || post.created_at);
            postsListHtml += `
                <div class="list-group-item list-group-item-action d-flex align-items-center p-3 collection-post-item" 
                     data-post-id="${post.id}" 
                     data-sort-order="${post.sort_order}"
                     draggable="${is_owner ? 'true' : 'false'}">
                    ${is_owner ? `<i class="bi bi-grip-vertical text-muted me-2 drag-handle" style="cursor: grab;"></i>` : ''}
                    <span class="badge bg-primary rounded-circle me-3 flex-shrink-0" 
                          style="width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                        ${index + 1}
                    </span>
                    <div class="flex-grow-1" style="cursor: pointer;" onclick="window.location.href='/post.html?id=${post.id}'">
                        <div class="fw-bold text-primary">${escapeHtml(post.title)}</div>
                        <small class="text-muted">
                            <i class="bi bi-person me-1"></i>${escapeHtml(post.author_name)}
                            <span class="ms-2"><i class="bi bi-clock me-1"></i>${dateStr}</span>
                            <span class="ms-2"><i class="bi bi-chat me-1"></i>${post.comment_count} 评论</span>
                        </small>
                    </div>
                    ${is_owner ? `
                    <div class="d-flex align-items-center gap-1 flex-shrink-0 ms-2">
                        <button class="btn btn-outline-secondary btn-sm move-up-btn" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>
                            <i class="bi bi-arrow-up"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm move-down-btn" data-index="${index}" title="下移" ${index === posts.length - 1 ? 'disabled' : ''}>
                            <i class="bi bi-arrow-down"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm remove-post-btn" data-post-id="${post.id}" title="移除">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
        });
    }

    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item"><a href="/">首页</a></li>
                        <li class="breadcrumb-item"><a href="/collections.html">合集</a></li>
                        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(collection.title)}</li>
                    </ol>
                </nav>

                <div class="card mb-4 shadow-sm">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-3 mb-3 mb-md-0">
                                ${coverHtml}
                            </div>
                            <div class="col-md-9">
                                <h2 class="mb-2">${escapeHtml(collection.title)}</h2>
                                <p class="text-muted mb-2">${escapeHtml(collection.description || '暂无简介')}</p>
                                <div class="d-flex gap-3 text-muted small">
                                    <span><i class="bi bi-person me-1"></i>${escapeHtml(collection.author_nickname || '')}</span>
                                    <span><i class="bi bi-file-text me-1"></i>${collection.post_count} 篇帖子</span>
                                    <span><i class="bi bi-calendar me-1"></i>创建于 ${formatDate(collection.created_at)}</span>
                                </div>
                                ${ownerActions}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card shadow-sm">
                    <div class="card-header bg-white">
                        <h5 class="mb-0"><i class="bi bi-list-ol me-2"></i>帖子目录</h5>
                    </div>
                    <div class="list-group list-group-flush" id="postsList">
                        ${postsListHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    app.innerHTML = html;

    bindOwnerActions(is_owner, posts);
}

function bindOwnerActions(is_owner, posts) {
    if (!is_owner) return;

    const addPostBtn = document.getElementById('addPostBtn');
    if (addPostBtn) {
        addPostBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addPostModal'));
            loadMyPosts();
            modal.show();
        });
    }

    const deleteBtn = document.getElementById('deleteCollectionBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('确定要删除此合集吗？删除后合集中的帖子不会被删除。')) return;
            try {
                await fetchApi('/collections.php?action=delete', {
                    method: 'POST',
                    body: JSON.stringify({ collection_id: parseInt(collectionId) })
                });
                alert('合集已删除');
                window.location.href = '/collections.html';
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        });
    }

    document.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index > 0) swapPosts(posts, index, index - 1);
        });
    });

    document.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index < posts.length - 1) swapPosts(posts, index, index + 1);
        });
    });

    document.querySelectorAll('.remove-post-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const postId = parseInt(btn.dataset.postId);
            if (!confirm('确定要将此帖子从合集中移除吗？')) return;
            try {
                await fetchApi('/collections.php?action=remove_post', {
                    method: 'POST',
                    body: JSON.stringify({ collection_id: parseInt(collectionId), post_id: postId })
                });
                loadCollection(collectionId);
            } catch (err) {
                alert('移除失败: ' + err.message);
            }
        });
    });

    initDragAndDrop(posts);
}

async function swapPosts(posts, fromIndex, toIndex) {
    const newPosts = [...posts];
    [newPosts[fromIndex], newPosts[toIndex]] = [newPosts[toIndex], newPosts[fromIndex]];

    const post_orders = newPosts.map((p, i) => ({
        post_id: p.id,
        sort_order: i
    }));

    try {
        await fetchApi('/collections.php?action=reorder_posts', {
            method: 'POST',
            body: JSON.stringify({ collection_id: parseInt(collectionId), post_orders })
        });
        loadCollection(collectionId);
    } catch (e) {
        alert('排序失败: ' + e.message);
    }
}

function initDragAndDrop(posts) {
    const items = document.querySelectorAll('.collection-post-item[draggable="true"]');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragSrcIndex = parseInt(item.querySelector('.move-up-btn')?.dataset.index ?? 0);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('opacity-50');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('opacity-50');
            dragSrcIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetIndex = parseInt(item.querySelector('.move-up-btn')?.dataset.index ?? 0);
            if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
                swapPosts(posts, dragSrcIndex, targetIndex);
            }
        });
    });
}

async function loadMyPosts() {
    const container = document.getElementById('myPostsList');
    container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> 加载中...</div>';

    try {
        const data = await fetchApi('/collections.php?action=my');
        const myCollections = data.collections || [];
        const currentCol = myCollections.find(c => c.id === parseInt(collectionId));
        const existingPostIds = new Set();

        if (currentCol) {
            const detailData = await fetchApi(`/collection.php?id=${collectionId}`);
            detailData.posts.forEach(p => existingPostIds.add(p.id));
        }

        const postsData = await fetchApi('/posts.php?page=1');
        const currentUser = getCurrentUser();
        const myPosts = (postsData.posts || []).filter(p => {
            return p.author_name === currentUser.nickname && !existingPostIds.has(p.id);
        });

        if (myPosts.length === 0) {
            container.innerHTML = '<div class="text-muted text-center py-3">没有可添加的帖子（只可添加自己已发布且不在合集中的帖子）</div>';
            return;
        }

        let html = '<div class="list-group">';
        myPosts.forEach(post => {
            html += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${escapeHtml(post.title)}</strong>
                        <br><small class="text-muted">${formatDate(post.created_at)} · ${post.comment_count} 评论</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary add-to-collection-btn" data-post-id="${post.id}">
                        <i class="bi bi-plus-circle me-1"></i>添加
                    </button>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.add-to-collection-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const postId = parseInt(btn.dataset.postId);
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                try {
                    await fetchApi('/collections.php?action=add_post', {
                        method: 'POST',
                        body: JSON.stringify({ collection_id: parseInt(collectionId), post_id: postId })
                    });
                    btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>已添加';
                    btn.classList.remove('btn-outline-primary');
                    btn.classList.add('btn-success');
                    loadCollection(collectionId);
                } catch (e) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>添加';
                    alert('添加失败: ' + e.message);
                }
            });
        });
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">加载帖子失败: ${e.message}</div>`;
    }
}
