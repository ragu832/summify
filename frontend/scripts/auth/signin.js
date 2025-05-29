import { loginUser, isLoggedIn } from './auth.js';

// Redirect if already logged in
if (isLoggedIn()) {
    window.location.href = '/';
}

const form = document.getElementById('signin-form');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const result = await loginUser(email, password);
    
    if (result.success) {
        window.location.href = '/';
    } else {
        alert(result.error || 'Login failed. Please try again.');
    }
});
