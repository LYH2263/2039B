import { fetchApi, formatDate } from './config.js';
import { renderHeader } from './header.js';
import { generatePoster, downloadPoster, POSTER_THEMES } from './poster.js';

renderHeader();

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

let currentPost = null;
let currentTheme = 'indigo';
let currentPosterCanvas = null;

if (!postId) {
    app.innerHTML = '<div class="alert alert-danger">无效的帖子ID</div>';
} else {
    loadPost(postId);
    initPosterModal();
}

async function loadPost(id) {
    try {
        const data = await fetchApi(`/post.php?id=${id}`);
        currentPost = data.post;
        renderPost(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

function renderPost({ post, comments }) {
    document.title = `${post.title} - 极简论坛`;
    
    let html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item"><a href="/">首页</a></li>
                        <li class="breadcrumb-item active" aria-current="page">帖子详情</li>
                    </ol>
                </nav>

                <div class="card mb-4">
                    <div class="card-body">
                        <h1 class="card-title mb-3">${escapeHtml(post.title)}</h1>
                        <h6 class="card-subtitle mb-4 text-muted">
                            作者: ${escapeHtml(post.author_name)} | 
                            发布于: ${formatDate(post.created_at)}
                        </h6>
                        <div class="d-flex gap-2 mb-4">
                            <button class="btn btn-outline-primary btn-sm" id="generatePosterBtn">
                                <i class="bi bi-image me-1"></i>生成分享海报
                            </button>
                        </div>
                        <div class="card-text" style="white-space: pre-wrap;">${escapeHtml(post.content)}</div>
                    </div>
                </div>

                <h4 class="mb-3">评论区 (${comments.length})</h4>
    `;

    if (comments.length === 0) {
        html += `<p class="text-muted mb-4">暂无评论，抢沙发！</p>`;
    } else {
        comments.forEach(comment => {
            html += `
                <div class="card mb-3 bg-light">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between">
                            <strong>${escapeHtml(comment.author_name)}</strong>
                            <small class="text-muted">${formatDate(comment.created_at)}</small>
                        </div>
                        <p class="mb-0 mt-1">${escapeHtml(comment.content)}</p>
                    </div>
                </div>
            `;
        });
    }

    html += `
        <div class="card mt-4">
            <div class="card-header">发表评论</div>
            <div class="card-body">
                <div id="alert-box"></div>
                <form id="comment-form">
                    <div class="mb-3">
                        <label for="nickname" class="form-label">昵称 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="nickname" required>
                    </div>
                    <div class="mb-3">
                        <label for="content" class="form-label">评论内容 <span class="text-danger">*</span></label>
                        <textarea class="form-control" id="content" rows="3" required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">提交评论</button>
                </form>
            </div>
        </div>
    </div></div>`;

    app.innerHTML = html;

    document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
    document.getElementById('generatePosterBtn').addEventListener('click', openPosterModal);
}

function initPosterModal() {
    const themeButtonsContainer = document.getElementById('themeButtons');
    Object.entries(POSTER_THEMES).forEach(([key, theme]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn-sm ${currentTheme === key ? 'btn-primary' : 'btn-outline-secondary'}`;
        btn.style.cssText = `background: linear-gradient(135deg, ${theme.bgGradient[0]}, ${theme.bgGradient[1]}); border: none; color: white;`;
        btn.textContent = theme.name;
        btn.dataset.theme = key;
        btn.addEventListener('click', () => switchTheme(key));
        themeButtonsContainer.appendChild(btn);
    });

    document.getElementById('downloadPosterBtn').addEventListener('click', handleDownloadPoster);

    const posterModal = document.getElementById('posterModal');
    posterModal.addEventListener('shown.bs.modal', () => {
        if (currentPost && !currentPosterCanvas) {
            generateCurrentPoster();
        }
    });

    posterModal.addEventListener('hidden.bs.modal', () => {
        currentPosterCanvas = null;
        const posterContainer = document.getElementById('posterContainer');
        posterContainer.innerHTML = `
            <div class="text-muted">
                <div class="spinner-border text-primary mb-2 d-none" id="posterLoading" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p id="posterPlaceholder" class="mb-0">点击生成海报</p>
            </div>
        `;
    });
}

function openPosterModal() {
    if (!currentPost) return;
    
    const modal = new bootstrap.Modal(document.getElementById('posterModal'));
    modal.show();
}

function switchTheme(theme) {
    if (theme === currentTheme) return;
    
    currentTheme = theme;
    
    const buttons = document.querySelectorAll('#themeButtons button');
    buttons.forEach(btn => {
        if (btn.dataset.theme === theme) {
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-primary');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-secondary');
        }
    });

    if (currentPost) {
        generateCurrentPoster();
    }
}

async function generateCurrentPoster() {
    if (!currentPost) return;

    const posterContainer = document.getElementById('posterContainer');
    const posterLoading = document.getElementById('posterLoading');
    const posterPlaceholder = document.getElementById('posterPlaceholder');
    const downloadBtn = document.getElementById('downloadPosterBtn');

    downloadBtn.disabled = true;
    posterContainer.innerHTML = `
        <div class="text-muted">
            <div class="spinner-border text-primary mb-2" role="status">
                <span class="visually-hidden">生成中...</span>
            </div>
            <p class="mb-0">正在生成海报...</p>
        </div>
    `;

    try {
        const shareUrl = `${window.location.origin}/post.html?id=${currentPost.id}`;
        
        const canvas = await generatePoster({
            title: currentPost.title,
            author: currentPost.author_name,
            date: formatDate(currentPost.created_at),
            content: currentPost.content,
            qrUrl: shareUrl,
            forumName: '极简论坛',
            theme: currentTheme
        });

        currentPosterCanvas = canvas;

        posterContainer.innerHTML = '';
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.borderRadius = '8px';
        canvas.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
        posterContainer.appendChild(canvas);

        downloadBtn.disabled = false;
    } catch (error) {
        console.error('生成海报失败:', error);
        posterContainer.innerHTML = `
            <div class="text-danger text-center">
                <i class="bi bi-exclamation-triangle fs-3 mb-2"></i>
                <p class="mb-0">生成失败，请重试</p>
            </div>
        `;
    }
}

function handleDownloadPoster() {
    if (!currentPosterCanvas || !currentPost) return;

    const filename = `poster_${currentPost.id}_${Date.now()}.png`;
    downloadPoster(currentPosterCanvas, filename);
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const nickname = document.getElementById('nickname').value.trim();
    const content = document.getElementById('content').value.trim();
    const alertBox = document.getElementById('alert-box');

    try {
        await fetchApi('/comments.php', {
            method: 'POST',
            body: JSON.stringify({
                post_id: postId,
                nickname,
                content
            })
        });
        window.location.reload();
    } catch (error) {
        alertBox.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
