import { registerUser, isLoggedIn } from './auth.js';

// Redirect if already logged in
if (isLoggedIn()) {
    window.location.href = '/';
}

const form = document.getElementById('signup-form');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    const userData = {
        name,
        email,
        password
    };

    const result = await registerUser(userData);
    
    if (result.success) {
        window.location.href = '/pages/auth/signin.html';
        alert('Registration successful! Please sign in.');
    } else {
        alert(result.error || 'Registration failed. Please try again.');
    }
});
