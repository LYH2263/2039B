import { fetchApi } from './config.js';
import { getCurrentUser, requireLogin } from './header.js';
import { renderLevelBadge, escapeHtml } from './level_badge.js';

export async function toggleFollow(targetUserId, { onSuccess, onError } = {}) {
    if (!requireLogin()) return;

    const currentUser = getCurrentUser();
    if (currentUser && Number(currentUser.id) === Number(targetUserId)) {
        if (onError) onError('不能关注自己');
        return false;
    }

    try {
        const statusData = await fetchApi(`/follow.php?action=status&user_id=${targetUserId}`);
        const action = statusData.is_following ? 'unfollow' : 'follow';

        const result = await fetchApi(`/follow.php?action=${action}`, {
            method: 'POST',
            body: JSON.stringify({
                user_id: Number(targetUserId),
                action: action
            })
        });

        if (onSuccess) onSuccess(result);
        return result;
    } catch (e) {
        if (onError) onError(e.message);
        return false;
    }
}

export async function loadFollowStatus(targetUserId) {
    try {
        const data = await fetchApi(`/follow.php?action=status&user_id=${targetUserId}`);
        return data;
    } catch (e) {
        console.warn('加载关注状态失败', e);
        return { is_following: false, is_self: false, stats: { followers: 0, followings: 0 } };
    }
}

export function renderFollowButton(targetUserId, options = {}) {
    const {
        isFollowing = false,
        isSelf = false,
        size = 'sm',
        showIcon = true,
        extraClass = '',
        stats = null
    } = options;

    const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

    if (isSelf) {
        return `<span class="badge bg-secondary ${sizeClass}" title="这是你自己">自己</span>`;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
        return `<button type="button"
            class="btn btn-outline-primary ${sizeClass} follow-btn ${extraClass}"
            data-user-id="${targetUserId}"
            data-action="login-prompt">
            ${showIcon ? '<i class="bi bi-plus-circle me-1"></i>' : ''}关注
        </button>`;
    }

    if (isFollowing) {
        return `<button type="button"
            class="btn btn-secondary ${sizeClass} follow-btn ${extraClass}"
            data-user-id="${targetUserId}"
            data-action="unfollow"
            data-is-following="1">
            ${showIcon ? '<i class="bi bi-person-check-fill me-1"></i>' : ''}已关注
        </button>`;
    } else {
        return `<button type="button"
            class="btn btn-outline-primary ${sizeClass} follow-btn ${extraClass}"
            data-user-id="${targetUserId}"
            data-action="follow"
            data-is-following="0">
            ${showIcon ? '<i class="bi bi-plus-circle me-1"></i>' : ''}关注
        </button>`;
    }
}

export function renderFollowStats(stats, { withLabels = true, separator = ' · ' } = {}) {
    if (!stats) return '';
    const followers = stats.followers || 0;
    const followings = stats.followings || 0;

    if (withLabels) {
        return `<span class="follow-stats">
            <span title="粉丝数"><strong>${followers}</strong> 粉丝</span>${separator}
            <span title="关注数"><strong>${followings}</strong> 关注</span>
        </span>`;
    }
    return `<span class="follow-stats">
        <span title="粉丝数"><strong>${followers}</strong></span>${separator}
        <span title="关注数"><strong>${followings}</strong></span>
    </span>`;
}

export function renderAuthorBlock(authorInfo, options = {}) {
    const {
        user_id,
        nickname,
        author_level = null,
        follow_stats = null,
        show_follow_button = true,
        is_following = false,
        is_self = false
    } = authorInfo;

    const { avatarSize = 40 } = options;

    const badgeHtml = renderLevelBadge(author_level, 'sm');
    const statsHtml = renderFollowStats(follow_stats);
    const followBtnHtml = show_follow_button && user_id ? renderFollowButton(user_id, {
        isFollowing: is_following,
        isSelf: is_self,
        size: 'sm'
    }) : '';

    const initial = nickname ? escapeHtml(nickname.substring(0, 1)) : 'U';

    return `<div class="d-flex align-items-center gap-3 author-block flex-wrap" data-author-user-id="${user_id || ''}">
        <div class="author-avatar rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0"
             style="width:${avatarSize}px;height:${avatarSize}px;font-size:${Math.floor(avatarSize * 0.45)}px;font-weight:600;">
            ${initial}
        </div>
        <div class="author-info flex-grow-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <strong class="author-nickname m-0">${escapeHtml(nickname || '匿名用户')}</strong>
                ${badgeHtml}
            </div>
            ${statsHtml ? `<div class="text-muted small mt-1">${statsHtml}</div>` : ''}
        </div>
        <div class="author-actions flex-shrink-0">
            ${followBtnHtml}
        </div>
    </div>`;
}

export function bindFollowButtons(container = document, { onStatusChanged } = {}) {
    const buttons = container.querySelectorAll('.follow-btn');
    buttons.forEach(btn => {
        if (btn.dataset.followBound === '1') return;
        btn.dataset.followBound = '1';

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const userId = btn.dataset.userId;
            const action = btn.dataset.action;

            if (action === 'login-prompt') {
                requireLogin();
                return;
            }

            const originalText = btn.innerHTML;
            const originalDisabled = btn.disabled;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>处理中...';

            const result = await toggleFollow(userId, {
                onSuccess: (data) => {
                    updateFollowButton(btn, data.is_following);
                    if (onStatusChanged) onStatusChanged(userId, data);
                },
                onError: (msg) => {
                    alert(msg);
                }
            });

            if (!result) {
                btn.disabled = originalDisabled;
                btn.innerHTML = originalText;
            }
        });
    });
}

export function updateFollowButton(btn, isFollowing) {
    if (!btn) return;
    btn.disabled = false;

    const userId = btn.dataset.userId;
    const hasIcon = btn.innerHTML.includes('<i class="bi bi') || btn.innerHTML.includes('bi bi');
    const sizeClass = btn.classList.contains('btn-sm') ? 'btn-sm' : btn.classList.contains('btn-lg') ? 'btn-lg' : '';

    const iconFollow = hasIcon ? '<i class="bi bi-plus-circle me-1"></i>' : '';
    const iconFollowing = hasIcon ? '<i class="bi bi-person-check-fill me-1"></i>' : '';

    if (isFollowing) {
        btn.className = `btn btn-secondary follow-btn ${sizeClass}`;
        btn.dataset.action = 'unfollow';
        btn.dataset.isFollowing = '1';
        btn.innerHTML = `${iconFollowing}已关注`;
    } else {
        btn.className = `btn btn-outline-primary follow-btn ${sizeClass}`;
        btn.dataset.action = 'follow';
        btn.dataset.isFollowing = '0';
        btn.innerHTML = `${iconFollow}关注`;
    }
}
