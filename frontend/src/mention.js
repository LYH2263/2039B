import { fetchApi } from './config.js';

export class MentionAutocomplete {
    constructor(textarea, options = {}) {
        this.textarea = textarea;
        this.options = Object.assign({
            minChars: 1,
            maxResults: 10,
            onSelect: null
        }, options);
        
        this.searchTimeout = null;
        this.isDropdownVisible = false;
        this.currentSearchTerm = '';
        this.selectedIndex = -1;
        this.mentionStartPos = -1;
        
        this.init();
    }

    init() {
        this.createDropdown();
        this.bindEvents();
    }

    createDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'mention-dropdown dropdown-menu show';
        this.dropdown.style.cssText = `
            position: absolute;
            z-index: 9999;
            min-width: 200px;
            max-height: 300px;
            overflow-y: auto;
            display: none;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(this.dropdown);
    }

    bindEvents() {
        this.textarea.addEventListener('input', (e) => this.handleInput(e));
        this.textarea.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.textarea.addEventListener('click', () => this.positionDropdown());
        this.textarea.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown(), 200);
        });
        
        document.addEventListener('click', (e) => {
            if (!this.textarea.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }

    handleInput(e) {
        const cursorPos = this.textarea.selectionStart;
        const text = this.textarea.value.substring(0, cursorPos);
        
        const atMatch = text.match(/@([^\s@#$%^&*()+=<>?\/\[\]{}|;:'",.!？！，。；：""''（）【】、~`\-]*)$/);
        
        if (atMatch) {
            this.currentSearchTerm = atMatch[1];
            this.mentionStartPos = cursorPos - this.currentSearchTerm.length - 1;
            
            if (this.currentSearchTerm.length >= this.options.minChars) {
                this.searchUsers(this.currentSearchTerm);
            } else {
                this.hideDropdown();
            }
        } else {
            this.hideDropdown();
        }
    }

    handleKeydown(e) {
        if (!this.isDropdownVisible) return;
        
        const items = this.dropdown.querySelectorAll('.mention-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.highlightSelectedItem();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.highlightSelectedItem();
                break;
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
                    this.selectItem(items[this.selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hideDropdown();
                break;
        }
    }

    highlightSelectedItem() {
        const items = this.dropdown.querySelectorAll('.mention-item');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('active', 'bg-primary', 'text-white');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active', 'bg-primary', 'text-white');
            }
        });
    }

    async searchUsers(keyword) {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchTimeout = setTimeout(async () => {
            try {
                const data = await fetchApi(`/users_search.php?keyword=${encodeURIComponent(keyword)}`);
                const users = data.data?.list || [];
                this.showDropdown(users);
            } catch (error) {
                console.warn('搜索用户失败:', error);
                this.hideDropdown();
            }
        }, 150);
    }

    showDropdown(users) {
        if (users.length === 0) {
            this.hideDropdown();
            return;
        }
        
        this.selectedIndex = -1;
        
        let html = '';
        users.slice(0, this.options.maxResults).forEach((user, index) => {
            const escapedNickname = escapeHtml(user.nickname);
            const escapedUsername = escapeHtml(user.username);
            const highlighted = this.highlightMatch(escapedNickname, this.currentSearchTerm);
            
            html += `
                <div class="mention-item dropdown-item py-2 px-3 cursor-pointer" 
                     data-user-id="${user.id}" 
                     data-nickname="${escapedNickname}">
                    <div class="d-flex align-items-center gap-2">
                        <div class="avatar-sm bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 28px; height: 28px; font-size: 12px;">
                            ${escapedNickname.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-semibold">${highlighted}</div>
                            <small class="text-muted">@${escapedUsername}</small>
                        </div>
                    </div>
                </div>
            `;
        });
        
        this.dropdown.innerHTML = html;
        this.dropdown.style.display = 'block';
        this.isDropdownVisible = true;
        
        this.positionDropdown();
        
        this.dropdown.querySelectorAll('.mention-item').forEach((item, index) => {
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.highlightSelectedItem();
            });
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectItem(item);
            });
        });
    }

    highlightMatch(text, searchTerm) {
        if (!searchTerm) return text;
        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
        return text.replace(regex, '<mark class="bg-warning px-0 rounded">$1</mark>');
    }

    positionDropdown() {
        if (!this.isDropdownVisible) return;
        
        const rect = this.getCaretCoordinates();
        if (rect) {
            this.dropdown.style.left = rect.left + window.scrollX + 'px';
            this.dropdown.style.top = rect.bottom + window.scrollY + 5 + 'px';
        } else {
            const textareaRect = this.textarea.getBoundingClientRect();
            this.dropdown.style.left = textareaRect.left + window.scrollX + 'px';
            this.dropdown.style.top = textareaRect.bottom + window.scrollY + 5 + 'px';
        }
    }

    getCaretCoordinates() {
        const mirror = document.createElement('div');
        mirror.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-family: ${getComputedStyle(this.textarea).fontFamily};
            font-size: ${getComputedStyle(this.textarea).fontSize};
            font-weight: ${getComputedStyle(this.textarea).fontWeight};
            letter-spacing: ${getComputedStyle(this.textarea).letterSpacing};
            line-height: ${getComputedStyle(this.textarea).lineHeight};
            padding: ${getComputedStyle(this.textarea).padding};
            width: ${this.textarea.offsetWidth}px;
        `;
        
        const text = this.textarea.value.substring(0, this.textarea.selectionStart);
        mirror.textContent = text;
        
        const marker = document.createElement('span');
        marker.textContent = '|';
        mirror.appendChild(marker);
        
        document.body.appendChild(mirror);
        
        const markerRect = marker.getBoundingClientRect();
        document.body.removeChild(mirror);
        
        return markerRect;
    }

    selectItem(item) {
        const userId = item.dataset.userId;
        const nickname = item.dataset.nickname;
        
        const text = this.textarea.value;
        const beforeMention = text.substring(0, this.mentionStartPos);
        const afterMention = text.substring(this.textarea.selectionStart);
        const newText = beforeMention + '@' + nickname + ' ' + afterMention;
        
        this.textarea.value = newText;
        
        const cursorPos = this.mentionStartPos + nickname.length + 2;
        this.textarea.selectionStart = cursorPos;
        this.textarea.selectionEnd = cursorPos;
        this.textarea.focus();
        
        this.hideDropdown();
        
        if (typeof this.options.onSelect === 'function') {
            this.options.onSelect({ userId, nickname });
        }
        
        const event = new Event('input', { bubbles: true });
        this.textarea.dispatchEvent(event);
    }

    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.isDropdownVisible = false;
        this.selectedIndex = -1;
        this.mentionStartPos = -1;
    }

    destroy() {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function initMentionAutocomplete(textarea, options) {
    return new MentionAutocomplete(textarea, options);
}
