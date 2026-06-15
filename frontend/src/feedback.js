import { fetchApi, formatDate } from './config.js';
import { renderHeader } from './header.js';
import './styles.css';

renderHeader('feedback');

const app = document.getElementById('app');

const TYPE_OPTIONS = [
    { value: 'bug', label: '缺陷反馈', icon: 'bi-bug', desc: '报告网站功能异常或错误' },
    { value: 'feature', label: '功能建议', icon: 'bi-lightbulb', desc: '提出新功能或改进建议' },
    { value: 'account', label: '账号问题', icon: 'bi-person-x', desc: '登录、注册等账号相关问题' },
    { value: 'other', label: '其他', icon: 'bi-chat-left-text', desc: '其他类型的反馈' }
];

const STATUS_MAP = {
    pending: { label: '待处理', class: 'bg-warning text-dark', icon: 'bi-clock' },
    processing: { label: '处理中', class: 'bg-info', icon: 'bi-gear' },
    resolved: { label: '已解决', class: 'bg-success', icon: 'bi-check-circle' },
    closed: { label: '已关闭', class: 'bg-secondary', icon: 'bi-x-circle' }
};

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderForm() {
    const typeCards = TYPE_OPTIONS.map(t => `
        <div class="col-6 col-md-3">
            <div class="card border h-100 text-center p-3 type-card" data-type="${t.value}" style="cursor: pointer; transition: all 0.2s;">
                <i class="bi ${t.icon} fs-2 mb-2"></i>
                <div class="fw-medium small">${t.label}</div>
                <div class="text-muted" style="font-size: 0.75rem;">${t.desc}</div>
            </div>
        </div>
    `).join('');

    app.innerHTML = `
    <div class="fade-in">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h3 class="fw-bold text-dark mb-0"><i class="bi bi-envelope-paper me-2"></i>意见反馈</h3>
                <p class="text-muted small mb-0">提交工单，我们会尽快处理您的反馈</p>
            </div>
            <button class="btn btn-outline-primary" id="queryToggleBtn">
                <i class="bi bi-search me-1"></i>查询工单
            </button>
        </div>

        <div id="queryPanel" class="d-none mb-4">
            <div class="card shadow-sm border-0">
                <div class="card-body p-4">
                    <h6 class="fw-bold mb-3"><i class="bi bi-search me-1"></i>凭工单号查询进度</h6>
                    <div class="input-group">
                        <input type="text" class="form-control" id="queryTicketNo" placeholder="请输入工单号，如 TK-20260616-0001" />
                        <button class="btn btn-primary" id="queryBtn">查询</button>
                    </div>
                    <div id="queryResult" class="mt-3"></div>
                </div>
            </div>
        </div>

        <div class="card shadow-sm border-0 mb-4">
            <div class="card-body p-4">
                <h6 class="fw-bold mb-3">选择反馈类型</h6>
                <div class="row g-3 mb-4" id="typeSelector">
                    ${typeCards}
                </div>
                <input type="hidden" id="selectedType" value="" />

                <div class="mb-3">
                    <label class="form-label fw-medium">标题 <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="ticketTitle" maxlength="200" placeholder="简要描述您的问题（不超过200字）" />
                    <div class="form-text text-end"><span id="titleCount">0</span>/200</div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-medium">问题描述 <span class="text-danger">*</span></label>
                    <textarea class="form-control" id="ticketDesc" rows="5" maxlength="5000" placeholder="请详细描述您遇到的问题或建议，包括操作步骤、预期结果和实际结果等"></textarea>
                    <div class="form-text text-end"><span id="descCount">0</span>/5000</div>
                </div>

                <div class="mb-3">
                    <label class="form-label fw-medium">联系方式 <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="ticketContact" maxlength="200" placeholder="邮箱或QQ，方便我们联系您" />
                </div>

                <div class="d-grid">
                    <button class="btn btn-primary btn-lg" id="submitBtn" disabled>
                        <i class="bi bi-send me-1"></i>提交工单
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.querySelectorAll('.type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.type-card').forEach(c => {
                c.classList.remove('border-primary', 'shadow');
                c.style.borderColor = '';
            });
            card.classList.add('border-primary', 'shadow');
            card.style.borderColor = 'var(--primary-color, #4f46e5)';
            document.getElementById('selectedType').value = card.dataset.type;
            validateForm();
        });
    });

    const titleInput = document.getElementById('ticketTitle');
    const descInput = document.getElementById('ticketDesc');

    titleInput.addEventListener('input', () => {
        document.getElementById('titleCount').textContent = titleInput.value.length;
        validateForm();
    });

    descInput.addEventListener('input', () => {
        document.getElementById('descCount').textContent = descInput.value.length;
        validateForm();
    });

    document.getElementById('ticketContact').addEventListener('input', validateForm);

    document.getElementById('submitBtn').addEventListener('click', handleSubmit);

    document.getElementById('queryToggleBtn').addEventListener('click', () => {
        const panel = document.getElementById('queryPanel');
        panel.classList.toggle('d-none');
    });

    document.getElementById('queryBtn').addEventListener('click', handleQuery);
    document.getElementById('queryTicketNo').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleQuery();
    });
}

function validateForm() {
    const type = document.getElementById('selectedType').value;
    const title = document.getElementById('ticketTitle').value.trim();
    const desc = document.getElementById('ticketDesc').value.trim();
    const contact = document.getElementById('ticketContact').value.trim();

    const valid = type && title && desc && contact;
    document.getElementById('submitBtn').disabled = !valid;
    return valid;
}

async function handleSubmit() {
    if (!validateForm()) return;

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...';

    try {
        const data = await fetchApi('/ticket_submit.php', {
            method: 'POST',
            body: JSON.stringify({
                type: document.getElementById('selectedType').value,
                title: document.getElementById('ticketTitle').value.trim(),
                description: document.getElementById('ticketDesc').value.trim(),
                contact: document.getElementById('ticketContact').value.trim()
            })
        });

        renderSuccess(data.ticket_no);
    } catch (error) {
        alert(error.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send me-1"></i>提交工单';
    }
}

function renderSuccess(ticketNo) {
    app.innerHTML = `
    <div class="fade-in text-center py-5">
        <div class="mb-4">
            <div class="rounded-circle bg-success text-white d-inline-flex align-items-center justify-content-center" style="width: 80px; height: 80px;">
                <i class="bi bi-check-lg fs-1"></i>
            </div>
        </div>
        <h3 class="fw-bold text-dark mb-2">工单提交成功！</h3>
        <p class="text-muted mb-4">我们已收到您的反馈，将尽快处理。</p>
        <div class="card shadow-sm border-0 d-inline-block px-4 py-3 mb-4">
            <div class="text-muted small mb-1">您的工单号</div>
            <div class="fs-4 fw-bold text-primary font-monospace">${escapeHtml(ticketNo)}</div>
            <div class="text-muted small mt-1">请保存此工单号，用于查询处理进度</div>
        </div>
        <div class="d-flex justify-content-center gap-3">
            <button class="btn btn-primary" id="queryNewBtn">
                <i class="bi bi-search me-1"></i>查询此工单
            </button>
            <button class="btn btn-outline-primary" id="newTicketBtn">
                <i class="bi bi-plus-circle me-1"></i>继续反馈
            </button>
            <a href="/" class="btn btn-outline-secondary">返回首页</a>
        </div>
    </div>
    `;

    document.getElementById('queryNewBtn').addEventListener('click', () => {
        doQuery(ticketNo);
    });
    document.getElementById('newTicketBtn').addEventListener('click', renderForm);
}

async function handleQuery() {
    const ticketNo = document.getElementById('queryTicketNo').value.trim();
    if (!ticketNo) {
        alert('请输入工单号');
        return;
    }
    await doQuery(ticketNo);
}

async function doQuery(ticketNo) {
    const resultDiv = document.getElementById('queryResult');
    if (resultDiv) {
        resultDiv.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div> 查询中...</div>';
    }

    try {
        const data = await fetchApi(`/ticket_query.php?ticket_no=${encodeURIComponent(ticketNo)}`);
        renderQueryResult(data.ticket);
    } catch (error) {
        const target = document.getElementById('queryResult');
        if (target) {
            target.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
        } else {
            app.innerHTML = `
            <div class="fade-in">
                <div class="card shadow-sm border-0 p-4 text-center">
                    <i class="bi bi-exclamation-circle fs-1 text-danger mb-3"></i>
                    <h5 class="text-danger">${escapeHtml(error.message)}</h5>
                    <div class="mt-3">
                        <button class="btn btn-primary" onclick="location.reload()">重新查询</button>
                    </div>
                </div>
            </div>`;
        }
    }
}

function renderQueryResult(ticket) {
    const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.pending;
    const typeInfo = TYPE_OPTIONS.find(t => t.value === ticket.type);
    const typeLabel = typeInfo ? typeInfo.label : ticket.type;

    const repliesHtml = ticket.replies && ticket.replies.length > 0
        ? ticket.replies.map(r => {
            const isSystem = r.reply_type === 'system';
            return `
            <div class="d-flex ${isSystem ? 'justify-content-center' : 'justify-content-start'} mb-3">
                <div class="${isSystem ? 'text-center' : ''}" style="max-width: 85%;">
                    ${isSystem
                        ? `<span class="badge bg-light text-muted border"><i class="bi bi-info-circle me-1"></i>${escapeHtml(r.content)} · ${formatDate(r.created_at)}</span>`
                        : `<div class="card border-0 shadow-sm">
                            <div class="card-header bg-primary text-white py-2 px-3 small">
                                <i class="bi bi-headset me-1"></i>${escapeHtml(r.replier_name)}
                                <span class="float-end">${formatDate(r.created_at)}</span>
                            </div>
                            <div class="card-body py-2 px-3 small">${escapeHtml(r.content)}</div>
                        </div>`
                    }
                </div>
            </div>`;
        }).join('')
        : '<div class="text-center text-muted py-3"><i class="bi bi-hourglass me-1"></i>暂无回复，请耐心等待</div>';

    const content = `
    <div class="card shadow-sm border-0">
        <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 class="fw-bold mb-1">${escapeHtml(ticket.title)}</h5>
                    <div class="small text-muted">
                        <span class="font-monospace">${escapeHtml(ticket.ticket_no)}</span> · 
                        <i class="bi bi-tag me-1"></i>${typeLabel} · 
                        ${formatDate(ticket.created_at)}
                    </div>
                </div>
                <span class="badge ${statusInfo.class} fs-6"><i class="bi ${statusInfo.icon} me-1"></i>${statusInfo.label}</span>
            </div>
            <div class="bg-light rounded p-3 mb-4 small">${escapeHtml(ticket.description)}</div>

            <h6 class="fw-bold mb-3"><i class="bi bi-chat-dots me-1"></i>处理进度</h6>
            <div class="ps-2">${repliesHtml}</div>
        </div>
    </div>
    <div class="text-center mt-3">
        <button class="btn btn-outline-primary" onclick="location.reload()"><i class="bi bi-arrow-left me-1"></i>返回反馈页</button>
    </div>`;

    const resultDiv = document.getElementById('queryResult');
    if (resultDiv) {
        resultDiv.innerHTML = content;
    } else {
        app.innerHTML = `<div class="fade-in">${content}</div>`;
    }
}

renderForm();
