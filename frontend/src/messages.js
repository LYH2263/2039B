import { fetchApi, formatDate } from './config.js';
import { renderHeader, getCurrentUser, requireLogin, updateNavUnreadBadge } from './header.js';

let currentUser = null;
let conversations = [];
let currentConversation = null;
let messages = [];
let currentPage = 1;
let totalPages = 1;
let isLoadingMessages = false;

const PAGE_SIZE = 20;

export async function initMessagesPage() {
    await renderHeader('messages');
    currentUser = getCurrentUser();
    
    if (!currentUser) {
        requireLogin();
        return;
    }

    renderMessagesLayout();
    await loadConversations();
}

function renderMessagesLayout() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="card shadow-sm">
            <div class="row g-0">
                <div class="col-md-4 col-lg-3 border-end" style="min-height: 600px;">
                    <div class="p-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="bi bi-chat-dots me-2"></i>私信</h5>
                        <button class="btn btn-sm btn-primary" id="newMessageBtn" title="发起新私信">
                            <i class="bi bi-plus-lg"></i>
                        </button>
                    </div>
                    <div id="conversationList" class="conversation-list" style="height: 550px; overflow-y: auto;">
                        <div class="text-center py-4 text-muted">
                            <div class="spinner-border spinner-border-sm mb-2" role="status"></div>
                            <div>加载中...</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-8 col-lg-9">
                    <div id="chatArea" class="d-flex flex-column" style="height: 600px;">
                        <div id="emptyState" class="flex-grow-1 d-flex align-items-center justify-content-center text-muted">
                            <div class="text-center">
                                <i class="bi bi-chat-square-text" style="font-size: 4rem; opacity: 0.3;"></i>
                                <p class="mt-3">选择一个会话开始聊天</p>
                                <button class="btn btn-primary mt-2" id="startFirstMessageBtn">
                                    <i class="bi bi-plus-lg me-1"></i>发起新私信
                                </button>
                            </div>
                        </div>
                        <div id="chatContent" class="d-none flex-grow-1 d-flex flex-column">
                            <div id="chatHeader" class="p-3 border-bottom bg-light d-flex align-items-center">
                                <button class="btn btn-sm btn-outline-secondary me-3 d-md-none" id="backToList">
                                    <i class="bi bi-arrow-left"></i>
                                </button>
                                <div class="d-flex align-items-center">
                                    <div class="avatar-circle bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;">
                                        <span id="otherUserAvatar" class="fw-bold"></span>
                                    </div>
                                    <div class="ms-3">
                                        <h6 class="mb-0" id="otherUserName"></h6>
                                        <small class="text-muted" id="chatStatus"></small>
                                    </div>
                                </div>
                            </div>
                            <div id="messageList" class="flex-grow-1 p-3 overflow-y-auto" style="background-color: #f5f7fa;">
                                <div class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm" role="status"></div>
                                </div>
                            </div>
                            <div id="loadMoreBtn" class="text-center py-2 d-none">
                                <button class="btn btn-sm btn-outline-secondary" id="loadMore">
                                    加载更多消息
                                </button>
                            </div>
                            <div class="p-3 border-top bg-white">
                                <div class="input-group">
                                    <textarea class="form-control" id="messageInput" placeholder="输入消息内容..." rows="1" style="resize: none; max-height: 120px;"></textarea>
                                    <button class="btn btn-primary" id="sendBtn" type="button">
                                        <i class="bi bi-send me-1"></i>发送
                                    </button>
                                </div>
                                <div class="text-end mt-1">
                                    <small class="text-muted" id="charCount">0/5000</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="newMessageModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-person-plus me-2"></i>发起新私信</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">搜索用户</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="searchUserInput" placeholder="输入用户名或昵称搜索">
                                <button class="btn btn-outline-secondary" type="button" id="searchUserBtn">
                                    <i class="bi bi-search"></i>
                                </button>
                            </div>
                        </div>
                        <div id="searchResults" style="max-height: 300px; overflow-y: auto;">
                            <div class="text-center text-muted py-3">
                                输入关键词搜索用户
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keydown', handleInputKeydown);
    document.getElementById('messageInput').addEventListener('input', handleInputChange);
    document.getElementById('loadMore').addEventListener('click', loadMoreMessages);
    document.getElementById('backToList').addEventListener('click', showConversationList);
    document.getElementById('newMessageBtn').addEventListener('click', openNewMessageModal);
    document.getElementById('startFirstMessageBtn').addEventListener('click', openNewMessageModal);
    document.getElementById('searchUserBtn').addEventListener('click', searchUsers);
    document.getElementById('searchUserInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchUsers();
        }
    });
}

async function loadConversations() {
    try {
        const data = await fetchApi('/conversations.php?page_size=50');
        conversations = data.data.list || [];
        renderConversationList();
    } catch (e) {
        document.getElementById('conversationList').innerHTML = `
            <div class="text-center py-4 text-danger">
                <i class="bi bi-exclamation-triangle mb-2" style="font-size: 2rem;"></i>
                <p>加载会话列表失败</p>
                <button class="btn btn-sm btn-outline-primary" onclick="location.reload()">重试</button>
            </div>
        `;
    }
}

function renderConversationList() {
    const listEl = document.getElementById('conversationList');
    
    if (conversations.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
                <p class="mt-2">暂无私信会话</p>
            </div>
        `;
        return;
    }

    let html = '';
    for (const conv of conversations) {
        const isActive = currentConversation && currentConversation.conversation_id === conv.conversation_id;
        const avatarText = conv.other_user_nickname ? conv.other_user_nickname.charAt(0).toUpperCase() : '?';
        const timeStr = formatConversationTime(conv.last_message_time);
        
        html += `
            <div class="conversation-item p-3 border-bottom cursor-pointer ${isActive ? 'bg-primary bg-opacity-10' : 'hover-bg-light'}" 
                 data-conversation-id="${conv.conversation_id}"
                 data-other-user-id="${conv.other_user_id}"
                 data-other-user-nickname="${escapeHtml(conv.other_user_nickname)}"
                 style="cursor: pointer;">
                <div class="d-flex align-items-center">
                    <div class="avatar-circle bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 45px; height: 45px;">
                        <span class="fw-bold">${avatarText}</span>
                    </div>
                    <div class="ms-3 flex-grow-1 min-w-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0 text-truncate" style="max-width: 150px;">${escapeHtml(conv.other_user_nickname)}</h6>
                            <small class="text-muted flex-shrink-0">${timeStr}</small>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-1">
                            <small class="text-muted text-truncate" style="max-width: 180px;">
                                ${conv.last_sender_id === currentUser.id ? '<span class="text-primary">我: </span>' : ''}
                                ${escapeHtml(conv.last_message_content || '暂无消息')}
                            </small>
                            ${conv.unread_count > 0 ? `
                                <span class="badge bg-danger rounded-pill flex-shrink-0" style="font-size: 0.7rem;">
                                    ${conv.unread_count > 99 ? '99+' : conv.unread_count}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const conversationId = parseInt(item.dataset.conversationId);
            const otherUserId = parseInt(item.dataset.otherUserId);
            const otherUserNickname = item.dataset.otherUserNickname;
            openConversation(conversationId, otherUserId, otherUserNickname);
        });
    });
}

function formatConversationTime(timeStr) {
    if (!timeStr) return '';
    
    const now = new Date();
    const time = new Date(timeStr);
    const diffDays = Math.floor((now - time) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        const hours = time.getHours().toString().padStart(2, '0');
        const minutes = time.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } else if (diffDays === 1) {
        return '昨天';
    } else if (diffDays < 7) {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekdays[time.getDay()];
    } else {
        return `${time.getMonth() + 1}/${time.getDate()}`;
    }
}

async function openConversation(conversationId, otherUserId, otherUserNickname) {
    currentConversation = {
        conversation_id: conversationId,
        other_user_id: otherUserId,
        other_user_nickname: otherUserNickname
    };

    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('chatContent').classList.remove('d-none');
    document.getElementById('chatContent').classList.add('d-flex');

    document.getElementById('otherUserAvatar').textContent = otherUserNickname.charAt(0).toUpperCase();
    document.getElementById('otherUserName').textContent = otherUserNickname;
    document.getElementById('chatStatus').textContent = '在线';

    renderConversationList();
    messages = [];
    currentPage = 1;
    
    await loadMessages();
    await markAsRead(conversationId);
}

async function loadMessages() {
    if (isLoadingMessages || !currentConversation) return;
    
    isLoadingMessages = true;

    try {
        const data = await fetchApi(`/messages.php?conversation_id=${currentConversation.conversation_id}&page=${currentPage}&page_size=${PAGE_SIZE}`);
        const newMessages = data.data.list || [];
        totalPages = data.data.total_pages || 1;
        
        if (currentPage === 1) {
            messages = newMessages;
        } else {
            messages = [...newMessages, ...messages];
        }

        renderMessages();
        updateLoadMoreButton();

        if (currentPage === 1) {
            scrollToBottom();
        }

    } catch (e) {
        console.error('加载消息失败', e);
    } finally {
        isLoadingMessages = false;
    }
}

async function loadMoreMessages() {
    if (currentPage < totalPages) {
        currentPage++;
        await loadMessages();
    }
}

function updateLoadMoreButton() {
    const btn = document.getElementById('loadMoreBtn');
    if (currentPage < totalPages) {
        btn.classList.remove('d-none');
    } else {
        btn.classList.add('d-none');
    }
}

function renderMessages() {
    const listEl = document.getElementById('messageList');
    
    if (messages.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-chat-square" style="font-size: 3rem; opacity: 0.3;"></i>
                <p class="mt-2">还没有消息，发送第一条消息吧</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = null;

    for (const msg of messages) {
        const msgDate = new Date(msg.created_at).toDateString();
        
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            html += `
                <div class="text-center my-3">
                    <span class="badge bg-secondary bg-opacity-50 text-white">
                        ${formatMessageDate(msg.created_at)}
                    </span>
                </div>
            `;
        }

        const isMine = msg.sender_id === currentUser.id;
        const timeStr = formatMessageTime(msg.created_at);

        if (isMine) {
            html += `
                <div class="d-flex justify-content-end mb-3 message-item">
                    <div class="me-2 text-end">
                        <div class="bg-primary text-white rounded-3 px-3 py-2 d-inline-block" style="max-width: 70%; word-break: break-word; border-top-right-radius: 0.25rem;">
                            ${escapeHtml(msg.content)}
                        </div>
                        <div class="small text-muted mt-1">
                            ${timeStr}
                            ${msg.is_read ? '<i class="bi bi-check2-all text-primary" title="已读"></i>' : '<i class="bi bi-check2 text-muted" title="未读"></i>'}
                        </div>
                    </div>
                    <div class="avatar-circle bg-primary text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                        <span class="fw-bold" style="font-size: 0.9rem;">${currentUser.nickname.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="d-flex justify-content-start mb-3 message-item">
                    <div class="avatar-circle bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                        <span class="fw-bold" style="font-size: 0.9rem;">${currentConversation.other_user_nickname.charAt(0).toUpperCase()}</span>
                    </div>
                    <div class="ms-2">
                        <div class="bg-white rounded-3 px-3 py-2 d-inline-block shadow-sm" style="max-width: 70%; word-break: break-word; border-top-left-radius: 0.25rem;">
                            ${escapeHtml(msg.content)}
                        </div>
                        <div class="small text-muted mt-1">${timeStr}</div>
                    </div>
                </div>
            `;
        }
    }

    listEl.innerHTML = html;
}

function formatMessageDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();
    
    if (date.toDateString() === today) {
        return '今天';
    } else if (date.toDateString() === yesterday) {
        return '昨天';
    } else {
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }
}

function formatMessageTime(dateStr) {
    const date = new Date(dateStr);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function scrollToBottom() {
    const listEl = document.getElementById('messageList');
    setTimeout(() => {
        listEl.scrollTop = listEl.scrollHeight;
    }, 100);
}

async function markAsRead(conversationId) {
    try {
        await fetchApi('/message_read.php', {
            method: 'POST',
            body: JSON.stringify({ conversation_id: conversationId })
        });
        
        const conv = conversations.find(c => c.conversation_id === conversationId);
        if (conv) {
            conv.unread_count = 0;
            renderConversationList();
            updateUnreadCount();
        }
    } catch (e) {
        console.error('标记已读失败', e);
    }
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleInputChange(e) {
    const textarea = e.target;
    const length = textarea.value.length;
    document.getElementById('charCount').textContent = `${length}/5000`;
    
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!currentConversation) {
        alert('请先选择一个用户');
        return;
    }

    if (!content) {
        return;
    }

    if (content.length > 5000) {
        alert('消息内容不能超过5000字');
        return;
    }

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;

    try {
        const data = await fetchApi('/message_send.php', {
            method: 'POST',
            body: JSON.stringify({
                receiver_id: currentConversation.other_user_id,
                content: content
            })
        });

        input.value = '';
        document.getElementById('charCount').textContent = '0/5000';
        input.style.height = 'auto';

        if (data.data) {
            messages.push(data.data);
            
            if (!currentConversation.conversation_id) {
                currentConversation.conversation_id = data.data.conversation_id;
            }
            
            renderMessages();
            scrollToBottom();
            
            await loadConversations();
            await updateUnreadCount();
        }

    } catch (e) {
        alert(e.message || '发送失败');
    } finally {
        sendBtn.disabled = false;
    }
}

function showConversationList() {
    document.getElementById('chatContent').classList.add('d-none');
    document.getElementById('chatContent').classList.remove('d-flex');
    document.getElementById('emptyState').classList.remove('d-none');
    currentConversation = null;
    renderConversationList();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openNewMessageModal() {
    const modal = new bootstrap.Modal(document.getElementById('newMessageModal'));
    modal.show();
    setTimeout(() => {
        document.getElementById('searchUserInput').focus();
    }, 200);
}

async function searchUsers() {
    const keyword = document.getElementById('searchUserInput').value.trim();
    const resultsEl = document.getElementById('searchResults');

    if (!keyword) {
        resultsEl.innerHTML = '<div class="text-center text-muted py-3">请输入搜索关键词</div>';
        return;
    }

    resultsEl.innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border spinner-border-sm" role="status"></div>
            <span class="ms-2">搜索中...</span>
        </div>
    `;

    try {
        const data = await fetchApi(`/users_search.php?keyword=${encodeURIComponent(keyword)}`);
        const users = data.data?.list || [];

        if (users.length === 0) {
            resultsEl.innerHTML = '<div class="text-center text-muted py-3">未找到匹配的用户</div>';
            return;
        }

        let html = '';
        for (const user of users) {
            const avatarText = user.nickname ? user.nickname.charAt(0).toUpperCase() : '?';
            html += `
                <div class="d-flex align-items-center p-2 border-bottom hover-bg-light cursor-pointer search-user-item" 
                     data-user-id="${user.id}" 
                     data-user-nickname="${escapeHtml(user.nickname)}"
                     style="cursor: pointer;">
                    <div class="avatar-circle bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;">
                        <span class="fw-bold">${avatarText}</span>
                    </div>
                    <div class="ms-3">
                        <h6 class="mb-0">${escapeHtml(user.nickname)}</h6>
                        <small class="text-muted">@${escapeHtml(user.username)}</small>
                    </div>
                    <div class="ms-auto">
                        <i class="bi bi-chevron-right text-muted"></i>
                    </div>
                </div>
            `;
        }

        resultsEl.innerHTML = html;

        resultsEl.querySelectorAll('.search-user-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = parseInt(item.dataset.userId);
                const userNickname = item.dataset.userNickname;
                startConversation(userId, userNickname);
            });
        });

    } catch (e) {
        resultsEl.innerHTML = `<div class="text-center text-danger py-3">搜索失败：${escapeHtml(e.message)}</div>`;
    }
}

function startConversation(userId, userNickname) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('newMessageModal'));
    if (modal) {
        modal.hide();
    }

    const existingConv = conversations.find(c => c.other_user_id === userId);
    
    if (existingConv) {
        openConversation(existingConv.conversation_id, userId, userNickname);
    } else {
        const conversationId = null;
        currentConversation = {
            conversation_id: null,
            other_user_id: userId,
            other_user_nickname: userNickname
        };

        document.getElementById('emptyState').classList.add('d-none');
        document.getElementById('chatContent').classList.remove('d-none');
        document.getElementById('chatContent').classList.add('d-flex');

        document.getElementById('otherUserAvatar').textContent = userNickname.charAt(0).toUpperCase();
        document.getElementById('otherUserName').textContent = userNickname;
        document.getElementById('chatStatus').textContent = '发起新对话';

        messages = [];
        renderMessages();
        document.getElementById('messageInput').focus();
    }
}

async function updateUnreadCount() {
    try {
        const data = await fetchApi('/unread_count.php');
        const count = data.data?.unread_count || 0;
        
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }
        
        updateNavUnreadBadge(count);
        
        document.title = count > 0 ? `(${count}) 私信 - 极简论坛` : '私信 - 极简论坛';
        
    } catch (e) {
        console.error('获取未读数失败', e);
    }
}

document.addEventListener('DOMContentLoaded', initMessagesPage);
