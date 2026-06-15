import { fetchApi, formatDate } from './config.js';
import { renderHeader, requireLogin, getCurrentUser } from './header.js';
import { renderLevelBadge, getActionIcon, escapeHtml } from './level_badge.js';

let currentPage = 1;
let totalPages = 1;
let pointsOverview = null;
let levelsData = [];
let rulesData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await renderHeader('points');
    if (!requireLogin()) return;

    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container points-page-container py-4">
            <div id="pointsContent">
                <div class="d-flex justify-content-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadAllData();
});

async function loadAllData() {
    try {
        const [overview, levels, rules, transactions] = await Promise.all([
            fetchApi('/points.php?action=overview'),
            fetchApi('/points.php?action=levels'),
            fetchApi('/points.php?action=rules'),
            fetchApi(`/points.php?action=transactions&page=${currentPage}&per_page=20`)
        ]);

        pointsOverview = overview;
        levelsData = levels.levels || [];
        rulesData = rules.rules || [];

        renderPointsPage(overview, transactions);
    } catch (error) {
        document.getElementById('pointsContent').innerHTML = `
            <div class="alert alert-danger">加载失败: ${escapeHtml(error.message)}</div>
        `;
    }
}

function renderPointsPage(overview, transactions) {
    const app = document.getElementById('pointsContent');

    let html = renderOverviewCard(overview);
    html += renderLevelBadgesGrid(overview);
    html += renderRulesSection();
    html += renderTransactionsSection(transactions);

    app.innerHTML = html;

    bindPaginationEvents();
}

function renderOverviewCard(overview) {
    const currentLevel = overview.level_info || {};
    const nextLevel = overview.next_level_info;
    const isMax = overview.is_max_level;

    let progressHtml = '';
    if (isMax) {
        progressHtml = `
            <div class="level-progress-section">
                <div class="max-level-banner">
                    <i class="bi bi-trophy-fill"></i>
                    <span>恭喜！已达到最高等级</span>
                </div>
            </div>
        `;
    } else {
        const currentMin = currentLevel.min_points || 0;
        const nextMin = nextLevel.min_points;
        const totalRange = nextMin - currentMin;
        const currentProgress = overview.total_points - currentMin;
        const progressPercent = Math.min(100, Math.max(0, (currentProgress / totalRange) * 100));

        progressHtml = `
            <div class="level-progress-section">
                <div class="next-level-info">
                    <span class="next-level-name">
                        距离 <strong>${escapeHtml(nextLevel.level_name)}</strong> 还需
                    </span>
                    <span class="points-needed">${overview.points_to_next_level} 分</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
                </div>
                <div class="next-level-info mt-2" style="opacity: 0.7;">
                    <span>${overview.total_points} 分</span>
                    <span>${nextMin} 分</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="points-overview-card">
            <div class="row align-items-center">
                <div class="col-md-6">
                    <div class="points-label">我的积分</div>
                    <div class="points-display">${overview.total_points.toLocaleString()}</div>
                    <div class="current-level-info">
                        <div class="current-level-badge">
                            <span class="level-badge-icon">${currentLevel.badge_icon || '🌱'}</span>
                            <div>
                                <div class="current-level-text">${escapeHtml(currentLevel.level_name || 'Lv1 新手')}</div>
                                <div style="font-size: 0.75rem; opacity: 0.8;">累计积分 ${overview.total_points}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    ${progressHtml}
                </div>
            </div>
        </div>
    `;
}

function renderLevelBadgesGrid(overview) {
    let html = `
        <div class="level-badges-grid">
    `;

    levelsData.forEach(badge => {
        const achieved = overview.total_points >= badge.min_points;
        const statusClass = achieved ? 'achieved' : 'locked';
        const statusText = achieved ? '已达成' : `需 ${badge.min_points} 分`;

        html += `
            <div class="level-badge-card ${statusClass}">
                <div class="badge-icon-large">${badge.badge_icon || '🌱'}</div>
                <div class="badge-name">${escapeHtml(badge.level_name)}</div>
                <div class="badge-points">${badge.min_points} 分</div>
                <div class="badge-status">${statusText}</div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

function renderRulesSection() {
    const rules = rulesData.length > 0 ? rulesData : [
        { action_type: 'create_post', action_name: '发布帖子', points: 10, daily_limit: 10, description: '每发布一篇帖子获得积分' },
        { action_type: 'create_comment', action_name: '评论他人', points: 2, daily_limit: 50, description: '每评论一篇他人帖子获得积分' },
        { action_type: 'receive_comment', action_name: '帖子被评论', points: 5, daily_limit: 0, description: '自己的帖子收到他人评论时获得积分' }
    ];

    let html = `
        <div class="rules-section">
            <h5 class="rules-title"><i class="bi bi-info-circle me-2"></i>积分规则说明</h5>
    `;

    rules.forEach(rule => {
        const icon = getActionIcon(rule.action_type);
        const dailyText = rule.daily_limit > 0 ? `（每日上限 ${rule.daily_limit} 次）` : '';

        html += `
            <div class="rule-item">
                <div class="rule-info">
                    <div class="rule-icon transaction-icon ${rule.action_type}">${icon}</div>
                    <div>
                        <div class="rule-name">${escapeHtml(rule.action_name)}</div>
                        <div class="rule-desc">${escapeHtml(rule.description || '')}${dailyText}</div>
                    </div>
                </div>
                <div class="rule-points">+${rule.points}</div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

function renderTransactionsSection(data) {
    const { transactions, pagination } = data;
    totalPages = pagination.total_pages;

    let html = `
        <div class="transactions-section">
            <div class="transactions-header">
                <h5 class="transactions-title">
                    <i class="bi bi-journal-text me-2"></i>积分明细
                    <span class="text-muted fw-normal" style="font-size: 0.875rem;">（共 ${pagination.total} 条）</span>
                </h5>
            </div>
    `;

    if (transactions.length === 0) {
        html += `
            <div class="empty-transactions">
                <div class="empty-transactions-icon">📋</div>
                <p class="mb-0">暂无积分记录</p>
                <p class="mb-0" style="font-size: 0.875rem;">快去发帖、评论赚取第一笔积分吧！</p>
            </div>
        `;
    } else {
        transactions.forEach(tx => {
            const icon = getActionIcon(tx.action_type);
            const isNegative = tx.points_change < 0;
            const sign = isNegative ? '' : '+';

            html += `
                <div class="transaction-item">
                    <div class="transaction-left">
                        <div class="transaction-icon ${tx.action_type}">${icon}</div>
                        <div class="transaction-info">
                            <p class="transaction-description">${escapeHtml(tx.description)}</p>
                            <div class="transaction-time">${formatDate(tx.created_at)}</div>
                        </div>
                    </div>
                    <div class="transaction-right">
                        <div class="transaction-points ${isNegative ? 'negative' : ''}">${sign}${tx.points_change}</div>
                        <div class="transaction-balance">余额 ${tx.balance_after}</div>
                    </div>
                </div>
            `;
        });
    }

    if (totalPages > 1) {
        html += `<div class="pagination-container">`;

        html += `<button class="pagination-btn" id="prevPageBtn" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left"></i> 上一页
        </button>`;

        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        startPage = Math.max(1, endPage - maxVisible + 1);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        html += `<button class="pagination-btn" id="nextPageBtn" ${currentPage >= totalPages ? 'disabled' : ''}>
            下一页 <i class="bi bi-chevron-right"></i>
        </button>`;

        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function bindPaginationEvents() {
    const prevBtn = document.getElementById('prevPageBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', async () => {
            if (currentPage > 1) {
                currentPage--;
                await loadTransactions();
            }
        });
    }

    const nextBtn = document.getElementById('nextPageBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            if (currentPage < totalPages) {
                currentPage++;
                await loadTransactions();
            }
        });
    }

    document.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const page = parseInt(btn.dataset.page);
            if (page && page !== currentPage) {
                currentPage = page;
                await loadTransactions();
            }
        });
    });
}

async function loadTransactions() {
    try {
        const result = await fetchApi(`/points.php?action=transactions&page=${currentPage}&per_page=20`);
        const overviewHtml = renderOverviewCard(pointsOverview);
        const badgesHtml = renderLevelBadgesGrid(pointsOverview);
        const rulesHtml = renderRulesSection();
        const txHtml = renderTransactionsSection(result);

        document.getElementById('pointsContent').innerHTML = overviewHtml + badgesHtml + rulesHtml + txHtml;
        bindPaginationEvents();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        alert('加载积分明细失败: ' + error.message);
    }
}
