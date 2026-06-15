import { fetchApi } from './config.js';

const LEVEL_ICONS = {
    1: '🌱',
    2: '🌿',
    3: '🌳',
    4: '🏆',
    5: '👑'
};

const LEVEL_COLORS = {
    1: '#9CA3AF',
    2: '#10B981',
    3: '#3B82F6',
    4: '#F59E0B',
    5: '#EF4444'
};

const ACTION_ICONS = {
    create_post: '📝',
    create_comment: '💬',
    receive_comment: '⭐'
};

export function renderLevelBadge(levelInfo, size = 'md') {
    if (!levelInfo) return '';

    const level = levelInfo.level || 1;
    const levelName = levelInfo.level_name || `Lv${level}`;
    const icon = levelInfo.badge_icon || LEVEL_ICONS[level] || '🌱';
    const color = levelInfo.badge_color || LEVEL_COLORS[level] || '#9CA3AF';

    const sizeClass = size === 'sm' ? 'level-badge-sm' : size === 'lg' ? 'level-badge-lg' : '';

    return `
        <span class="level-badge ${sizeClass}" style="background-color: ${color};" title="${levelName}">
            <span class="level-badge-icon">${icon}</span>
            <span>${levelName}</span>
        </span>
    `;
}

export function renderAuthorNameWithBadge(name, levelInfo, size = 'sm') {
    const badgeHtml = renderLevelBadge(levelInfo, size);
    return `
        <span class="author-name-with-badge">
            <span>${escapeHtml(name)}</span>
            ${badgeHtml}
        </span>
    `;
}

export function getActionIcon(actionType) {
    return ACTION_ICONS[actionType] || '✨';
}

export async function loadUserBadges(userIds) {
    if (!userIds || userIds.length === 0) return {};

    const uniqueIds = [...new Set(userIds.filter(id => id && id > 0))];
    if (uniqueIds.length === 0) return {};

    try {
        const data = await fetchApi(`/points.php?action=badges&user_ids=${uniqueIds.join(',')}`);
        return data.badges || {};
    } catch (e) {
        console.warn('加载用户等级徽章失败', e);
        return {};
    }
}

export function showPointsToast(points, description = '') {
    const existingToast = document.querySelector('.points-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'points-toast';
    toast.innerHTML = `
        <span>🎉</span>
        <span>${description || '积分'} +${points}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

export function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
