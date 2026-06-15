import { fetchApi } from './config.js';
import { renderHeader, getCurrentUser, requireLogin } from './header.js';
import { escapeHtml } from './level_badge.js';
import './styles.css';

renderHeader('collections');

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');

const currentUser = getCurrentUser();
if (!currentUser) {
    requireLogin();
}

let existingCollection = null;
let selectedPostIds = [];

if (editId) {
    loadCollectionForEdit(editId);
} else {
    renderForm();
}

async function loadCollectionForEdit(id) {
    try {
        const data = await fetchApi(`/collection.php?id=${id}`);
        if (!data.is_owner) {
            app.innerHTML = '<div class="alert alert-danger">无权编辑此合集</div>';
            return;
        }
        existingCollection = data;
        selectedPostIds = data.posts.map(p => p.id);
        renderForm(data.collection, data.posts);
    } catch (e) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${e.message}</div>`;
    }
}

function renderForm(collection = null, existingPosts = []) {
    const isEdit = !!collection;
    const title = collection ? collection.title : '';
    const description = collection ? (collection.description || '') : '';
    const coverImage = collection ? (collection.cover_image || '') : '';

    document.title = isEdit ? `编辑合集 - 极简论坛` : '创建合集 - 极简论坛';

    let existingPostsHtml = '';
    if (isEdit && existingPosts.length > 0) {
        existingPostsHtml = `
            <div class="mb-3">
                <label class="form-label">已加入的帖子 <span class="text-muted small">(${existingPosts.length} 篇)</span></label>
                <div class="list-group">
                    ${existingPosts.map((post, i) => `
                        <div class="list-group-item d-flex justify-content-between align-items-center py-2">
                            <div>
                                <span class="badge bg-primary me-2">${i + 1}</span>
                                <a href="/post.html?id=${post.id}" class="text-decoration-none">${escapeHtml(post.title)}</a>
                                <small class="text-muted ms-2">${escapeHtml(post.author_name)}</small>
                            </div>
                            <button type="button" class="btn btn-outline-danger btn-sm remove-existing-post-btn" data-post-id="${post.id}">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <small class="text-muted">在 <a href="/collection.html?id=${collection.id}">合集详情页</a> 可以调整帖子排序</small>
            </div>
        `;
    }

    let html = `
        <div class="row justify-content-center">
            <div class="col-md-8">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item"><a href="/">首页</a></li>
                        <li class="breadcrumb-item"><a href="/collections.html">合集</a></li>
                        <li class="breadcrumb-item active" aria-current="page">${isEdit ? '编辑合集' : '创建合集'}</li>
                    </ol>
                </nav>

                <div class="card shadow-sm">
                    <div class="card-header">
                        <h4 class="mb-0">${isEdit ? '编辑合集' : '创建合集'}</h4>
                    </div>
                    <div class="card-body">
                        <div id="alert-box"></div>
                        <form id="collectionForm">
                            <div class="mb-3">
                                <label for="title" class="form-label">合集标题 <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" id="title" value="${escapeHtml(title)}" 
                                       maxlength="100" required placeholder="输入合集标题">
                                <div class="form-text">最多100个字符</div>
                            </div>
                            <div class="mb-3">
                                <label for="description" class="form-label">合集简介</label>
                                <textarea class="form-control" id="description" rows="4" 
                                          maxlength="1000" placeholder="描述一下这个合集的主题和内容...">${escapeHtml(description)}</textarea>
                                <div class="form-text">最多1000个字符</div>
                            </div>
                            <div class="mb-3">
                                <label for="coverImage" class="form-label">封面图片URL</label>
                                <input type="url" class="form-control" id="coverImage" 
                                       value="${escapeHtml(coverImage)}" placeholder="输入封面图片URL（可选）">
                                <div class="form-text">输入图片的完整URL地址</div>
                            </div>

                            ${existingPostsHtml}

                            ${!isEdit ? `
                            <div class="mb-3">
                                <label class="form-label">选择帖子（可选，创建后也可添加）</label>
                                <div id="selectablePosts" class="list-group" style="max-height: 300px; overflow-y: auto;">
                                    <div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> 加载帖子...</div>
                                </div>
                            </div>
                            ` : ''}

                            <div class="d-flex gap-2">
                                <button type="submit" class="btn btn-primary">
                                    <i class="bi bi-${isEdit ? 'check-lg' : 'plus-circle'} me-1"></i>${isEdit ? '保存修改' : '创建合集'}
                                </button>
                                <a href="${isEdit ? '/collection.html?id=' + collection.id : '/collections.html'}" class="btn btn-secondary">取消</a>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    app.innerHTML = html;

    document.getElementById('collectionForm').addEventListener('submit', handleSubmit);

    document.querySelectorAll('.remove-existing-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = parseInt(btn.dataset.postId);
            if (!confirm('确定将此帖子从合集中移除？')) return;
            btn.disabled = true;
            try {
                await fetchApi('/collections.php?action=remove_post', {
                    method: 'POST',
                    body: JSON.stringify({ collection_id: parseInt(editId), post_id: postId })
                });
                loadCollectionForEdit(editId);
            } catch (e) {
                btn.disabled = false;
                alert('移除失败: ' + e.message);
            }
        });
    });

    if (!isEdit) {
        loadSelectablePosts();
    }
}

async function loadSelectablePosts() {
    const container = document.getElementById('selectablePosts');
    if (!container) return;

    try {
        const data = await fetchApi('/posts.php?page=1');
        const user = getCurrentUser();
        const myPosts = (data.posts || []).filter(p => p.author_name === user.nickname);

        if (myPosts.length === 0) {
            container.innerHTML = '<div class="text-muted text-center py-3">暂无可添加的帖子</div>';
            return;
        }

        let html = '';
        myPosts.forEach(post => {
            html += `
                <label class="list-group-item d-flex align-items-center py-2">
                    <input class="form-check-input me-2" type="checkbox" value="${post.id}" data-post-id="${post.id}">
                    <div>
                        <strong>${escapeHtml(post.title)}</strong>
                        <br><small class="text-muted">${formatDate(post.created_at)}</small>
                    </div>
                </label>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const postId = parseInt(cb.value);
                if (cb.checked) {
                    selectedPostIds.push(postId);
                } else {
                    selectedPostIds = selectedPostIds.filter(id => id !== postId);
                }
            });
        });
    } catch (e) {
        container.innerHTML = `<div class="text-danger">加载帖子失败: ${e.message}</div>`;
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    const alertBox = document.getElementById('alert-box');

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const coverImage = document.getElementById('coverImage').value.trim();

    if (!title) {
        alertBox.innerHTML = '<div class="alert alert-warning">请输入合集标题</div>';
        return;
    }

    try {
        let result;
        if (editId) {
            result = await fetchApi('/collections.php?action=update', {
                method: 'POST',
                body: JSON.stringify({
                    collection_id: parseInt(editId),
                    title,
                    description,
                    cover_image: coverImage
                })
            });
            alertBox.innerHTML = '<div class="alert alert-success">更新成功！</div>';
            setTimeout(() => {
                window.location.href = `/collection.html?id=${editId}`;
            }, 1000);
        } else {
            result = await fetchApi('/collections.php?action=create', {
                method: 'POST',
                body: JSON.stringify({ title, description, cover_image: coverImage })
            });

            const newCollectionId = result.collection.id;

            if (selectedPostIds.length > 0) {
                await fetchApi('/collections.php?action=batch_add_posts', {
                    method: 'POST',
                    body: JSON.stringify({
                        collection_id: newCollectionId,
                        post_ids: selectedPostIds
                    })
                });
            }

            alertBox.innerHTML = '<div class="alert alert-success">创建成功！</div>';
            setTimeout(() => {
                window.location.href = `/collection.html?id=${newCollectionId}`;
            }, 1000);
        }
    } catch (error) {
        alertBox.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    }
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}
