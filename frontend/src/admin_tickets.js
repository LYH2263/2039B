import { fetchApi, formatDate } from './config.js';
import { renderAdminHeader } from './admin_header.js';
import './styles.css';

renderAdminHeader('tickets');

const app = document.getElementById('app');

const STATUS_MAP = {
    pending: { label: '待处理', class: 'bg-warning text-dark', icon: 'bi-clock', next: ['processing', 'closed'] },
    processing: { label: '处理中', class: 'bg-info', icon: 'bi-gear', next: ['resolved', 'closed'] },
    resolved: { label: '已解决', class: 'bg-success', icon: 'bi-check-circle', next: ['closed'] },
    closed: { label: '已关闭', class: 'bg-secondary', icon: 'bi-x-circle', next: [] }
};

const TYPE_MAP = {
    bug: { label: '缺陷反馈', icon: 'bi-bug' },
    feature: { label: '功能建议', icon: 'bi-lightbulb' },
    account: { label: '账号问题', icon: 'bi-person-x' },
    other: { label: '其他', icon: 'bi-chat-left-text' }
};

let currentFilter = '';
let currentTicketDetail = null;

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadTickets(status = '') {
    currentFilter = status;
    try {
        const endpoint = status ? `/admin/tickets.php?status=${status}` : '/admin/tickets.php';
        const data = await fetchApi(endpoint);
        renderTickets(data);
    } catch (error) {
        app.innerHTML = `<div class="container mt-4"><div class="alert alert-danger shadow-sm">${escapeHtml(error.message)}</div></div>`;
    }
}

function renderTickets(data) {
    const { tickets, status_stats, total } = data;

    const statsCards = [
        { key: '', label: '全部', count: total, color: 'bg-info-subtle', icon: 'bi-list-ul', iconColor: 'text-info' },
        { key: 'pending', label: '待处理', count: status_stats.pending || 0, color: 'bg-warning-subtle', icon: 'bi-clock', iconColor: 'text-warning' },
        { key: 'processing', label: '处理中', count: status_stats.processing || 0, color: 'bg-primary-subtle', icon: 'bi-gear', iconColor: 'text-primary' },
        { key: 'resolved', label: '已解决', count: status_stats.resolved || 0, color: 'bg-success-subtle', icon: 'bi-check-circle', iconColor: 'text-success' },
        { key: 'closed', label: '已关闭', count: status_stats.closed || 0, color: 'bg-secondary-subtle', icon: 'bi-x-circle', iconColor: 'text-secondary' }
    ];

    const statsHtml = statsCards.map(s => `
        <div class="col-md">
            <div class="card border-0 shadow-sm ${s.color} stat-card" data-status="${s.key}" style="cursor: pointer; transition: all 0.2s; ${currentFilter === s.key ? 'ring: 2px solid var(--primary-color, #4f46e5); box-shadow: 0 0 0 2px var(--primary-color, #4f46e5);' : ''}">
                <div class="card-body py-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="text-muted small">${s.label}</div>
                            <div class="fw-bold fs-4 ${s.iconColor}">${s.count}</div>
                        </div>
                        <i class="bi ${s.icon} fs-2 ${s.iconColor} opacity-50"></i>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    let tableRows = '';
    if (tickets.length === 0) {
        tableRows = `<tr><td colspan="7" class="text-center py-4 text-muted">暂无工单</td></tr>`;
    } else {
        tickets.forEach(t => {
            const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.pending;
            const typeInfo = TYPE_MAP[t.type] || { label: t.type, icon: 'bi-question-circle' };

            let actionBtns = `<button class="btn btn-sm btn-outline-primary me-1 mb-1 view-btn" data-id="${t.id}"><i class="bi bi-eye"></i> 查看</button>`;

            if (t.status !== 'closed') {
                statusInfo.next.forEach(nextStatus => {
                    const nextInfo = STATUS_MAP[nextStatus];
                    actionBtns += `<button class="btn btn-sm btn-outline-${nextStatus === 'closed' ? 'secondary' : 'success'} me-1 mb-1 change-status-btn" data-id="${t.id}" data-status="${nextStatus}"><i class="bi ${nextInfo.icon}"></i> ${nextInfo.label}</button>`;
                });
            }

            tableRows += `
            <tr>
                <td class="ps-4"><span class="font-monospace small">${escapeHtml(t.ticket_no)}</span></td>
                <td>
                    <div class="fw-medium">${escapeHtml(t.title)}</div>
                    <div class="small text-muted"><i class="bi ${typeInfo.icon} me-1"></i>${typeInfo.label}</div>
                </td>
                <td>${escapeHtml(t.nickname)}</td>
                <td><span class="badge ${statusInfo.class}"><i class="bi ${statusInfo.icon} me-1"></i>${statusInfo.label}</span></td>
                <td><span class="badge bg-light text-dark border">${t.reply_count || 0}</span></td>
                <td class="small text-muted">${formatDate(t.created_at)}</td>
                <td class="text-end pe-4"><div class="d-flex justify-content-end flex-wrap">${actionBtns}</div></td>
            </tr>`;
        });
    }

    app.innerHTML = `
    <div class="container fade-in py-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h3 class="fw-bold text-dark mb-0">工单管理</h3>
                <p class="text-muted small mb-0">查看和处理用户反馈工单</p>
            </div>
            <a href="/admin/index.html" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left"></i> 返回仪表盘
            </a>
        </div>

        <div class="row g-3 mb-4">${statsHtml}</div>

        <div class="card shadow-sm border-0">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-4">工单号</th>
                                <th>标题/类型</th>
                                <th>提交者</th>
                                <th>状态</th>
                                <th>回复数</th>
                                <th>提交时间</th>
                                <th class="text-end pe-4">操作</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>`;

    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            loadTickets(card.dataset.status);
        });
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            loadTicketDetail(parseInt(btn.dataset.id));
        });
    });

    document.querySelectorAll('.change-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id);
            const newStatus = btn.dataset.status;
            const statusInfo = STATUS_MAP[newStatus];
            if (confirm(`确定将工单状态变更为「${statusInfo.label}」吗？`)) {
                try {
                    await fetchApi('/admin/tickets.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'update_status', ticket_id: id, status: newStatus })
                    });
                    loadTickets(currentFilter);
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    });
}

async function loadTicketDetail(ticketId) {
    try {
        const data = await fetchApi(`/admin/tickets.php?id=${ticketId}`);
        currentTicketDetail = data.ticket;
        renderTicketDetail(data.ticket);
    } catch (error) {
        alert(error.message);
    }
}

function renderTicketDetail(ticket) {
    const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.pending;
    const typeInfo = TYPE_MAP[ticket.type] || { label: ticket.type, icon: 'bi-question-circle' };

    const repliesHtml = ticket.replies && ticket.replies.length > 0
        ? ticket.replies.map(r => {
            const isSystem = r.reply_type === 'system';
            return `
            <div class="d-flex ${isSystem ? 'justify-content-center' : 'justify-content-start'} mb-3">
                <div style="max-width: 85%;">
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
        : '<div class="text-center text-muted py-3"><i class="bi bi-hourglass me-1"></i>暂无回复</div>';

    const nextStatusBtns = statusInfo.next.map(ns => {
        const nInfo = STATUS_MAP[ns];
        return `<button class="btn btn-sm btn-outline-${ns === 'closed' ? 'secondary' : 'success'} me-2 change-detail-status-btn" data-status="${ns}"><i class="bi ${nInfo.icon} me-1"></i>变更为${nInfo.label}</button>`;
    }).join('');

    app.innerHTML = `
    <div class="container fade-in py-4" style="max-width: 900px;">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h3 class="fw-bold text-dark mb-0">工单详情</h3>
                <p class="text-muted small mb-0">${escapeHtml(ticket.ticket_no)}</p>
            </div>
            <button class="btn btn-outline-secondary" id="backToList">
                <i class="bi bi-arrow-left"></i> 返回列表
            </button>
        </div>

        <div class="card shadow-sm border-0 mb-4">
            <div class="card-body p-4">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h5 class="fw-bold mb-1">${escapeHtml(ticket.title)}</h5>
                        <div class="small text-muted">
                            <i class="bi ${typeInfo.icon} me-1"></i>${typeInfo.label} · 
                            提交者: ${escapeHtml(ticket.nickname)} · 
                            联系方式: ${escapeHtml(ticket.contact)} · 
                            ${formatDate(ticket.created_at)}
                        </div>
                    </div>
                    <span class="badge ${statusInfo.class} fs-6"><i class="bi ${statusInfo.icon} me-1"></i>${statusInfo.label}</span>
                </div>
                <div class="bg-light rounded p-3 mb-3 small">${escapeHtml(ticket.description)}</div>
                ${ticket.status !== 'closed' ? `<div class="d-flex align-items-center"><span class="text-muted small me-3">变更状态：</span>${nextStatusBtns}</div>` : '<div class="text-muted small"><i class="bi bi-lock me-1"></i>工单已关闭</div>'}
            </div>
        </div>

        <div class="card shadow-sm border-0 mb-4">
            <div class="card-body p-4">
                <h6 class="fw-bold mb-3"><i class="bi bi-chat-dots me-1"></i>回复记录</h6>
                <div class="ps-2 mb-4">${repliesHtml}</div>

                ${ticket.status !== 'closed' ? `
                <hr />
                <h6 class="fw-bold mb-3"><i class="bi bi-reply me-1"></i>添加回复</h6>
                <textarea class="form-control mb-2" id="replyContent" rows="3" maxlength="5000" placeholder="输入回复内容..."></textarea>
                <div class="form-text text-end mb-2"><span id="replyCount">0</span>/5000</div>
                <button class="btn btn-primary" id="replyBtn"><i class="bi bi-send me-1"></i>发送回复</button>
                ` : ''}
            </div>
        </div>
    </div>`;

    document.getElementById('backToList').addEventListener('click', () => {
        loadTickets(currentFilter);
    });

    document.querySelectorAll('.change-detail-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newStatus = btn.dataset.status;
            const nInfo = STATUS_MAP[newStatus];
            if (confirm(`确定将工单状态变更为「${nInfo.label}」吗？`)) {
                try {
                    await fetchApi('/admin/tickets.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'update_status', ticket_id: ticket.id, status: newStatus })
                    });
                    loadTicketDetail(ticket.id);
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    });

    const replyContent = document.getElementById('replyContent');
    const replyBtn = document.getElementById('replyBtn');

    if (replyContent && replyBtn) {
        replyContent.addEventListener('input', () => {
            document.getElementById('replyCount').textContent = replyContent.value.length;
        });

        replyBtn.addEventListener('click', async () => {
            const content = replyContent.value.trim();
            if (!content) {
                alert('回复内容不能为空');
                return;
            }
            if (content.length > 5000) {
                alert('回复内容不能超过5000个字符');
                return;
            }
            replyBtn.disabled = true;
            replyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>发送中...';
            try {
                await fetchApi('/admin/tickets.php', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'reply', ticket_id: ticket.id, content })
                });
                loadTicketDetail(ticket.id);
            } catch (error) {
                alert(error.message);
                replyBtn.disabled = false;
                replyBtn.innerHTML = '<i class="bi bi-send me-1"></i>发送回复';
            }
        });
    }
}

loadTickets();
