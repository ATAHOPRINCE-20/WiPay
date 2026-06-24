/**
 * View Manager Module - Handles navigation and breadcrumbs
 */

import * as ui from './ui.js';

let currentRouterFilter = "";

export function setCurrentRouterFilter(val) {
    currentRouterFilter = val;
}

export function switchView(viewName) {
    localStorage.setItem('currentView', viewName);

    // 1. Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    // 2. Update Sidebar State
    document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
    const activeNavItem = document.querySelector(`.sidebar-nav li[data-view="${viewName}"]`);
    if (activeNavItem) activeNavItem.classList.add('active');

    // 3. Update Breadcrumb
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) {
        breadcrumb.innerText = 'Home > ' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    // 4. Update Mobile Nav
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeMobileBtn = document.querySelector(`.mobile-nav-btn[data-view="${viewName}"]`);
    if (activeMobileBtn) activeMobileBtn.classList.add('active');

    // 5. Show Target View
    let targetId = viewName + 'View';
    if (viewName === 'dashboard') targetId = 'dashboardView';

    const target = document.getElementById(targetId);
    if (target) {
        target.classList.remove('hidden');
    } else {
        console.error('View not found:', targetId);
    }

    // 6. Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
        toggleSidebar('close');
    }

    // 7. Trigger Data Refresh (Global Event)
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewName } }));
}

export function toggleSidebar(action) {
    const s = document.querySelector('.sidebar');
    if (!s) return;
    if (action === 'close') s.classList.remove('open');
    else if (action === 'open') s.classList.add('open');
    else s.classList.toggle('open');
}

export function toggleDesktopSidebar() {
    const s = document.querySelector('.sidebar');
    if (s) s.classList.toggle('collapsed');
}

export function toggleUserMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('userDropdown');
    if (menu) menu.classList.toggle('hidden');
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme !== 'light';

    if (!isDark) {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light');
    } else {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light');
    }
    updateThemeText(isDark);
}

export function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    body.classList.toggle('light');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeText(isDark);
}

function updateThemeText(isDark) {
    const el = document.getElementById('themeText');
    if (el) el.innerText = isDark ? 'Light Mode' : 'Dark Mode';
}

export function toggleSupport() {
    const popover = document.getElementById('supportPopover');
    if (popover) popover.classList.toggle('visible');
}
