/**
 * Dashboard Logic Orchestrator
 * Importing modules and exposing them to window for legacy HTML onclick handlers.
 */

import * as api from './modules/api.js';
import * as ui from './modules/ui.js';
import * as vm from './modules/view-manager.js';
import * as dh from './modules/data-handlers.js';
import * as charts from './modules/charts.js';



// --- Expose API & UI Helpers ---
window.fetchAuth = api.fetchAuth;
window.showAlert = ui.showAlert;
window.showConfirm = ui.showConfirm;
window.closeDashModal = ui.closeDashModal;
window.openDashModal = ui.openDashModal;
window.toggleSupport = vm.toggleSupport;
window.toggleStats = ui.toggleStats; // Wait, did I allow toggleStats in UI? I missed it in UI description.
// Let's check view-manager or re-implement simple UI toggles if missing.
// Actually, I should check if toggleStats is in ui.js or vm.js.
// I'll add it here if missing, or use inline.

// --- Expose View Manager Logic ---
window.switchView = vm.switchView;
window.toggleSidebar = vm.toggleSidebar;
window.toggleDesktopSidebar = vm.toggleDesktopSidebar;
window.toggleUserMenu = vm.toggleUserMenu;
window.toggleTheme = vm.toggleTheme;

// --- Expose Data Handlers ---
window.fetchCategoriesList = dh.fetchCategoriesList;
window.createCategory = dh.createCategory;
window.submitEditCategory = dh.submitEditCategory;
window.deleteCategory = dh.deleteCategory;
window.openEditCategoryModal = (id, name) => {
    document.getElementById('editCatId').value = id;
    document.getElementById('editCatName').value = name;
    ui.openDashModal('editCategoryModal');
};

window.fetchPackagesList = dh.fetchPackagesList;
window.createPackage = dh.createPackage;
window.submitEditPackage = dh.submitEditPackage;
window.togglePackageStatus = dh.togglePackageStatus;
window.deletePackage = dh.deletePackage;
window.openAddPackageModal = async () => {
    await dh.loadCategoriesForSelect('pkgCategory');
    ui.openDashModal('addPackageModal');
};
window.openEditPackageModal = async (id, name, price, catId) => {
    document.getElementById('editPkgId').value = id;
    document.getElementById('editPkgName').value = name;
    document.getElementById('editPkgPrice').value = price;
    await dh.loadCategoriesForSelect('editPkgCategory', catId);
    ui.openDashModal('editPackageModal');
};
window.loadPackagesForImport = dh.loadPackagesForImport;
window.loadPackagesForSell = dh.loadPackagesForSell;

window.fetchVouchersList = dh.fetchVouchersList;
window.importVouchers = dh.importVouchers;
window.deleteSelectedVouchers = dh.deleteSelectedVouchers;
window.deleteSingleVoucher = dh.deleteSingleVoucher;
window.submitSellVoucher = dh.submitSellVoucher;
window.toggleVoucherRow = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
};
window.checkVoucherSelection = () => {
    const cbs = document.querySelectorAll('.voucher-cb:checked');
    const btn = document.getElementById('btnDeleteVouchers');
    if (btn) {
        if (cbs.length > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};
window.toggleAllVouchers = (source) => {
    const cbs = document.querySelectorAll('.voucher-cb');
    cbs.forEach(cb => cb.checked = source.checked);
    window.checkVoucherSelection();
};

window.fetchPaymentsList = dh.fetchPaymentsList;
window.initiateWithdrawal = dh.initiateWithdrawal;
window.submitWithdrawal = dh.submitWithdrawal;
window.resetWithdrawalModal = dh.resetWithdrawalModal;

window.fetchSMSLogs = dh.fetchSMSLogs;
window.submitBuySMS = dh.submitBuySMS;
window.calculateSMSPreview = dh.calculateSMSPreview;

window.fetchRouters = dh.fetchRouters;
window.submitAddRouter = dh.submitAddRouter;
window.submitEditRouter = dh.submitEditRouter;
window.deleteRouter = dh.deleteRouter;
window.openMikhmon = dh.openMikhmon;
window.openCheckSiteModal = dh.openCheckSiteModal;

window.fetchAds = dh.fetchAds;
window.uploadAd = dh.uploadAd;
window.deleteAd = dh.deleteAd;
window.openEditRouterModal = (id, name, url, api_user, api_pass, api_port) => {
    document.getElementById('editRouterId').value = id;
    document.getElementById('editRouterName').value = name;
    document.getElementById('editRouterUrl').value = url;
    document.getElementById('editRouterApiUser').value = api_user || '';
    document.getElementById('editRouterApiPass').value = ''; // Always clear password for security
    document.getElementById('editRouterApiPort').value = api_port || 8728;
    ui.openDashModal('editRouterModal');
};

window.fetchAgentsList = dh.fetchAgentsList;
window.createAgent = dh.createAgent;
window.submitAssignVouchers = dh.submitAssignVouchers;
window.settleAgentAccount = dh.settleAgentAccount;
window.openAssignVoucherModal = dh.openAssignVoucherModal;

// --- View Change Watchers moved to initDashboard ---


window.fetchDownloadsList = dh.fetchDownloadsList;
window.fetchBoughtVouchersList = dh.fetchBoughtVouchersList;
window.filterBoughtVouchers = dh.filterBoughtVouchers;
window.fetchMyTransactions = dh.fetchMyTransactions;
window.submitChangePass = dh.submitChangePass;
window.startSubscriptionRenewal = dh.startSubscriptionRenewal;
window.performLogout = dh.performLogout;

window.loadAnalytics = charts.loadAnalytics;

// --- Helper for View Details ---
window.viewPackageDetails = (index) => {
    const pkgs = dh.getCurrentPackages();
    const data = pkgs[index];
    if (data) {
        const content = document.getElementById('packageDetailContent');
        if(content) {
            const isActive = data.is_active === 1 || data.is_active === true;
            const statusColor = isActive ? '#4caf50' : '#f44336';
            
            content.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; text-align: left;">
                    <div style="grid-column: span 2; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                        <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Package Name</div>
                        <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-main);">${ui.escapeHtml(data.name)}</div>
                    </div>
                    
                    <div>
                        <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Price</div>
                        <div style="font-size: 1.1rem; color: var(--primary-color); font-weight: 600;">${Number(data.price).toLocaleString()} UGX</div>
                    </div>

                    <div>
                        <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Status</div>
                        <div style="color:${statusColor}; font-weight: bold; font-size: 1.1rem;">${isActive ? 'ACTIVE':'INACTIVE'}</div>
                    </div>

                     <div>
                        <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Category</div>
                        <div style="font-size: 1rem;">${ui.escapeHtml(data.category_name || '-')}</div>
                    </div>

                     <div>
                        <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Vouchers</div>
                        <div style="font-size: 1rem;">${data.vouchers_count || 0}</div>
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 0; gap: 12px; flex-wrap: wrap;">
                    <button class="btn-submit" style="flex: 1; min-width: 140px;" onclick="closeDashModal('packageDetailModal'); openEditPackageModal(${data.id}, '${data.name.replace(/'/g, "\\'")}', ${data.price}, ${data.category_id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    ${isActive 
                        ? `<button class="btn-cancel" style="flex: 1; min-width: 140px;" onclick="togglePackageStatus(${data.id}); closeDashModal('packageDetailModal');">Deactivate</button>` 
                        : `<button class="btn-success" style="flex: 1; min-width: 140px;" onclick="togglePackageStatus(${data.id}); closeDashModal('packageDetailModal');">Activate</button>`
                    }
                    <button class="btn-danger" style="flex: 1; min-width: 140px; background-color: #f44336;" onclick="closeDashModal('packageDetailModal'); deletePackage(${data.id}, '${data.name.replace(/'/g, "\\'")}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            ui.openDashModal('packageDetailModal');
        }
    }
};

window.viewGenericDetails = (type, index) => {
    let data;
    let title = 'Details';
    let html = '';

    if (type === 'myTransactions') {
        data = dh.getCurrentMyTransactions()[index];
        title = 'Transaction Details';
        if (data) {
            const statusColor = data.status === 'success' ? '#4caf50' : (data.status === 'pending' ? '#ff9800' : '#f44336');
            html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div><strong style="color: #888; font-size: 0.8rem;">TYPE</strong><br>${ui.escapeHtml(data.type)}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">DATE</strong><br>${new Date(data.created_at).toLocaleString()}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">AMOUNT</strong><br>${Number(data.amount).toLocaleString()} UGX</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">STATUS</strong><br><span style="color: ${statusColor}; font-weight: bold;">${data.status.toUpperCase()}</span></div>
                    <div style="grid-column: span 2;"><strong style="color: #888; font-size: 0.8rem;">DESCRIPTION</strong><br>${ui.escapeHtml(data.description || '-')}</div>
                    <div style="grid-column: span 2;"><strong style="color: #888; font-size: 0.8rem;">REFERENCE</strong><br><small style="color: #aaa;">${ui.escapeHtml(data.reference || '-')}</small></div>
                </div>
            `;
        }
    } else if (type === 'boughtVouchers') {
        data = dh.getCurrentBoughtVouchers()[index];
        title = 'Voucher Details';
        if (data) {
            html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div><strong style="color: #888; font-size: 0.8rem;">VOUCHER CODE</strong><br><span style="font-size: 1.1rem; font-weight: bold; color: #03a9f4;">${ui.escapeHtml(data.voucher_code || 'Auto-Assigned')}</span></div>
                    <div><strong style="color: #888; font-size: 0.8rem;">BUYER NAME</strong><br>${ui.escapeHtml(data.customer_name || '-')}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">PHONE</strong><br>${ui.escapeHtml(data.phone_number)}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">PACKAGE</strong><br>${ui.escapeHtml(data.package_name || '-')}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">AMOUNT</strong><br>${Number(data.amount).toLocaleString()} UGX</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">TIME BOUGHT</strong><br>${new Date(data.created_at).toLocaleString()}</div>
                    <div><strong style="color: #888; font-size: 0.8rem;">REF</strong><br><small style="color: #aaa;">${ui.escapeHtml(data.transaction_ref)}</small></div>
                </div>
            `;
        }
    }

    if (data) {
        const content = document.getElementById('genericDetailContent');
        const titleEl = document.getElementById('genericDetailTitle');
        if (content && titleEl) {
             titleEl.innerText = title;
             content.innerHTML = html;
             ui.openDashModal('genericDetailModal');
        }
    }
};
window.viewTransactionDetails = (index) => {
    const data = dh.getCurrentTransactions()[index];
    const modal = document.getElementById('transactionDetailModal');
    const content = document.getElementById('transactionDetailContent');
    if (!modal || !content || !data) return;

    const ref = data.transaction_ref;
    let webhookHtml = '<p style="color: #888;">No detailed logs available for this transaction yet.</p>';
    
    if (data.webhook_data) {
        try {
            const rawData = typeof data.webhook_data === 'string' ? JSON.parse(data.webhook_data) : data.webhook_data;
            
            // Check for specific common gateway errors to show them nicely
            if (rawData.message && (rawData.success === false || data.status === 'failed')) {
                webhookHtml = `<div style="background: rgba(244, 67, 54, 0.1); border-left: 4px solid #f44336; padding: 12px; border-radius: 4px; color: #ff8a80;">
                    <div style="font-weight: bold; margin-bottom: 5px; text-transform: uppercase; font-size: 0.75rem; opacity: 0.8;">GateWay Error</div>
                    <div style="font-size: 0.95rem;">${ui.escapeHtml(rawData.message)}</div>
                    ${rawData.error_code ? `<div style="margin-top: 5px; font-family: monospace; font-size: 0.75rem; opacity: 0.7;">Error Code: ${rawData.error_code}</div>` : ''}
                </div>`;
            } else {
                webhookHtml = `<pre style="background: #111; padding: 10px; border-radius: 5px; color: #4caf50; font-size: 0.85rem; overflow-x: auto; max-height: 300px;">${JSON.stringify(rawData, null, 2)}</pre>`;
            }
        } catch (e) {
            // Check if it's likely an Nginx HTML error (like 502)
            if (data.webhook_data.includes('<html>') || data.webhook_data.includes('502 Bad Gateway')) {
                webhookHtml = `<div style="background: rgba(244, 67, 54, 0.1); border-left: 4px solid #f44336; padding: 15px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">🔌</div>
                    <div style="font-weight: bold; color: #f44336; margin-bottom: 5px;">502 Bad Gateway</div>
                    <div style="color: #eee; font-size: 0.9rem;">The payment gateway is currently unreachable. This usually means their service is down or under maintenance.</div>
                    <div style="margin-top: 10px; font-size: 0.7rem; color: #888;">Raw error: Nginx Service Response</div>
                </div>`;
            } else {
                webhookHtml = `<pre style="background: #111; padding: 10px; border-radius: 5px; color: #f44336; font-size: 0.85rem;">Error parsing logs: ${ui.escapeHtml(data.webhook_data)}</pre>`;
            }
        }
    }

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div><strong style="color: #888; font-size: 0.8rem;">REFERENCE</strong><br><span style="font-size: 0.9rem;">${ui.escapeHtml(ref)}</span></div>
            <div><strong style="color: #888; font-size: 0.8rem;">STATUS</strong><br><span style="color: ${data.status === 'success' ? '#4caf50' : '#f44336'}; font-weight: bold;">${data.status.toUpperCase()}</span></div>
            <div><strong style="color: #888; font-size: 0.8rem;">BUYER NAME</strong><br>${ui.escapeHtml(data.customer_name || '-')}</div>
            <div><strong style="color: #888; font-size: 0.8rem;">PHONE</strong><br>${ui.escapeHtml(data.phone_number)}</div>
            <div><strong style="color: #888; font-size: 0.8rem;">AMOUNT</strong><br>${Number(data.amount).toLocaleString()} UGX</div>
            <div><strong style="color: #888; font-size: 0.8rem;">PACKAGE</strong><br>${ui.escapeHtml(data.package_name || '-')}</div>
            <div><strong style="color: #888; font-size: 0.8rem;">DATE</strong><br>${new Date(data.created_at).toLocaleString()}</div>
        </div>
        <h4 style="margin-bottom: 10px; font-size: 0.95rem; border-bottom: 1px solid #333; padding-bottom: 8px; color: #fff;">GATEWAY WEBHOOK LOGS</h4>
        <div style="margin-top: 10px;">${webhookHtml}</div>
    `;

    ui.openDashModal('transactionDetailModal');
};

// --- Missing UI Toggles ---
window.toggleStats = () => {
   const grid = document.getElementById('statsGrid');
   const btn = document.querySelector('#viewMoreContainer button');
   if (grid) grid.classList.toggle('expanded');
   if (grid && btn) {
       const isExpanded = grid.classList.contains('expanded');
       btn.innerHTML = isExpanded ? 'Show Less <span class="arrow">↑</span>' : 'View More <span class="arrow">↓</span>';
   }
};

window.onRouterFilterChange = (val) => {
    dh.setCurrentRouterFilter(val);

    const d1 = document.getElementById('routerFilterDashboard');
    const d2 = document.getElementById('routerFilterTransactions');
    if (d1) d1.value = val;
    if (d2) d2.value = val;

    dh.loadStats();
    charts.loadAnalytics('weekly', val);

    const activeView = document.querySelector('.view-section:not(.hidden)');
    if (activeView) {
        if(activeView.id === 'categoriesView') dh.fetchCategoriesList();
        if(activeView.id === 'packagesView') dh.fetchPackagesList();
        if(activeView.id === 'vouchersView') dh.fetchVouchersList();
        if(activeView.id === 'paymentsView') dh.fetchPaymentsList();
        if(activeView.id === 'smsView') dh.fetchSMSLogs();
        if(activeView.id === 'boughtVouchersView') dh.fetchBoughtVouchersList();
    }
};


// --- INITIALIZATION ---
async function initDashboard() {
    vm.initTheme();

    let username = localStorage.getItem('wipay_user');
    if (username) {
        // Handle both simple string (legacy) and JSON object
        try {
            if (username.startsWith('{')) {
                const userObj = JSON.parse(username);
                username = userObj.username;
            }
        } catch (e) {
            console.error('Error parsing user data', e);
        }

        const welcomeEl = document.getElementById('welcomeMsg');
        if (welcomeEl) welcomeEl.innerText = `WELCOME, ${username.toUpperCase()} `;
    }

    // Load Filters
    try {
        const res = await api.fetchAuth('/api/admin/routers');
        const routers = await res.json();
        if (routers && routers.length > 0) {
            const options = '<option value="">All Routers</option>' + 
                routers.map(r => `<option value="${r.id}">${ui.escapeHtml(r.name)}</option>`).join('');
            
            const d1 = document.getElementById('routerFilterDashboard');
            const d2 = document.getElementById('routerFilterTransactions');
            if (d1) d1.innerHTML = options;
            if (d2) d2.innerHTML = options;
        }
    } catch(e) { console.error('Error loading filters', e); }

    // --- View Change Listener ---
    window.addEventListener('viewChanged', (e) => {
        const viewName = e.detail.viewName;
        if (viewName === 'categories') dh.fetchCategoriesList();
        else if (viewName === 'packages') dh.fetchPackagesList();
        else if (viewName === 'vouchers') dh.fetchVouchersList();
        else if (viewName === 'payments') dh.fetchPaymentsList();
        else if (viewName === 'sms') dh.fetchSMSLogs();
        else if (viewName === 'boughtVouchers') dh.fetchBoughtVouchersList();
        else if (viewName === 'myTransactions') dh.fetchMyTransactions();
        else if (viewName === 'routers') dh.fetchRouters();
        else if (viewName === 'downloads') dh.fetchDownloadsList();
        else if (viewName === 'ads') dh.fetchAds();
        else if (viewName === 'agents') dh.fetchAgentsList();
        else if (viewName === 'dashboard') {
             dh.loadStats();
             charts.loadAnalytics();
        }
    });

    // Initial Data
    dh.loadStats();
    dh.loadSMSBalance();
    charts.loadAnalytics();
    dh.fetchRouters(); // Preload routers list? Or just wait for view switch.
    // Actually routers list is only needed in routers view.

    // Restore View
    const savedView = localStorage.getItem('currentView') || 'dashboard';
    vm.switchView(savedView);

    // Logout Link Handler
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            ui.openDashModal('logoutConfirmModal');
        });
    }

    // Sell Voucher Button Handler
    const btnSell = document.getElementById('btnSellVoucher');
    if (btnSell) {
        btnSell.addEventListener('click', () => {
             dh.loadPackagesForSell();
             ui.openDashModal('sellVoucherModal');
        });
    }

     // Socket.IO
    if (typeof io !== 'undefined') {
        try {
            const socket = io('https://ugpay.tech', { path: '/socket.io' });
            socket.on('connect', () => {});
            socket.on('data_update', (data) => {
                dh.loadStats();
                dh.loadSMSBalance();
                // Refresh active view logic
                // ... (simplified)
            });
        } catch (e) { console.error("Socket Error:", e); }
    }
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
