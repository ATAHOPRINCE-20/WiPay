/**
 * API Module - Handles all server communication
 */

export async function fetchAuth(url, options = {}) {
    options.credentials = 'include'; // Send HttpOnly cookies
    options.headers = options.headers || {};
    
    const token = localStorage.getItem('wipay_token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }

    // Auto-inject Idempotency-Key for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase()) && !options.headers['Idempotency-Key']) {
        options.headers['Idempotency-Key'] = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    try {
        let targetUrl = url;
        if (url.startsWith('/') && typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL && CONFIG.API_BASE_URL.startsWith('http')) {
            if (url.startsWith('/api') && CONFIG.API_BASE_URL.endsWith('/api')) {
                targetUrl = CONFIG.API_BASE_URL + url.substring(4);
            } else {
                targetUrl = CONFIG.API_BASE_URL + url;
            }
        }

        const res = await fetch(targetUrl, options);
        if (res.status === 401 || res.status === 403) {
            const data = await res.json().catch(() => ({}));
            const errorMsg = data.error || (res.status === 401 ? 'Session expired. Please login again.' : 'Access Denied');
            
            console.warn(`[Auth Error ${res.status}]`, errorMsg);

            // Use the page's existing showAlert if available, otherwise use a fallback
            if (window.showAlert) {
                window.showAlert(errorMsg, 'error');
            } else {
                showFallbackAlert(errorMsg);
            }
            
            // Clear local storage
            localStorage.removeItem('wipay_token');
            localStorage.removeItem('wipay_role');
            localStorage.removeItem('wipay_user');

            // Wait 3 seconds before redirecting so the user can see the message
            setTimeout(() => {
                window.location.href = 'login_dashboard.html';
            }, 3000);

            return Promise.reject(errorMsg);
        }
        return res;
    } catch (err) {
        console.error('FetchAuth Error:', err);
        throw err;
    }
}

/**
 * Fallback modern alert if the page doesn't have its own showAlert function
 */
function showFallbackAlert(message) {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 9999;
        background: #f44336; color: white; padding: 16px 24px;
        border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        font-family: 'Inter', sans-serif; font-weight: 600;
        animation: slideIn 0.3s ease-out;
    `;
    div.innerHTML = `<i class="fas fa-exclamation-circle" style="margin-right:10px;"></i> ${message}`;
    
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(div);
}

// Add common API calls here
export const api = {
    get: (url) => fetchAuth(url, { method: 'GET' }),
    post: (url, data) => fetchAuth(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => fetchAuth(url, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (url) => fetchAuth(url, { method: 'DELETE' }),
    upload: (url, formData) => fetchAuth(url, { method: 'POST', body: formData })
};
