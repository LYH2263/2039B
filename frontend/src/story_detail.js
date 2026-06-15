import { fetchApi, formatDate } from './config.js';
import { renderHeader, requireLogin, getCurrentUser } from './header.js';

renderHeader('stories');

const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('id');

let storyData = null;
let countdownTimer = null;
let pollTimer = null;
let lockEndTime = null;

async function loadStory() {
    try {
        const data = await fetchApi(`/story.php?id=${storyId}`);
        storyData = data;
        renderStory(data);
    } catch (error) {
        app.innerHTML = `<div class="alert alert-danger">加载失败: ${error.message}</div>`;
    }
}

function renderStory({ story, paragraphs, lock, permissions }) {
    const statusBadge = story.status === 'active' 
        ? '<span class="badge bg-success">进行中</span>'
        : '<span class="badge bg-secondary">已封笔</span>';

    let actionButtons = '';
    if (permissions.is_logged_in && story.status === 'active') {
        if (permissions.is_locked_by_me) {
            actionButtons = `
                <div class="alert alert-info lock-timer" id="lockInfo">
                    <i class="bi bi-unlock-fill me-2"></i>
                    <strong>你已获得续写权</strong>
                    <span id="countdown" class="ms-3">剩余时间: 02:00</span>
                </div>
                <div class="mb-4">
                    <label class="form-label fw-bold">
                        <i class="bi bi-pencil-square me-1"></i>续写下一段（第 ${storyData.next_order} 段）
                    </label>
                    <textarea class="form-control" id="continueContent" rows="5" placeholder="请输入你的续写内容..." maxlength="${story.max_words_per_paragraph}"></textarea>
                    <div class="d-flex justify-content-between mt-1">
                        <small class="text-muted" id="continueWordCount">0 / ${story.max_words_per_paragraph} 字</small>
                        <small class="text-danger" id="continueWarning"></small>
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn btn-primary" onclick="submitContinue()">
                            <i class="bi bi-send me-1"></i>提交续写
                        </button>
                        <button class="btn btn-outline-secondary" onclick="releaseLock()">
                            <i class="bi bi-x-circle me-1"></i>放弃续写
                        </button>
                    </div>
                </div>
            `;
            startCountdown(lock.remaining_seconds);
        } else if (lock) {
            actionButtons = `
                <div class="alert alert-warning lock-timer" id="lockInfo">
                    <i class="bi bi-lock-fill me-2"></i>
                    <strong>${escapeHtml(lock.nickname)}</strong> 正在续写
                    <span id="countdown" class="ms-3">剩余时间: ${formatTime(lock.remaining_seconds)}</span>
                </div>
                <button class="btn btn-outline-secondary disabled w-100 mb-4">
                    <i class="bi bi-clock me-1"></i>请等待当前用户完成续写
                </button>
            `;
            startCountdown(lock.remaining_seconds);
        } else if (permissions.can_continue) {
            actionButtons = `
                <button class="btn btn-lg btn-success w-100 mb-4" onclick="acquireLock()">
                    <i class="bi bi-pencil-square me-2"></i>我要续写（第 ${storyData.next_order} 段）
                </button>
            `;
        } else {
            actionButtons = `
                <button class="btn btn-outline-secondary w-100 mb-4 disabled">
                    <i class="bi bi-door-closed me-1"></i>请先登录后再续写
                </button>
            `;
        }
    }

    if (permissions.is_author && story.status === 'active') {
        actionButtons += `
            <div class="d-grid gap-2 d-md-flex justify-content-md-end mb-4">
                <button class="btn btn-outline-danger" onclick="closeStory()">
                    <i class="bi bi-bookmark-x me-1"></i>封笔结束
                </button>
            </div>
        `;
    }

    let paragraphsHtml = '';
    paragraphs.forEach((para, index) => {
        const orderNum = para.paragraph_order === 0 ? '序' : para.paragraph_order;
        const isOpening = para.paragraph_order === 0;
        paragraphsHtml += `
            <div class="card paragraph-card mb-3 ${isOpening ? 'border-primary' : ''}">
                <div class="card-body">
                    <div class="d-flex align-items-start gap-3">
                        <div class="paragraph-order flex-shrink-0">${orderNum}</div>
                        <div class="flex-grow-1">
                            <p class="story-content mb-3">${escapeHtml(para.content)}</p>
                            <div class="d-flex justify-content-between align-items-center text-muted small">
                                <span>
                                    <i class="bi bi-person-circle me-1"></i>${escapeHtml(para.author_nickname)}
                                    ${isOpening ? '<span class="badge bg-primary ms-2">作者开篇</span>' : ''}
                                </span>
                                <span>
                                    <i class="bi bi-fonts me-1"></i>${para.word_count} 字
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-clock me-1"></i>${formatDate(para.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    const html = `
        <div class="row justify-content-center">
            <div class="col-md-10">
                <nav aria-label="breadcrumb" class="mb-3">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item"><a href="/stories.html">接龙故事</a></li>
                        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(story.title)}</li>
                    </ol>
                </nav>

                <div class="card shadow mb-4">
                    <div class="card-header bg-white">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h2 class="h4 mb-2">${escapeHtml(story.title)}</h2>
                                <div class="text-muted small">
                                    <i class="bi bi-person-circle me-1"></i>${escapeHtml(story.author_nickname)}
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-clock me-1"></i>${formatDate(story.created_at)}
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-fonts me-1"></i>每段上限 ${story.max_words_per_paragraph} 字
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-file-text me-1"></i>共 ${paragraphs.length} 段
                                </div>
                            </div>
                            ${statusBadge}
                        </div>
                    </div>
                </div>

                <div id="actionArea">${actionButtons}</div>

                <h4 class="mb-3"><i class="bi bi-book me-2"></i>完整故事线</h4>
                <div id="paragraphsArea">${paragraphsHtml}</div>
            </div>
        </div>
    `;

    app.innerHTML = html;

    const continueContent = document.getElementById('continueContent');
    if (continueContent) {
        continueContent.addEventListener('input', () => {
            const count = continueContent.value.trim().length;
            const max = story.max_words_per_paragraph;
            document.getElementById('continueWordCount').textContent = `${count} / ${max} 字`;
            
            const warning = document.getElementById('continueWarning');
            if (count > max) {
                warning.textContent = `已超过 ${count - max} 字`;
            } else if (count > max * 0.9) {
                warning.textContent = `还剩 ${max - count} 字`;
            } else {
                warning.textContent = '';
            }
        });
    }

    startPolling();
}

function startCountdown(seconds) {
    if (countdownTimer) clearInterval(countdownTimer);
    
    lockEndTime = Date.now() + seconds * 1000;
    
    updateCountdownDisplay();
    countdownTimer = setInterval(() => {
        const remaining = Math.max(0, Math.floor((lockEndTime - Date.now()) / 1000));
        updateCountdownDisplay(remaining);
        
        if (remaining <= 0) {
            clearInterval(countdownTimer);
            if (storyData && storyData.lock && !storyData.permissions.is_locked_by_me) {
                loadStory();
            }
        }
    }, 1000);
}

function updateCountdownDisplay(seconds) {
    const el = document.getElementById('countdown');
    if (el) {
        if (seconds === undefined) {
            seconds = Math.max(0, Math.floor((lockEndTime - Date.now()) / 1000));
        }
        el.textContent = `剩余时间: ${formatTime(seconds)}`;
        
        if (seconds < 30) {
            el.classList.add('text-danger');
        }
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    
    pollTimer = setInterval(() => {
        if (!storyData || storyData.story.status !== 'active') return;
        
        if (storyData.lock && !storyData.permissions.is_locked_by_me) {
            const remaining = Math.max(0, Math.floor((lockEndTime - Date.now()) / 1000));
            if (remaining <= 0) {
                loadStory();
            }
        } else if (!storyData.lock) {
            fetchApi(`/story.php?id=${storyId}`).then(data => {
                if (data.lock) {
                    loadStory();
                }
            }).catch(() => {});
        }
    }, 5000);
}

window.acquireLock = async function() {
    if (!requireLogin()) return;
    
    try {
        const data = await fetchApi('/story_lock.php', {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId, action: 'acquire' })
        });
        
        if (data.lock) {
            lockEndTime = Date.now() + data.lock.remaining_seconds * 1000;
            loadStory();
        }
    } catch (error) {
        alert(error.message);
        loadStory();
    }
};

window.releaseLock = async function() {
    if (!confirm('确定要放弃续写吗？')) return;
    
    try {
        await fetchApi('/story_lock.php', {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId, action: 'release' })
        });
        
        if (countdownTimer) clearInterval(countdownTimer);
        loadStory();
    } catch (error) {
        alert(error.message);
    }
};

window.submitContinue = async function() {
    const content = document.getElementById('continueContent').value.trim();
    
    if (!content) {
        alert('续写内容不能为空');
        return;
    }
    
    if (content.length > storyData.story.max_words_per_paragraph) {
        alert(`字数超过上限，当前 ${content.length} 字，上限 ${storyData.story.max_words_per_paragraph} 字`);
        return;
    }
    
    try {
        const data = await fetchApi('/story_continue.php', {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId, content })
        });
        
        alert('续写成功！');
        if (countdownTimer) clearInterval(countdownTimer);
        loadStory();
        
        setTimeout(() => {
            const paragraphs = document.querySelectorAll('.paragraph-card');
            if (paragraphs.length > 0) {
                paragraphs[paragraphs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    } catch (error) {
        alert(error.message);
        if (error.message.includes('续写权') || error.message.includes('等待')) {
            loadStory();
        }
    }
};

window.closeStory = async function() {
    if (!confirm('确定要封笔结束这个接龙故事吗？封笔后将无法继续续写。')) return;
    
    try {
        await fetchApi('/story_close.php', {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId })
        });
        
        alert('封笔成功！');
        if (countdownTimer) clearInterval(countdownTimer);
        if (pollTimer) clearInterval(pollTimer);
        loadStory();
    } catch (error) {
        alert(error.message);
    }
};

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.addEventListener('beforeunload', () => {
    if (countdownTimer) clearInterval(countdownTimer);
    if (pollTimer) clearInterval(pollTimer);
});

if (storyId) {
    loadStory();
} else {
    app.innerHTML = '<div class="alert alert-danger">缺少故事ID参数</div>';
}
