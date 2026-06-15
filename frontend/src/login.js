import { fetchApi } from './config.js';

const form = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorMsg.classList.add('d-none');

    try {
        const data = await fetchApi('/user_login.php', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        alert('登录成功！');
        window.location.href = '/';
    } catch (error) {
        showError(error.message);
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('d-none');
}
