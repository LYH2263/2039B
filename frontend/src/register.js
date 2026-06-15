import { fetchApi } from './config.js';

const form = document.getElementById('registerForm');
const errorMsg = document.getElementById('errorMsg');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    errorMsg.classList.add('d-none');

    if (password !== confirmPassword) {
        showError('两次输入的密码不一致');
        return;
    }

    try {
        const data = await fetchApi('/user_register.php', {
            method: 'POST',
            body: JSON.stringify({ username, nickname, email, password })
        });
        
        alert('注册成功！请登录');
        window.location.href = '/login.html';
    } catch (error) {
        showError(error.message);
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('d-none');
}
