import { fetchApi } from './config.js';
import { renderHeader, requireLogin } from './header.js';
import { initMentionAutocomplete } from './mention.js';
import { showPointsToast } from './level_badge.js';

renderHeader('create');

const app = document.getElementById('app');

app.innerHTML = `
<div class="row justify-content-center">
    <div class="col-md-8">
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h4 class="mb-0">发布新帖子</h4>
            </div>
            <div class="card-body">
                <div id="alert-box"></div>
                <form id="post-form">
                    <div class="mb-3">
                        <label for="title" class="form-label">标题 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="title" required>
                    </div>
                    
                    <div class="mb-3">
                        <label for="author" class="form-label">作者昵称 <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="author" required>
                    </div>

                    <div class="mb-3">
                        <label for="content" class="form-label">内容 <span class="text-danger">*</span></label>
                        <textarea class="form-control" id="content" rows="6" required></textarea>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">发布时间</label>
                        <div class="card bg-light border-0">
                            <div class="card-body py-3">
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="publish_mode" id="mode_immediate" value="immediate" checked>
                                    <label class="form-check-label fw-medium" for="mode_immediate">
                                        <i class="bi bi-lightning-charge-fill text-warning"></i> 立即发布
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="publish_mode" id="mode_scheduled" value="scheduled">
                                    <label class="form-check-label fw-medium" for="mode_scheduled">
                                        <i class="bi bi-clock-history text-info"></i> 指定时间发布
                                    </label>
                                </div>
                                <div id="scheduled_time_wrapper" class="mt-3" style="display: none;">
                                    <label for="scheduled_at" class="form-label small text-muted mb-1">选择未来的发布时间（北京时间）</label>
                                    <input type="datetime-local" class="form-control" id="scheduled_at" step="1">
                                    <div class="form-text mt-1">
                                        <i class="bi bi-info-circle"></i> 到点后将自动发布，未到时间前帖子不会在前台显示
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="d-grid gap-2">
                        <button type="submit" id="submit-btn" class="btn btn-success">
                            <i class="bi bi-send-fill"></i> <span id="submit-btn-text">立即发布</span>
                        </button>
                        <a href="/" class="btn btn-secondary">返回首页</a>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
`;

let mentionAutocomplete = null;

function toLocalDatetimeLocalValue(date) {
    const pad = (n) => n < 10 ? '0' + n : n;
    return date.getFullYear() + '-' +
           pad(date.getMonth() + 1) + '-' +
           pad(date.getDate()) + 'T' +
           pad(date.getHours()) + ':' +
           pad(date.getMinutes()) + ':' +
           pad(date.getSeconds());
}

function validateFutureTime(datetimeLocalValue) {
    if (!datetimeLocalValue) {
        return { valid: false, message: '请选择发布时间' };
    }
    const selectedTime = new Date(datetimeLocalValue);
    const now = new Date();
    if (selectedTime.getTime() <= now.getTime()) {
        return { valid: false, message: '计划发布时间必须是未来时间' };
    }
    return { valid: true };
}

function initPostForm() {
    const contentTextarea = document.getElementById('content');
    if (contentTextarea) {
        mentionAutocomplete = initMentionAutocomplete(contentTextarea);
    }
    
    const authorInput = document.getElementById('author');
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (currentUser) {
        authorInput.value = currentUser.nickname;
        authorInput.readOnly = true;
        authorInput.classList.add('bg-light');
    }

    const modeImmediate = document.getElementById('mode_immediate');
    const modeScheduled = document.getElementById('mode_scheduled');
    const scheduledWrapper = document.getElementById('scheduled_time_wrapper');
    const scheduledInput = document.getElementById('scheduled_at');
    const submitBtn = document.getElementById('submit-btn');
    const submitBtnText = document.getElementById('submit-btn-text');

    const defaultScheduleTime = new Date();
    defaultScheduleTime.setMinutes(defaultScheduleTime.getMinutes() + 30);
    defaultScheduleTime.setSeconds(0);
    scheduledInput.value = toLocalDatetimeLocalValue(defaultScheduleTime);
    scheduledInput.min = toLocalDatetimeLocalValue(new Date());

    function updateModeUI() {
        const isScheduled = modeScheduled.checked;
        scheduledWrapper.style.display = isScheduled ? 'block' : 'none';
        if (isScheduled) {
            submitBtn.classList.remove('btn-success');
            submitBtn.classList.add('btn-outline-primary');
            submitBtnText.textContent = '计划发布';
        } else {
            submitBtn.classList.remove('btn-outline-primary');
            submitBtn.classList.add('btn-success');
            submitBtnText.textContent = '立即发布';
        }
    }

    modeImmediate.addEventListener('change', updateModeUI);
    modeScheduled.addEventListener('change', updateModeUI);
    updateModeUI();

    document.getElementById('post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!requireLogin()) return;
        
        const title = document.getElementById('title').value.trim();
        const author = document.getElementById('author').value.trim();
        const content = document.getElementById('content').value.trim();
        const alertBox = document.getElementById('alert-box');

        const publishMode = modeScheduled.checked ? 'scheduled' : 'immediate';
        let scheduledAt = null;

        if (publishMode === 'scheduled') {
            const validation = validateFutureTime(scheduledInput.value);
            if (!validation.valid) {
                alertBox.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle-fill"></i> ${validation.message}</div>`;
                return;
            }
            const selectedDate = new Date(scheduledInput.value);
            const pad = (n) => n < 10 ? '0' + n : n;
            scheduledAt = selectedDate.getFullYear() + '-' +
                          pad(selectedDate.getMonth() + 1) + '-' +
                          pad(selectedDate.getDate()) + ' ' +
                          pad(selectedDate.getHours()) + ':' +
                          pad(selectedDate.getMinutes()) + ':' +
                          pad(selectedDate.getSeconds());
        }

        try {
            const data = await fetchApi('/posts.php', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    author,
                    content,
                    publish_mode: publishMode,
                    scheduled_at: scheduledAt
                })
            });

            if (data.points_transaction && data.points_transaction.points_change) {
                showPointsToast(data.points_transaction.points_change, '发帖');
            }
            
            let successMsg = data.message || '发布成功！';
            if (scheduledAt) {
                successMsg += `，计划于 <b>${scheduledAt}</b> 自动发布`;
            }
            if (data.mentioned_users && data.mentioned_users.length > 0) {
                const mentionedNames = data.mentioned_users.map(u => '@' + u.nickname).join('、');
                successMsg += `<br>已提及 ${mentionedNames}`;
            }

            alertBox.innerHTML = `<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i> ${successMsg}</div>`;

            setTimeout(() => {
                if (data.status === 'scheduled') {
                    window.location.href = '/';
                } else {
                    window.location.href = `/post.html?id=${data.id}`;
                }
            }, scheduledAt ? 2000 : 1200);
        } catch (error) {
            alertBox.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i> ${error.message}</div>`;
        }
    });
}

initPostForm();
