// Auth state management with MongoDB backend
const API_URL = 'http://localhost:3001/api';

// User registration
export async function registerUser(userData) {
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// User login
export async function loginUser(email, password) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store session with isLoggedIn flag
        const userData = {
            ...data.user,
            isLoggedIn: true
        };
        sessionStorage.setItem('user', JSON.stringify(userData));

        return { success: true, user: userData };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Check if user is logged in
export function isLoggedIn() {
    try {
        const user = sessionStorage.getItem('user');
        return user ? JSON.parse(user).isLoggedIn === true : false;
    } catch (error) {
        console.error('Error checking login status:', error);
        return false;
    }
}

// Logout user
export function logoutUser() {
    sessionStorage.removeItem('user');
    window.location.href = '/pages/auth/signin.html';
}

// Protect routes
export function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/pages/auth/signin.html';
    }
}
