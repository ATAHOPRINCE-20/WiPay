/**
 * UI Module - Handles alerts, toasts, theme, and DOM utilities
 */

export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}

export function showToast(msg, type) {
    const existing = document.querySelectorAll('.popup-toast');
    existing.forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'popup-toast';

    let icon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    let border = '#333';

    if (type === 'success') {
        border = '#4caf50';
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${border}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        border = '#f44336';
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${border}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }

    toast.style.cssText = `
        display: flex; align-items: center; gap: 12px;
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px);
        z-index: 20001;
        background: #1e1e1e; color: #fff;
        border-left: 5px solid ${border};
        padding: 14px 20px;
        border-radius: 8px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.5);
        font-family: 'Inter', sans-serif;
        font-weight: 500; font-size: 0.95rem;
        opacity: 0; transition: all 0.4s ease;
        min-width: 300px;
    `;

    toast.innerHTML = `
        <div style="display:flex; align-items:center;">${icon}</div>
        <div>${escapeHtml(msg)}</div>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

export function showAlert(message, type = 'success') {
    showToast(message, type);
}

export function openDashModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

export function closeDashModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

export function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    body.classList.toggle('light');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeText(isDark);
}

export function updateThemeText(isDark) {
    const el = document.getElementById('themeText');
    if (el) el.innerText = isDark ? 'Light Mode' : 'Dark Mode';
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme !== 'light';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light');
        updateThemeText(false);
    } else {
        document.body.classList.add('dark-mode');
        updateThemeText(true);
    }
}

export function toggleSidebar() {
    const s = document.querySelector('.sidebar');
    if (s) s.classList.toggle('open');
}

export function toggleDesktopSidebar() {
    const s = document.querySelector('.sidebar');
    if (s) s.classList.toggle('collapsed');
}

export function toggleStats() {
    const grid = document.getElementById('statsGrid');
    const btn = document.querySelector('#viewMoreContainer button');
    if (grid) grid.classList.toggle('expanded');

    if (grid && btn) {
        const isExpanded = grid.classList.contains('expanded');
        btn.innerHTML = isExpanded ? 'Show Less <span class="arrow">↑</span>' : 'View More <span class="arrow">↓</span>';
    }
}

export function toggleUserMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('userDropdown');
    if (menu) menu.classList.toggle('hidden');
}

// Global click listener for dropdowns
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('userDropdown');
        if (menu && !menu.classList.contains('hidden') && !e.target.closest('.user-menu-container')) {
            menu.classList.add('hidden');
        }
    });
}

// --- NEW HELPERS ---
export function showTableShimmer(tbodyId, colCount, mobileHideIndices = []) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        let cols = '';
        for (let j = 0; j < colCount; j++) {
            const isHiddenOnMobile = mobileHideIndices.includes(j);
            const classes = isHiddenOnMobile ? 'class="mobile-hide"' : '';
            cols += `<td ${classes}><div class="shimmer-line"></div></td>`;
        }
        tbody.innerHTML += `<tr class="shimmer-row">${cols}</tr>`;
    }
}

export function showConfirm(message, title = 'Are you sure?') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmGlobalModal');
        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        if (!modal || !okBtn || !cancelBtn) {
            // Fallback for unexpected DOM issues
            resolve(confirm(message));
            return;
        }

        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = message;

        const cleanup = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);

        modal.classList.remove('hidden');
    });
}
