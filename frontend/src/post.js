import { fetchApi, formatDate } from './config.js';
import { renderHeader, requireLogin, getCurrentUser } from './header.js';
import { generatePoster, downloadPoster, POSTER_THEMES } from './poster.js';
import { tts, MIN_RATE, MAX_RATE } from './tts.js';
import { initMentionAutocomplete } from './mention.js';
import { renderLevelBadge, showPointsToast, escapeHtml } from './level_badge.js';
import './styles.css';

renderHeader();

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

let currentPost = null;
let currentTheme = 'indigo';
let currentPosterCanvas = null;
let mentionAutocomplete = null;

let ttsSupported = false;
let ttsInitialized = false;
let ttsContentElement = null;
let ttsOriginalContent = null;
let ttsSentenceElements = [];
let ttsCurrentSentenceIndex = -1;

if (!postId) {
    app.innerHTML = '<div class="alert alert-danger">无效的帖子ID</div>';
} else {
    loadPost(postId);
    initPosterModal();
    initTTS();
}

window.addEventListener('beforeunload', () => {
    cleanupTTS();
});

window.addEventListener('pagehide', () => {
    cleanupTTS();
});

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
    
    const currentUser = getCurrentUser();
    const authorBadgeHtml = renderLevelBadge(post.author_level, 'sm');
    
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
                        <h6 class="card-subtitle mb-4 text-muted d-flex align-items-center gap-2 flex-wrap">
                            <span>作者:</span>
                            <span class="author-name-with-badge">
                                <span>${escapeHtml(post.author_name)}</span>
                                ${authorBadgeHtml}
                            </span>
                            <span>|</span>
                            <span>发布于: ${formatDate(post.created_at)}</span>
                        </h6>
                        <div class="d-flex gap-2 mb-4">
                            <button class="btn btn-outline-primary btn-sm" id="generatePosterBtn">
                                <i class="bi bi-image me-1"></i>生成分享海报
                            </button>
                            <button class="btn btn-outline-success btn-sm tts-start-btn" id="ttsStartBtn" style="display: none;">
                                <i class="bi bi-volume-up me-1"></i>朗读全文
                            </button>
                        </div>
                        <div class="card-text" id="postContent" style="white-space: pre-wrap;">${post.content_rendered || escapeHtml(post.content)}</div>
                    </div>
                </div>

                <h4 class="mb-3">评论区 (${comments.length})</h4>
    `;

    if (comments.length === 0) {
        html += `<p class="text-muted mb-4">暂无评论，抢沙发！</p>`;
    } else {
        comments.forEach(comment => {
            const commenterBadgeHtml = renderLevelBadge(comment.author_level, 'sm');
            html += `
                <div class="card mb-3 bg-light">
                    <div class="card-body py-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <strong class="author-name-with-badge">
                                <span>${escapeHtml(comment.author_name)}</span>
                                ${commenterBadgeHtml}
                            </strong>
                            <small class="text-muted">${formatDate(comment.created_at)}</small>
                        </div>
                        <p class="mb-0 mt-1" style="white-space: pre-wrap;">${comment.content_rendered || escapeHtml(comment.content)}</p>
                    </div>
                </div>
            `;
        });
    }

    const nicknameValue = currentUser ? currentUser.nickname : '';
    const nicknameReadonly = currentUser ? 'readonly' : '';
    const nicknameClass = currentUser ? 'bg-light' : '';

    html += `
        <div class="card mt-4">
            <div class="card-header">发表评论</div>
            <div class="card-body">
                <div id="alert-box"></div>
                <form id="comment-form">
                    <div class="mb-3">
                        <label for="nickname" class="form-label">昵称 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control ${nicknameClass}" id="nickname" value="${escapeHtml(nicknameValue)}" ${nicknameReadonly} required>
                    </div>
                    <div class="mb-3">
                        <label for="content" class="form-label">评论内容 <span class="text-danger">*</span></label>
                        <textarea class="form-control" id="content" rows="3" required placeholder="输入 @ 可以提及其他用户"></textarea>
                        <div class="form-text text-muted">
                            <i class="bi bi-info-circle"></i> 输入 @ 后可自动补全用户昵称，例如 @管理员
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">提交评论</button>
                </form>
            </div>
        </div>
    </div></div>`;

    app.innerHTML = html;

    document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
    document.getElementById('generatePosterBtn').addEventListener('click', openPosterModal);
    
    const contentTextarea = document.getElementById('content');
    if (contentTextarea) {
        if (mentionAutocomplete) {
            mentionAutocomplete.destroy();
        }
        mentionAutocomplete = initMentionAutocomplete(contentTextarea);
    }
    
    ttsContentElement = document.getElementById('postContent');
    ttsOriginalContent = post.content;
    
    if (ttsSupported) {
        const ttsBtn = document.getElementById('ttsStartBtn');
        if (ttsBtn) {
            ttsBtn.style.display = 'inline-flex';
            ttsBtn.addEventListener('click', startTTS);
        }
    }
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
    
    if (!requireLogin()) return;
    
    const nickname = document.getElementById('nickname').value.trim();
    const content = document.getElementById('content').value.trim();
    const alertBox = document.getElementById('alert-box');

    try {
        const data = await fetchApi('/comments.php', {
            method: 'POST',
            body: JSON.stringify({
                post_id: postId,
                nickname,
                content
            })
        });

        if (data.commenter_points && data.commenter_points.points_change) {
            showPointsToast(data.commenter_points.points_change, '评论');
        }

        let successMsg = '评论成功！';
        if (data.mentioned_users && data.mentioned_users.length > 0) {
            const mentionedNames = data.mentioned_users.map(u => '@' + u.nickname).join('、');
            successMsg += ` 已提及 ${mentionedNames}`;
        }

        alertBox.innerHTML = `<div class="alert alert-success">${successMsg}</div>`;
        setTimeout(() => {
            window.location.reload();
        }, 1200);
    } catch (error) {
        alertBox.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    }
}

function escapeHtmlForSpan(text) {
    return escapeHtml(text);
}

async function initTTS() {
    if (ttsInitialized) return;
    
    ttsSupported = tts.isSupported();
    
    if (!ttsSupported) {
        showUnsupportedAlert();
        return;
    }
    
    try {
        await tts.init();
        ttsInitialized = true;
        
        if (currentPost) {
            const ttsBtn = document.getElementById('ttsStartBtn');
            if (ttsBtn) {
                ttsBtn.style.display = 'inline-flex';
            }
        }
        
        initTTSControlBar();
        
        tts.onVoicesChanged = (voices) => {
            populateVoiceSelect(voices);
        };
        
    } catch (error) {
        console.error('TTS init failed:', error);
        ttsSupported = false;
        showUnsupportedAlert();
    }
}

function showUnsupportedAlert() {
    const alert = document.getElementById('ttsUnsupportedAlert');
    if (alert) {
        alert.classList.remove('d-none');
    }
}

function initTTSControlBar() {
    const playPauseBtn = document.getElementById('ttsPlayPauseBtn');
    const stopBtn = document.getElementById('ttsStopBtn');
    const closeBtn = document.getElementById('ttsCloseBtn');
    const rateSlider = document.getElementById('ttsRateSlider');
    const voiceSelect = document.getElementById('ttsVoiceSelect');
    
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopTTS);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTTS);
    }
    
    if (rateSlider) {
        rateSlider.value = tts.getPreferredRate();
        document.getElementById('ttsRateValue').textContent = `${tts.getPreferredRate().toFixed(1)}x`;
        
        rateSlider.addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            document.getElementById('ttsRateValue').textContent = `${rate.toFixed(1)}x`;
            tts.setRate(rate);
        });
    }
    
    populateVoiceSelect(tts.getVoices());
}

function populateVoiceSelect(voices) {
    const voiceSelect = document.getElementById('ttsVoiceSelect');
    if (!voiceSelect) return;
    
    voiceSelect.innerHTML = '';
    
    if (voices.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '无可用嗓音';
        option.disabled = true;
        voiceSelect.appendChild(option);
        return;
    }
    
    const zhVoices = voices.filter(v => v.lang.toLowerCase().startsWith('zh'));
    const enVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    const otherVoices = voices.filter(v => 
        !v.lang.toLowerCase().startsWith('zh') && !v.lang.toLowerCase().startsWith('en')
    );
    
    const preferredVoice = tts.getPreferredVoice();
    
    const addVoiceGroup = (voiceList, label) => {
        if (voiceList.length === 0) return;
        
        const group = document.createElement('optgroup');
        group.label = label;
        
        voiceList.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' - 默认' : ''}`;
            if (preferredVoice && voice.name === preferredVoice.name) {
                option.selected = true;
            }
            group.appendChild(option);
        });
        
        voiceSelect.appendChild(group);
    };
    
    addVoiceGroup(zhVoices, '中文');
    addVoiceGroup(enVoices, 'English');
    addVoiceGroup(otherVoices, '其他');
    
    voiceSelect.addEventListener('change', (e) => {
        tts.setVoice(e.target.value);
    });
}

function startTTS() {
    if (!ttsSupported || !currentPost) return;
    
    const text = ttsOriginalContent;
    if (!text || text.trim().length === 0) return;
    
    wrapContentWithSentences(text);
    
    const controlBar = document.getElementById('ttsControlBar');
    if (controlBar) {
        controlBar.classList.remove('d-none');
        document.body.style.paddingBottom = '80px';
    }
    
    const voiceSelect = document.getElementById('ttsVoiceSelect');
    const selectedVoiceName = voiceSelect ? voiceSelect.value : '';
    const voice = tts.getVoices().find(v => v.name === selectedVoiceName) || tts.getPreferredVoice();
    const rate = parseFloat(document.getElementById('ttsRateSlider').value) || tts.getPreferredRate();
    
    tts.speak(text, {
        voice,
        rate,
        onBoundary: handleTTSBoundary,
        onEnd: handleTTSEnd
    });
    
    updatePlayPauseButton();
    updateProgress();
}

function wrapContentWithSentences(text) {
    if (!ttsContentElement) return;
    
    const sentences = tts.splitSentences(text);
    
    let html = '';
    sentences.forEach((sentence, index) => {
        const escaped = escapeHtmlForSpan(sentence);
        html += `<span class="tts-sentence" data-sentence-index="${index}">${escaped}</span>`;
    });
    
    ttsContentElement.innerHTML = html;
    ttsContentElement.style.whiteSpace = 'pre-wrap';
    
    ttsSentenceElements = Array.from(ttsContentElement.querySelectorAll('.tts-sentence'));
}

function handleTTSBoundary(event) {
    if (event.type === 'sentencestart') {
        highlightSentence(event.sentenceIndex);
        updateProgress();
    }
}

function handleTTSEnd() {
    resetTTSState();
    updatePlayPauseButton();
    updateProgress();
}

function highlightSentence(index) {
    ttsCurrentSentenceIndex = index;
    
    ttsSentenceElements.forEach((el, i) => {
        if (i === index) {
            el.classList.add('tts-sentence-active');
            scrollToElement(el);
        } else {
            el.classList.remove('tts-sentence-active');
        }
    });
}

function scrollToElement(element) {
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 0 && 
                      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
    
    if (!isVisible) {
        const controlBarHeight = 80;
        const elementTop = rect.top + window.pageYOffset;
        const scrollTo = elementTop - (window.innerHeight / 3) - controlBarHeight;
        
        window.scrollTo({
            top: Math.max(0, scrollTo),
            behavior: 'smooth'
        });
    }
}

function togglePlayPause() {
    if (tts.isPaused) {
        tts.resume();
    } else if (tts.isPlaying) {
        tts.pause();
    } else {
        startTTS();
    }
    updatePlayPauseButton();
}

function stopTTS() {
    tts.stop();
    resetTTSState();
    restoreOriginalContent();
    updatePlayPauseButton();
    updateProgress();
}

function closeTTS() {
    tts.stop();
    resetTTSState();
    
    const controlBar = document.getElementById('ttsControlBar');
    if (controlBar) {
        controlBar.classList.add('d-none');
        document.body.style.paddingBottom = '';
    }
    
    restoreOriginalContent();
}

function resetTTSState() {
    ttsCurrentSentenceIndex = -1;
    
    ttsSentenceElements.forEach(el => {
        el.classList.remove('tts-sentence-active');
    });
}

function restoreOriginalContent() {
    if (ttsContentElement && ttsOriginalContent) {
        ttsContentElement.innerHTML = escapeHtml(ttsOriginalContent);
        ttsContentElement.style.whiteSpace = 'pre-wrap';
        ttsSentenceElements = [];
        ttsCurrentSentenceIndex = -1;
    }
}

function updatePlayPauseButton() {
    const btn = document.getElementById('ttsPlayPauseBtn');
    if (!btn) return;
    
    const icon = btn.querySelector('i');
    if (!icon) return;
    
    if (tts.isPlaying && !tts.isPaused) {
        icon.className = 'bi bi-pause-fill';
        btn.title = '暂停';
    } else {
        icon.className = 'bi bi-play-fill';
        btn.title = '播放';
    }
}

function updateProgress() {
    const progressEl = document.getElementById('ttsProgress');
    if (!progressEl) return;
    
    const total = tts.sentences.length || ttsSentenceElements.length;
    const current = Math.max(0, tts.currentSentenceIndex + 1);
    
    progressEl.textContent = `${current} / ${total}`;
}

function cleanupTTS() {
    tts.destroy();
    restoreOriginalContent();
    
    const controlBar = document.getElementById('ttsControlBar');
    if (controlBar) {
        controlBar.classList.add('d-none');
        document.body.style.paddingBottom = '';
    }
}
