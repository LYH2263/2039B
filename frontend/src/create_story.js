import { fetchApi } from './config.js';
import { renderHeader, requireLogin } from './header.js';

renderHeader('stories');

const form = document.getElementById('createForm');
const errorMsg = document.getElementById('errorMsg');
const maxWordsInput = document.getElementById('maxWords');
const maxWordsDisplay = document.getElementById('maxWordsDisplay');
const openingParagraph = document.getElementById('openingParagraph');
const wordCount = document.getElementById('wordCount');
const wordWarning = document.getElementById('wordWarning');

if (!requireLogin()) {
    document.getElementById('app').innerHTML = '<div class="alert alert-info">请先登录后再创建接龙故事</div>';
}

maxWordsInput.addEventListener('input', () => {
    maxWordsDisplay.textContent = maxWordsInput.value;
    updateWordCount();
});

openingParagraph.addEventListener('input', updateWordCount);

function updateWordCount() {
    const text = openingParagraph.value.trim();
    const count = text.length;
    const max = parseInt(maxWordsInput.value);
    wordCount.innerHTML = `当前字数：${count} / <span id="maxWordsDisplay">${max}</span>`;
    
    if (count > max) {
        wordWarning.textContent = `已超过 ${count - max} 字`;
        wordWarning.className = 'small text-danger';
    } else if (count > max * 0.9) {
        wordWarning.textContent = `接近上限，还剩 ${max - count} 字`;
        wordWarning.className = 'small text-warning';
    } else {
        wordWarning.textContent = '';
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('title').value.trim();
    const opening_paragraph = openingParagraph.value.trim();
    const max_words_per_paragraph = parseInt(maxWordsInput.value);

    errorMsg.classList.add('d-none');

    if (max_words_per_paragraph < 10 || max_words_per_paragraph > 2000) {
        showError('每段字数上限必须在10-2000之间');
        return;
    }

    if (opening_paragraph.length > max_words_per_paragraph) {
        showError(`开头段落字数(${opening_paragraph.length})超过上限(${max_words_per_paragraph})`);
        return;
    }

    try {
        const data = await fetchApi('/stories.php', {
            method: 'POST',
            body: JSON.stringify({ title, opening_paragraph, max_words_per_paragraph })
        });
        
        alert('接龙故事创建成功！');
        window.location.href = `/story_detail.html?id=${data.story_id}`;
    } catch (error) {
        showError(error.message);
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('d-none');
}
