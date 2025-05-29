import { isLoggedIn } from './scripts/auth/auth.js';

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        window.location.href = '/pages/landing.html';
    }
});