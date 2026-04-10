/**
 * Data Handlers Module - Handles all data fetching and processing
 */

import { fetchAuth, api } from './api.js';
import * as ui from './ui.js';
import { loadAnalytics } from './charts.js';

// State
let currentPackages = [];
let currentTransactions = [];
let currentMyTransactions = [];
let currentBoughtVouchers = [];
let currentRouterFilter = "";
let countdownInterval = null;
let currentSMSBalance = 0; // Added state to track balance locally

export function setCurrentRouterFilter(val) {
    currentRouterFilter = val;
}

export function getCurrentPackages() { return currentPackages; }
export function getCurrentTransactions() { return currentTransactions; }
export function getCurrentMyTransactions() { return currentMyTransactions; }
export function getCurrentBoughtVouchers() { return currentBoughtVouchers; }

// --- DASHBOARD STATS ---
export async function loadStats() {
    try {
        let url = '/api/admin/stats';
        if (currentRouterFilter) {
            url += `?router_id=${currentRouterFilter}`;
        }
        const res = await fetchAuth(url);
        const data = await res.json();

        const counts = data.counts || {};
        const finance = data.finance || {};

        // Update UI - Counts
        if (document.getElementById('cat-count')) document.getElementById('cat-count').innerText = counts.categories_count || 0;
        if (document.getElementById('pkg-count')) document.getElementById('pkg-count').innerText = counts.packages_count || 0;
        if (document.getElementById('voucher-count')) document.getElementById('voucher-count').innerText = counts.vouchers_count || 0;
        if (document.getElementById('bought-vouchers')) document.getElementById('bought-vouchers').innerText = counts.bought_vouchers_count || 0;
        if (document.getElementById('payments-count')) document.getElementById('payments-count').innerText = counts.payments_count || 0;

        // Transaction/Finance Aggregates
        if (document.getElementById('daily-trans')) document.getElementById('daily-trans').innerText = (finance.daily_revenue || 0).toLocaleString();
        if (document.getElementById('weekly-trans')) document.getElementById('weekly-trans').innerText = (finance.weekly_revenue || 0).toLocaleString();
        if (document.getElementById('monthly-trans')) document.getElementById('monthly-trans').innerText = (finance.monthly_revenue || 0).toLocaleString();
        if (document.getElementById('yearly-trans')) document.getElementById('yearly-trans').innerText = (finance.yearly_revenue || 0).toLocaleString();
        if (document.getElementById('total-trans')) document.getElementById('total-trans').innerText = (finance.gross_revenue || 0).toLocaleString();
        
        // Agent Sales
        if (document.getElementById('agent-sales')) {
            document.getElementById('agent-sales').innerText = (finance.settled_agent_sales || 0).toLocaleString();
        }

        // Balance Logic
        const totalBalEl = document.getElementById('total-wallet-balance');
        if (totalBalEl) {
            totalBalEl.innerText = Number(finance.total_balance || 0).toLocaleString() + ' UGX';
        }
        
        const balEl = document.getElementById('balance');
        if (balEl) {
            balEl.innerText = Number(finance.net_balance || 0).toLocaleString() + ' UGX';
        }

        // Subscription Banner Logic
        const banner = document.getElementById('expiryBanner');
        if (banner) {
            const hasExpiry = data.subscription && data.subscription.expiry;
            
            if (!hasExpiry) {
                banner.style.display = 'none';
                if (countdownInterval) clearInterval(countdownInterval);
            } else {
                const expiry = new Date(data.subscription.expiry);
                const now = new Date();
                const threeDays = 3 * 24 * 60 * 60 * 1000;
                const diff = expiry - now;

                if (countdownInterval) clearInterval(countdownInterval);

                if (expiry < now) {
                    // Expired - Red
                    banner.style.display = 'flex';
                    banner.style.background = 'var(--grad-red)'; 
                    banner.innerHTML = `<span class="banner-icon">⚠️</span> <strong>ALERT:</strong> Your Subscription has EXPIRED. <span class="renew-link">Click here to Renew</span>`;
                } else if (diff < threeDays) {
                    // Expiring Soon - Amber/Orange
                    banner.style.display = 'flex';
                    banner.style.background = 'var(--grad-orange)'; 
                    
                    const updateTimer = () => {
                        const currentNow = new Date();
                        const currentDiff = expiry - currentNow;
                        
                        if (currentDiff <= 0) {
                            clearInterval(countdownInterval);
                            loadStats();
                            return;
                        }
                        
                        const d = Math.floor(currentDiff / (1000 * 60 * 60 * 24));
                        const h = Math.floor((currentDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((currentDiff % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((currentDiff % (1000 * 60)) / 1000);
                        
                        banner.innerHTML = `<span class="banner-icon">⚠️</span> <strong>WARNING:</strong> Subscription expires in <strong>${d}d ${h}h ${m}m ${s}s</strong>. <span class="renew-link">Renew Now</span>`;
                    };
                    
                    updateTimer(); 
                    countdownInterval = setInterval(updateTimer, 1000);
                } else {
                    // Active and not soon - Hide
                    banner.style.display = 'none';
                }
            }
        }
    } catch (e) {
        console.error('LoadStats Error:', e);
        // Show server-down banner
        const banner = document.getElementById('expiryBanner');
        if (banner) {
            banner.style.display = 'flex';
            banner.style.background = 'linear-gradient(135deg, #c0392b, #e74c3c)';
            banner.innerHTML = `
                <span class="banner-icon">🔌</span>
                <strong>Server Offline</strong> — Unable to reach the server. Your data may be outdated.
                <span class="renew-link" onclick="loadStats()" style="margin-left:12px; cursor:pointer;">↺ Retry</span>
            `;
        }
        // Show dashes on all stat cards instead of stale/blank values
        ['cat-count','pkg-count','voucher-count','bought-vouchers','payments-count',
         'daily-trans','weekly-trans','monthly-trans','yearly-trans','total-trans'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '—';
        });
        const balEl = document.getElementById('balance');
        if (balEl) balEl.innerText = '— UGX';
        const totalBalEl = document.getElementById('total-wallet-balance');
        if (totalBalEl) totalBalEl.innerText = '— UGX';
    }
}

export async function loadSMSBalance() {
    try {
        const res = await fetchAuth('/api/admin/sms-balance');
        const data = await res.json();
        const el = document.getElementById('sms-balance');
        if (el) {
            if (data.balance !== undefined) {
                currentSMSBalance = Number(data.balance); // Update local state
                el.innerText = data.balance + ' SMS';
                el.className = 'stat-value';
            }
            else el.innerText = 'Err';
        }
    } catch (e) { console.error(e); }
}

// --- CATEGORIES ---
export async function fetchCategoriesList() {
    ui.showTableShimmer('categoriesTableBody', 2);
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/categories${routerQuery}`);
        const rows = await res.json();
        const tbody = document.getElementById('categoriesTableBody');
        if (!tbody) return;

        if (!Array.isArray(rows) || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: #888;">No categories found.</td></tr>';
            return;
        }

        let html = '';
        rows.forEach(r => {
            html += `
                <tr>
                    <td>
                        <span>${ui.escapeHtml(r.name)}</span>
                        <button class="hover-edit-btn" onclick="openEditCategoryModal(${r.id}, '${r.name.replace(/'/g, "\\'")}')" title="Edit">
                            <i class="fas fa-pen"></i>
                        </button>
                    </td>
                    <td><button class="btn-cancel btn-sm" onclick="deleteCategory(${r.id}, '${r.name.replace(/'/g, "\\'")}')">Delete</button></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e);
        ui.showAlert('Failed to load categories', 'error');
    }
}

export async function createCategory() {
    const name = document.getElementById('newCatName').value;
    if (!name) return ui.showAlert('Name required', 'error');

    if (!currentRouterFilter || currentRouterFilter === 'all') {
        return ui.showAlert('Please select a specific Router to create a Category.', 'info');
    }

    try {
        const res = await api.post('/api/admin/categories', { name, router_id: currentRouterFilter });
        if (res.ok) {
            ui.closeDashModal('addCategoryModal');
            ui.showAlert('Category created');
            document.getElementById('newCatName').value = '';
            fetchCategoriesList();
            loadStats();
        }
    } catch (e) { console.error(e); }
}

export async function submitEditCategory() {
    const id = document.getElementById('editCatId').value;
    const name = document.getElementById('editCatName').value;
    if (!name) return ui.showAlert('Name required', 'error');

    try {
        const res = await api.put(`/api/admin/categories/${id}`, { name });
        if (res.ok) {
            ui.closeDashModal('editCategoryModal');
            ui.showAlert('Category updated');
            fetchCategoriesList();
        } else {
            const d = await res.json();
            ui.showAlert(d.error || 'Update failed', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function deleteCategory(id, name) {
    if (await ui.showConfirm(`Delete category "${name}"?`)) {
        try {
            const res = await api.delete(`/api/admin/categories/${id}`);
            if (res.ok) {
                ui.showAlert('Category deleted');
                fetchCategoriesList();
                loadStats();
            }
        } catch (e) { console.error(e); }
    }
}


// --- PACKAGES ---
export async function fetchPackagesList() {
    ui.showTableShimmer('packagesTableBody', 6, [2, 3, 4, 5]);
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/packages${routerQuery}`);
        const pkgs = await res.json();
        const tbody = document.getElementById('packagesTableBody');
        if (!tbody) return;

        if (!Array.isArray(pkgs) || pkgs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #888;">No packages found.</td></tr>';
            return;
        }

        currentPackages = pkgs;

        let html = '';
        pkgs.forEach((p, index) => {
            const isActive = p.is_active === 1 || p.is_active === true;
            const statusBadge = isActive
                ? '<span class="badge bg-success" style="background:#4caf50; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Active</span>'
                : '<span class="badge bg-danger" style="background:#f44336; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Inactive</span>';

            const toggleTitle = isActive ? 'Deactivate' : 'Activate';
            const toggleIcon = isActive ? 'fa-toggle-on' : 'fa-toggle-off';
            const toggleColor = isActive ? '#4caf50' : '#888';
            const count = p.vouchers_count || 0;
            const countColor = count > 0 ? '#4caf50' : '#f44336';
            const voucherBadge = `<span style="color: ${countColor}; font-weight: bold;">${count}</span>`;

            html += `
                <tr onclick="viewPackageDetails(${index})" style="cursor: pointer;">
                    <td>
                        <span>${ui.escapeHtml(p.name)}</span>
                        <button class="hover-edit-btn" onclick="event.stopPropagation(); openEditPackageModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.price}, ${p.category_id})" title="Edit">
                            <i class="fas fa-pen"></i>
                        </button>
                    </td>
                    <td>${Number(p.price).toLocaleString()} UGX</td>
                    <td class="mobile-hide">${ui.escapeHtml(p.category_name || '-')}</td>
                    <td class="mobile-hide">${voucherBadge}</td>
                    <td class="mobile-hide">${statusBadge}</td>
                    <td class="mobile-hide">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button class="btn-icon" onclick="event.stopPropagation(); togglePackageStatus(${p.id})" title="${toggleTitle}" style="background:none; border:none; color:${toggleColor}; font-size:1.2rem; cursor:pointer;">
                                <i class="fas ${toggleIcon}"></i>
                            </button>
                            <button class="btn-icon" onclick="event.stopPropagation(); deletePackage(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Delete" style="background:none; border:none; color:#f44336; font-size:1.1rem; cursor:pointer;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e);
        ui.showAlert('Failed to load packages', 'error');
    }
}

export async function createPackage() {
    const price = document.getElementById('pkgPrice').value;
    const catId = document.getElementById('pkgCategory').value;
    const name = document.getElementById('pkgName').value;

    if (!name || !price || !catId) return ui.showAlert('All fields required', 'error');

    if (!currentRouterFilter || currentRouterFilter === 'all') {
        return ui.showAlert('Please select a specific Router to create a Package.', 'info');
    }

    try {
        const res = await api.post('/api/admin/packages', { name, price, category_id: catId, router_id: currentRouterFilter });
        if (res.ok) {
            ui.closeDashModal('addPackageModal');
            ui.showAlert('Package created');
            document.getElementById('pkgPrice').value = '';
            document.getElementById('pkgCategory').value = '';
            fetchPackagesList();
            loadStats();
        }
    } catch (e) { console.error(e); }
}

export async function submitEditPackage() {
    const id = document.getElementById('editPkgId').value;
    const name = document.getElementById('editPkgName').value;
    const price = document.getElementById('editPkgPrice').value;
    const catId = document.getElementById('editPkgCategory').value;

    if (!name || !price || !catId) return ui.showAlert('All fields required', 'error');

    try {
        const res = await api.put(`/api/admin/packages/${id}`, { name, price, category_id: catId });
        if (res.ok) {
            ui.closeDashModal('editPackageModal');
            ui.showAlert('Package updated');
            fetchPackagesList();
        } else {
            const d = await res.json();
            ui.showAlert(d.error || 'Update failed', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function togglePackageStatus(id) {
    try {
        const res = await fetchAuth(`/api/admin/packages/${id}/toggle`, { method: 'PATCH' });
        const data = await res.json();
        if (res.ok) {
            fetchPackagesList();
            ui.showAlert(`Package ${data.is_active ? 'Activated' : 'Deactivated'}`);
        } else {
            ui.showAlert(data.error || 'Failed to update status', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function deletePackage(id, name) {
    if (await ui.showConfirm(`Delete package "${name}"? This will also delete all associated vouchers.`)) {
        try {
            const res = await api.delete(`/api/admin/packages/${id}`);
            if (res.ok) {
                ui.showAlert('Package deleted');
                fetchPackagesList();
                loadStats();
            } else {
                const data = await res.json();
                ui.showAlert(data.error || 'Failed to delete package', 'error');
            }
        } catch (e) { 
            console.error(e);
            ui.showAlert('Connection error', 'error');
        }
    }
}

export async function loadCategoriesForSelect(targetId = 'pkgCategory', selectedCatId = null) {
    try {
        const routerQuery = currentRouterFilter !== 'all' ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/categories${routerQuery}`);
        const cats = await res.json();
        const sel = document.getElementById(targetId);
        if (sel) {
            sel.innerHTML = '<option value="">Select Category</option>';
            cats.forEach(c => {
                sel.innerHTML += `<option value="${c.id}" ${c.id == selectedCatId ? 'selected' : ''}>${ui.escapeHtml(c.name)}</option>`;
            });
        }
    } catch (e) { console.error(e); }
}

// --- VOUCHERS ---
export async function fetchVouchersList() {
    ui.showTableShimmer('vouchersTableBody', 2);
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/vouchers${routerQuery}`);
        const vouchers = await res.json();
        const tbody = document.getElementById('vouchersTableBody');
        if (!tbody) return;

        if (!Array.isArray(vouchers) || vouchers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: #888;">No available vouchers found.</td></tr>';
            const btn = document.getElementById('btnDeleteVouchers');
            if (btn) btn.classList.add('hidden');
            return;
        }

        let html = '';
        vouchers.forEach(v => {
            const uniqueId = `v-details-${v.id}`;
            html += `
                <tr onclick="toggleVoucherRow('${uniqueId}')" style="cursor: pointer;">
                    <td onclick="event.stopPropagation()">
                        <input type="checkbox" class="voucher-cb" value="${v.id}" onchange="checkVoucherSelection()">
                    </td>
                    <td style="font-weight: bold; color: #03a9f4;">
                        <span style="margin-right: 10px;">▶</span> ${v.code}
                    </td>
                </tr>
                <tr id="${uniqueId}" class="hidden detail-row">
                    <td></td>
                    <td>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
                            <div><strong>Package:</strong> ${v.package_name}</div>
                            <div><strong>Ref:</strong> <span class="detail-text-muted">${v.package_ref || '-'}</span></div>
                            <div><strong>Created:</strong> ${new Date(v.created_at).toLocaleDateString()}</div>
                            <div><strong>Status:</strong> Available</div>
                            <div style="grid-column: span 2;">
                                <strong>Comment:</strong> <span class="detail-text-muted">${v.comment || '-'}</span>
                            </div>
                            <div style="grid-column: span 2; margin-top: 5px;">
                                <button class="btn-cancel" style="font-size: 0.8rem; padding: 4px 8px;" onclick="deleteSingleVoucher(${v.id})">Delete</button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e);
        ui.showAlert('Failed to load vouchers', 'error');
    }
}

export async function importVouchers() {
    const pkgId = document.getElementById('importPackageId').value;
    const file = document.getElementById('voucherCsv').files[0];
    if (!pkgId || !file) return ui.showAlert('Select package and file', 'error');

    const formData = new FormData();
    formData.append('package_id', pkgId);
    formData.append('file', file);

    try {
        const res = await api.upload('/api/admin/vouchers/import', formData);
        const data = await res.json();
        if (res.ok) {
            ui.closeDashModal('importVoucherModal');
            ui.showAlert(`Imported ${data.count} vouchers`);
            document.getElementById('importPackageId').value = '';
            document.getElementById('voucherCsv').value = '';
            fetchVouchersList();
            loadStats();
        } else {
            ui.showAlert(data.error || 'Import Failed', 'error');
        }
    } catch (e) {
        console.error(e);
        ui.showAlert('Upload Error', 'error');
    }
}

export async function deleteSelectedVouchers() {
    const cbs = document.querySelectorAll('.voucher-cb:checked');
    const ids = Array.from(cbs).map(cb => cb.value);
    
    if (ids.length === 0) return;

    if (await ui.showConfirm(`Delete ${ids.length} vouchers?`)) {
        try {
            const res = await api.post('/api/admin/vouchers/batch-delete', { ids });

            if (res.ok) {
                ui.showAlert('Vouchers deleted');
                fetchVouchersList();
                loadStats();
                
                const btn = document.getElementById('btnDeleteVouchers');
                if (btn) btn.classList.add('hidden');
            } else {
                const data = await res.json();
                ui.showAlert(data.error || 'Failed to delete vouchers', 'error');
            }
        } catch (e) { 
            console.error(e);
            ui.showAlert('Connection error', 'error');
        }
    }
}

export async function deleteSingleVoucher(id) {
    if (await ui.showConfirm("Delete this voucher?")) {
        try {
            const res = await api.post('/api/admin/vouchers/batch-delete', { ids: [id] });
            
            if (res.ok) {
                ui.showAlert('Voucher deleted');
                fetchVouchersList();
                loadStats();
            } else {
                const data = await res.json();
                ui.showAlert(data.error || 'Failed to delete voucher', 'error');
            }
        } catch (e) { 
            console.error(e);
            ui.showAlert('Connection error', 'error');
        }
    }
}

export async function loadPackagesForImport() {
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/packages${routerQuery}`);
        const pkgs = await res.json();
        const sel = document.getElementById('importPackageId');
        if (sel) {
            sel.innerHTML = '<option value="">Select Package</option>';
            pkgs.forEach(p => sel.innerHTML += `<option value="${p.id}">${ui.escapeHtml(p.name)} - ${p.price}</option>`);
        }
        
        // Also load for sell modal while we are at it?
        const sellSel = document.getElementById('sellPackageId');
        if (sellSel) {
            sellSel.innerHTML = '<option value="">Select Package</option>';
             pkgs.forEach(p => sellSel.innerHTML += `<option value="${p.id}">${ui.escapeHtml(p.name)} (${p.price} UGX)</option>`);
        }
    } catch(e) { console.error(e); }
}

export async function loadPackagesForSell() {
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/packages${routerQuery}`);
        const pkgs = await res.json();
        const sellSel = document.getElementById('sellPackageId');
        if (sellSel) {
            sellSel.innerHTML = '<option value="">Select Package</option>';
            pkgs.forEach(p => sellSel.innerHTML += `<option value="${p.id}">${ui.escapeHtml(p.name)} (${p.price} UGX)</option>`);
        }
    } catch(e) { console.error(e); }
}

export async function submitSellVoucher() {
    const pkgId = document.getElementById('sellPackageId').value;
    const phone = document.getElementById('sellPhone').value;
    if (!pkgId || !phone) return ui.showAlert('Missing fields', 'error');

    // Client-side Balance Check
    // We assume 1 SMS cost ~ 35-50 UGX or 1 Credit. 
    // If balance is strictly 0 or very low, we warn user.
    // However, exact cost is server-side. Let's safeguard against explicit 0.
    if (currentSMSBalance < 35) {
        ui.showAlert(`Insufficient SMS Balance (${currentSMSBalance}). Please Topup.`, 'error');
        // Optional: Open Buy SMS Modal automatically?
        // ui.openDashModal('buySMSModal'); 
        return;
    }

    try {
        const res = await api.post('/api/admin/sell-voucher', { package_id: pkgId, phone_number: phone });
        const data = await res.json();
        
        if (res.ok) {
            ui.closeDashModal('sellVoucherModal');
            loadStats();
            loadSMSBalance(); // Refresh balance
            document.getElementById('sellPhone').value = '';
            document.getElementById('sellPackageId').value = '';

            const succMsg = document.getElementById('successMessage');
            if (succMsg) {
                succMsg.innerHTML = `Voucher <strong>${data.voucher.code}</strong> has been sent successfully to <strong>${ui.escapeHtml(phone)}</strong>.`;
            }
            ui.openDashModal('successModal');
        } else {
            // Enhanced Error Handling
            if (res.status === 400 && (data.error || '').toLowerCase().includes('balance')) {
                 ui.showAlert(`Insufficient SMS Balance. Please Topup.`, 'error');
            } else {
                 ui.showAlert(data.error || 'Failed to sell', 'error');
            }
        }
    } catch (e) { console.error(e); }
}

// --- PAYMENTS ---
export async function fetchPaymentsList() {
    ui.showTableShimmer('paymentsTableBody', 8, [3, 4, 5, 6, 7]);
    try {
        let url = '/api/admin/transactions';
        if (currentRouterFilter) {
            url += `?router_id=${currentRouterFilter}`;
        }
        const res = await fetchAuth(url);
        const txs = await res.json();
        const tbody = document.getElementById('paymentsTableBody');
        if (!tbody) return;

        if (!Array.isArray(txs) || txs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: #888;">No transactions found.</td></tr>';
            return;
        }

        currentTransactions = txs;

        let html = '';
        txs.forEach((t, index) => {
            const statusColor = t.status === 'success' ? '#4caf50' : '#f44336';
            const method = t.payment_method === 'manual' ? '<span class="badge bg-secondary">Manual</span>' : '<span class="badge bg-primary">MoMo</span>';
            const customerName = t.customer_name || '-';

            html += `
                <tr onclick="viewTransactionDetails(${index})" style="cursor: pointer;">
                    <td>${new Date(t.created_at).toLocaleString()}</td>
                    <td>${ui.escapeHtml(t.phone_number)}</td>
                    <td>${ui.escapeHtml(customerName)}</td>
                    <td class="mobile-hide">${Number(t.amount).toLocaleString()} UGX</td>
                    <td class="mobile-hide">${ui.escapeHtml(t.package_name || '-')}</td>
                    <td class="mobile-hide">${method}</td>
                    <td class="mobile-hide" style="color: ${statusColor}; font-weight: 500;">${ui.escapeHtml(t.status.toUpperCase())}</td>
                    <td class="mobile-hide"><small style="color:#aaa">${ui.escapeHtml(t.transaction_ref)}</small></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e); 
        ui.showAlert('Failed to load transaction history', 'error');
    }
}

export async function initiateWithdrawal() {
    const amount = document.getElementById('withdrawAmount').value;
    const phone = document.getElementById('withdrawPhone').value;

    if (!amount || !phone) {
        return ui.showAlert('Please enter amount and phone number', 'error');
    }

    const btn = document.getElementById('btnWithdrawNext');
    const originalText = btn.innerText;
    btn.innerText = 'Sending OTP...';
    btn.disabled = true;

    try {
        const res = await api.post('/api/admin/withdraw/initiate', { amount, phone_number: phone });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('withdrawStep1').classList.add('hidden');
            document.getElementById('withdrawStep2').classList.remove('hidden');
            document.getElementById('btnWithdrawNext').classList.add('hidden');
            document.getElementById('btnWithdrawConfirm').classList.remove('hidden');
            ui.showAlert('OTP sent to your email!', 'success');
        } else {
            ui.showAlert(data.error || 'Failed to initiate', 'error');
        }
    } catch (e) {
        console.error(e);
        ui.showAlert('Connection Error', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

export async function submitWithdrawal() {
    const amount = document.getElementById('withdrawAmount').value;
    const phone = document.getElementById('withdrawPhone').value;
    const desc = document.getElementById('withdrawDesc').value;
    const otp = document.getElementById('withdrawOTP').value;

    if (!otp) return ui.showAlert('Please enter the OTP code', 'error');

    const btn = document.getElementById('btnWithdrawConfirm');
    if (btn) {
        btn.innerText = 'Processing...';
        btn.disabled = true;
    }

    try {
        const res = await api.post('/api/admin/withdraw', { amount, phone_number: phone, description: desc, otp });
        const data = await res.json();

        if (res.ok) {
            ui.closeDashModal('withdrawModal');
            ui.showAlert('Withdrawal Successful!', 'success');
            document.getElementById('withdrawAmount').value = '';
            document.getElementById('withdrawPhone').value = '';
            document.getElementById('withdrawDesc').value = '';
            document.getElementById('withdrawOTP').value = '';
            loadStats();
            fetchPaymentsList();
        } else {
            ui.showAlert(data.error || 'Withdrawal Failed', 'error');
        }
    } catch (e) {
        ui.showAlert('Connection Error', 'error');
    } finally {
        if (btn) {
            btn.innerText = 'Confirm & Withdraw';
            btn.disabled = false;
        }
    }
}

export function resetWithdrawalModal() {
    document.getElementById('withdrawStep1').classList.remove('hidden');
    document.getElementById('withdrawStep2').classList.add('hidden');
    document.getElementById('btnWithdrawNext').classList.remove('hidden');
    document.getElementById('btnWithdrawConfirm').classList.add('hidden');
    
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawPhone').value = '';
    document.getElementById('withdrawDesc').value = '';
    document.getElementById('withdrawOTP').value = '';
}

// --- SMS LOGS ---
export async function fetchSMSLogs() {
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/sms-logs${routerQuery}`);
        const logs = await res.json();
        const tbody = document.getElementById('smsTableBody');
        if (!tbody) return;

        if (!Array.isArray(logs) || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #888;">No SMS logs found.</td></tr>';
            return;
        }

        let html = '';
        logs.forEach(l => {
            const statusColor = l.status === 'sent' ? '#4caf50' : (l.status === 'pending' ? '#ff9800' : '#f44336');
            html += `
                <tr>
                    <td>${new Date(l.created_at).toLocaleString()}</td>
                    <td>${ui.escapeHtml(l.phone_number)}</td>
                    <td>${ui.escapeHtml(l.message)}</td>
                    <td style="color: ${statusColor}; font-weight: 500;">${ui.escapeHtml(l.status.toUpperCase())}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e);
        ui.showAlert('Failed to load SMS logs', 'error');
    }
}

export function calculateSMSPreview(amount) {
    const preview = document.getElementById('smsPreview');
    if (!preview) return;
    if (!amount || amount < 500) {
        preview.innerText = 'Unknown SMS count';
        return;
    }
    const count = Math.floor(amount / 35); // Re-verified logic
    preview.innerText = `~${count} SMS Credits`;
}

export async function submitBuySMS() {
    const phone = document.getElementById('smsPhone').value;
    const amount = document.getElementById('smsAmount').value;

    if (!phone || !amount) return ui.showAlert('Please fill in all fields', 'error');

    const btn = document.querySelector('#buySMSModal .btn-submit');
    const originalText = btn ? btn.innerText : 'Pay & Topup';
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Processing...';
    }

    try {
        const res = await api.post('/api/admin/buy-sms', { phone_number: phone, amount });
        const data = await res.json();

        if (res.ok) {
            const progContainer = document.getElementById('smsProgressBarContainer');
            if (progContainer) progContainer.style.display = 'block';
            let bar = document.getElementById('smsProgressBar');
            if (bar) bar.style.width = '20%';

            pollPaymentStatus(data.reference, (status) => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
                if (status === 'SUCCESS') {
                    if (bar) bar.style.width = '100%';
                    ui.showAlert('SMS Credits Added Successfully!', 'success');
                    ui.closeDashModal('buySMSModal');
                    loadSMSBalance();
                    fetchSMSLogs();
                    if (progContainer) progContainer.style.display = 'none';
                    if (bar) bar.style.width = '0%';
                } else if (status === 'FAILED') {
                    ui.showAlert('Payment Failed', 'error');
                } else {
                    ui.showAlert('Payment Timeout', 'info');
                    ui.closeDashModal('buySMSModal');
                }
            });
        } else {
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
            ui.showAlert(data.error || 'Failed to initiate', 'error');
        }
    } catch (e) { console.error(e); }
}

function pollPaymentStatus(reference, callback) {
    let attempts = 0;
    const maxAttempts = 60;
    const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            callback('TIMEOUT');
            return;
        }

        try {
            const res = await api.post('/api/check-payment-status', { transaction_ref: reference });
            if (!res.ok) return;
            const data = await res.json();

            if (data.status === 'SUCCESS') {
                clearInterval(interval);
                callback('SUCCESS');
            } else if (data.status === 'FAILED') {
                clearInterval(interval);
                callback('FAILED');
            }
        } catch (e) { console.error(e); }
    }, 3000);
}

// --- ROUTERS ---
export async function fetchRouters() {
    try {
        const res = await fetchAuth('/api/admin/routers/stats');
        
        if (!res.ok) {
            console.error('Failed to fetch routers:', res.status);
            return;
        }

        const routers = await res.json();

        const tbody = document.getElementById('routersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!Array.isArray(routers) || routers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #aaa;">No routers found.</td></tr>';
            return;
        }

        let html = '';
        routers.forEach(router => {
            const safeName = String(router.name || '').replace(/'/g, "\\'");
            const safeUrl = String(router.mikhmon_url || '').replace(/'/g, "\\'");
            const safeHost = String(router.api_host || '').replace(/'/g, "\\'");
            const safeUser = String(router.api_user || '').replace(/'/g, "\\'");
            const safePass = String(router.api_pass || '').replace(/'/g, "\\'");
            const safePort = router.api_port || 8728;
            
            html += `
                <tr>
                    <td>
                        <div style="font-weight: bold; color: white;">${ui.escapeHtml(router.name)}</div>
                        <div style="font-size: 0.75rem; color: #aaa; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                            <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ui.escapeHtml(router.mikhmon_url)}</span>
                            <button class="hover-edit-btn" style="background:none; border:none; color:#666; cursor:pointer;" onclick="openEditRouterModal(${router.id}, '${safeName}', '${safeUrl}', '${safeHost}', '${safeUser}', '${safePass}', ${safePort})" title="Edit">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </td>
                    <td style="font-weight: bold; color: #4caf50;">
                        ${Number(router.total_revenue || 0).toLocaleString()} UGX
                    </td>
                    <td style="color: ${router.daily_revenue > 0 ? '#ff9800' : '#888'};">
                        ${Number(router.daily_revenue || 0).toLocaleString()} UGX
                    </td>
                    <td style="text-align: center;">
                        <div class="badge ${router.voucher_stock < 10 ? 'bg-danger' : 'bg-success'}" style="font-size: 0.9rem; padding: 4px 10px;">
                            ${router.voucher_stock}
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn-success btn-sm" onclick="openMikhmon('${safeUrl}', '${safeName}')">Manage</button>
                            <button class="btn-cancel btn-sm" onclick="deleteRouter(${router.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error('Error fetching routers:', e);
        const tbody = document.getElementById('routersTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading routers.</td></tr>';
    }
}

export async function submitAddRouter() {
    const name = document.getElementById('routerName').value;
    const url = document.getElementById('routerUrl').value;
    const api_host = document.getElementById('routerApiHost').value;
    const api_user = document.getElementById('routerApiUser').value;
    const api_pass = document.getElementById('routerApiPass').value;
    const api_port = document.getElementById('routerApiPort').value;

    if (!name || (!url && !api_host)) return ui.showAlert('Please fill in name and either URL or Host', 'error');

    try {
        const res = await api.post('/api/admin/routers', { 
            name, 
            mikhmon_url: url,
            api_host: api_host || null,
            api_user: api_user || null,
            api_pass: api_pass || null,
            api_port: api_port || 8728
        });
        if (res.ok) {
            ui.showAlert('Router added successfully', 'success');
            ui.closeDashModal('addRouterModal');
            document.getElementById('routerName').value = '';
            document.getElementById('routerUrl').value = '';
            document.getElementById('routerApiHost').value = '';
            document.getElementById('routerApiUser').value = '';
            document.getElementById('routerApiPass').value = '';
            document.getElementById('routerApiPort').value = '8728';
            fetchRouters();
        } else {
            const err = await res.json();
            ui.showAlert(err.error || 'Failed to add router', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function submitEditRouter() {
    const id = document.getElementById('editRouterId').value;
    const name = document.getElementById('editRouterName').value;
    const url = document.getElementById('editRouterUrl').value;
    const api_host = document.getElementById('editRouterApiHost').value;
    const api_user = document.getElementById('editRouterApiUser').value;
    const api_pass = document.getElementById('editRouterApiPass').value;
    const api_port = document.getElementById('editRouterApiPort').value;

    if (!name || (!url && !api_host)) return ui.showAlert('Please fill in name and either URL or Host', 'error');

    try {
        const res = await api.put(`/api/admin/routers/${id}`, { 
            name, 
            mikhmon_url: url,
            api_host: api_host || null,
            api_user: api_user || null,
            api_pass: api_pass || null,
            api_port: api_port || 8728
        });
        if (res.ok) {
            ui.showAlert('Router updated');
            ui.closeDashModal('editRouterModal');
            fetchRouters();
        } else {
            const d = await res.json();
            ui.showAlert(d.error || 'Update failed', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function deleteRouter(id) {
    const confirmed = await ui.showConfirm('Delete this router link?');
    if (!confirmed) return;
    try {
        const res = await api.delete(`/api/admin/routers/${id}`);
        if (res.ok) {
            ui.showAlert('Router deleted');
            fetchRouters();
        } else {
            ui.showAlert('Failed to delete', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function openMikhmon(baseUrl, routerName = null) {
    try {
        const res = await fetchAuth('/api/admin/mikhmon-token');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Auth failed');
        const token = data.token;

        // Construct URL carefully. 
        let urlObj = new URL(baseUrl);
        let path = urlObj.pathname;
        if (!path.endsWith('/')) path += '/';
        
        let redirectUrl = `${urlObj.origin}${path}autologin.php?token=${token}`;
        
        // If we have a router name or it's in the original URL, pass it as session
        let session = routerName || urlObj.searchParams.get('session');
        if (session) {
            redirectUrl += `&session=${encodeURIComponent(session)}`;
        }
        
        window.open(redirectUrl, '_blank');
    } catch (e) {
        console.error('Mikhmon Auto-Login Error:', e);
        window.open(baseUrl, '_blank');
    }
}


// --- OTHER ---
export async function fetchDownloadsList() {
    const tbody = document.getElementById('downloadsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Fetching...</td></tr>';

    try {
        const res = await fetchAuth('/api/admin/resources');
        const files = await res.json();
        if (!tbody) return;

        if (!Array.isArray(files) || files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#ccc;">No files available yet.</td></tr>';
            return;
        }

        let html = '';
        files.forEach(f => {
            html += `
                <tr>
                    <td style="color:white; font-weight:500;">${ui.escapeHtml(f.title || 'Untitled')}</td>
                    <td style="color:#aaa;">${ui.escapeHtml(f.description || '-')}</td>
                    <td>
                        <a href="${f.file_path}" download target="_blank" class="btn-submit" style="text-decoration:none; display:inline-block; padding: 6px 12px; font-size: 0.8rem;">Download</a>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e);
        ui.showAlert('Failed to load downloads', 'error');
        if(tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Error loading files</td></tr>';
    }
}

export async function fetchBoughtVouchersList() {
    ui.showTableShimmer('boughtVouchersTableBody', 6, [0, 3, 4]);
    try {
        const routerQuery = currentRouterFilter ? `?router_id=${currentRouterFilter}` : '';
        const res = await fetchAuth(`/api/admin/transactions${routerQuery}`);
        const all = await res.json();
        const sales = all.filter(t => t.status === 'success' && t.payment_method !== 'manual' && !t.transaction_ref.startsWith('SMS-'));
        
        currentBoughtVouchers = sales;
        renderBoughtVouchersTable(sales);
    } catch (e) { 
        console.error(e); 
        ui.showAlert('Failed to load bought vouchers', 'error');
    }
}

function renderBoughtVouchersTable(sales) {
    const tbody = document.getElementById('boughtVouchersTableBody');
    if (!tbody) return;
    
    if (sales.length === 0) {
         tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#ccc;">No vouchers found.</td></tr>';
         return;
    }

    let html = '';
    sales.forEach((t, index) => {
        const customerName = t.customer_name || '-';
        html += `
            <tr onclick="viewGenericDetails('boughtVouchers', ${index})" style="cursor: pointer;">
                <td class="mobile-hide" style="color:#aaa;">${new Date(t.created_at).toLocaleString()}</td>
                <td style="font-weight:500;">${ui.escapeHtml(t.phone_number)}</td>
                <td>${ui.escapeHtml(customerName)}</td>
                <td class="mobile-hide"><span class="badge badge-blue">${ui.escapeHtml(t.package_name || 'Unknown')}</span></td>
                <td class="mobile-hide">${t.amount ? t.amount.toLocaleString() : 0}</td>
                <td><span style="font-family:monospace; background:#333; padding:2px 5px; border-radius:4px;">${t.voucher_code ? ui.escapeHtml(t.voucher_code) : 'Auto-Assigned'}</span></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

export function filterBoughtVouchers(query) {
    if (!currentBoughtVouchers) return;
    const q = (query || '').toLowerCase();
    const filtered = currentBoughtVouchers.filter(v => 
        (v.phone_number || '').toLowerCase().includes(q) ||
        (v.customer_name || '').toLowerCase().includes(q) ||
        (v.voucher_code || '').toLowerCase().includes(q) ||
        (v.transaction_ref || '').toLowerCase().includes(q)
    );
    renderBoughtVouchersTable(filtered);
}


export async function fetchMyTransactions() {
    ui.showTableShimmer('myTransactionsTableBody', 6, [1, 3, 4, 5]);
    try {
        const res = await fetchAuth('/api/admin/my-transactions');
        const rows = await res.json();
        const tbody = document.getElementById('myTransactionsTableBody');
        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #888;">No transactions found.</td></tr>';
            return;
        }
        currentMyTransactions = rows;

        let html = '';
        rows.forEach((r, index) => {
             let typeBadge = `<span class="badge bg-secondary">${ui.escapeHtml(r.type)}</span>`;
             if (r.type === 'Withdrawal') typeBadge = '<span class="badge bg-danger">Withdrawal</span>';
             if (r.type === 'Subscription') typeBadge = '<span class="badge bg-warning">Subscription</span>';

             let statusColor = '#888';
             if (r.status === 'success') statusColor = '#4caf50';
             else if (r.status === 'failed') statusColor = '#f44336';
             else if (r.status === 'pending') statusColor = '#ff9800';

             html += `
                <tr onclick="viewGenericDetails('myTransactions', ${index})" style="cursor: pointer;">
                    <td>${new Date(r.created_at).toLocaleString()}</td>
                    <td class="mobile-hide">${typeBadge}</td>
                    <td style="color: #ffffff; font-weight: bold;">${Number(r.amount).toLocaleString()} UGX</td>
                    <td class="mobile-hide" style="color: ${statusColor}; font-weight: 500;">${ui.escapeHtml((r.status || 'success').toUpperCase())}</td>
                    <td class="mobile-hide">${ui.escapeHtml(r.description || '-')}</td>
                    <td class="mobile-hide"><small style="color:#aaa">${ui.escapeHtml(r.reference || '-')}</small></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error(e); 
        ui.showAlert('Failed to load my transactions', 'error');
    }
}

export async function submitChangePass() {
    const current = document.getElementById('currentPass').value;
    const newP = document.getElementById('newPass').value;
    const confirmP = document.getElementById('confirmPass').value;

    if (newP !== confirmP) return ui.showAlert('Passwords mismatch', 'error');

    try {
        const res = await api.post('/api/admin/change-password', { currentPassword: current, newPassword: newP });
        if (res.ok) {
            ui.closeDashModal('changePassModal');
            ui.showAlert('Password changed');
        } else {
            const d = await res.json();
            ui.showAlert(d.error, 'error');
        }
    } catch (e) { console.error(e); }
}

export async function startSubscriptionRenewal() {
    const phone = document.getElementById('renewPhone').value;
    const months = document.getElementById('renewMonths').value;
    const amount = (months == 1) ? 20000 : (months == 3) ? 60000 : (months == 6) ? 120000 : 240000;

    if (!phone) return ui.showAlert('Enter Phone', 'error');

    try {
        ui.showAlert('Initiating Payment...', 'info');
        const res = await api.post('/api/admin/renew-subscription', { phone_number: phone, months, amount });
        const data = await res.json();
        if (res.ok) {
            ui.showAlert('Check your phone to approve payment', 'success');
            ui.closeDashModal('subscriptionModal');
        } else {
            ui.showAlert(data.error || 'Failed', 'error');
        }
    } catch (e) { console.error(e); }
}

export async function openCheckSiteModal() {
    ui.openDashModal('checkSiteModal');
    const list = document.getElementById('checkSiteRouterList');
    if (list) list.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">Fetching routers...</div>';

    try {
         const res = await fetchAuth('/api/admin/routers');
         const routers = await res.json();
         if (list) {
            list.innerHTML = '';
            if (!routers || routers.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">No routers found.</div>';
                return;
            }
            routers.forEach(r => {
                 const btn = document.createElement('button');
                 btn.className = 'btn-router-select';
                 // Styles are in CSS or inline
                 btn.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: #2a2a2a; border: 1px solid #333; border-radius: 10px; color: white; cursor: pointer; text-align: left; width: 100%; margin-bottom: 8px;";
                 btn.onclick = () => {
                     ui.closeDashModal('checkSiteModal');
                     openMikhmon(r.mikhmon_url, r.name);
                 };
                 btn.innerHTML = `<div><strong>${ui.escapeHtml(r.name)}</strong></div> <i class="fas fa-chevron-right"></i>`;
                 list.appendChild(btn);
            });
         }
    } catch (e) { console.error(e); }
}

// --- AGENT MANAGEMENT ---

export async function fetchAgentsList() {
    try {
        const res = await fetchAuth('/api/admin/agents');
        const data = await res.json();

        if (!res.ok) {
            console.error('Fetch Agents Error API:', data.error);
            const tbody = document.getElementById('agentsTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 20px;">
                    <i class="fas fa-exclamation-triangle"></i> Error: ${ui.escapeHtml(data.error || 'Failed to load agents')}<br>
                    <small>Make sure the database tables are updated.</small>
                </td></tr>`;
            }
            return;
        }

        const agents = data;
        const tbody = document.getElementById('agentsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if (agents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No agents found. Click "+ Add" to create one.</td></tr>';
            return;
        }

        agents.forEach(agent => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${ui.escapeHtml(agent.username)}</strong></td>
                <td>${ui.escapeHtml(agent.phone_number || '-')}</td>
                <td><span class="badge ${agent.stock_count > 0 ? 'badge-ongoing' : 'badge-failed'}">${agent.stock_count}</span></td>
                <td><strong>${Number(agent.total_sales).toLocaleString()}</strong></td>
                <td style="color: #ef4444;"><strong>${Number(agent.unsettled_amount).toLocaleString()}</strong></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-action btn-edit" title="Assign Stock" onclick="openAssignVoucherModal(${agent.id}, '${ui.escapeHtml(agent.username)}')">
                            <i class="fas fa-plus-circle"></i> Assign
                        </button>
                        <button class="btn-action btn-delete" title="Settle" onclick="settleAgentAccount(${agent.id}, '${ui.escapeHtml(agent.username)}', ${agent.unsettled_amount})">
                            <i class="fas fa-check-double"></i> Settle
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Fetch Agents Error:', err);
    }
}

export async function createAgent() {
    const username = document.getElementById('newAgentUsername').value;
    const password = document.getElementById('newAgentPassword').value;
    const phone = document.getElementById('newAgentPhone').value;

    if (!username || !password) return ui.showAlert('Username and Password are required', 'error');

    try {
        const res = await fetchAuth('/api/admin/agents', {
            method: 'POST',
            body: JSON.stringify({ username, password, phone_number: phone })
        });
        const data = await res.json();

        if (res.ok) {
            ui.showAlert('Agent created successfully');
            ui.closeDashModal('addAgentModal');
            document.getElementById('newAgentUsername').value = '';
            document.getElementById('newAgentPassword').value = '';
            document.getElementById('newAgentPhone').value = '';
            fetchAgentsList();
        } else {
            ui.showAlert(data.error || 'Failed to create agent', 'error');
        }
    } catch (err) {
        ui.showAlert('Server error', 'error');
    }
}

export async function openAssignVoucherModal(id, name) {
    document.getElementById('assignAgentId').value = id;
    document.getElementById('assignAgentName').innerText = name;
    
    // Load packages into select
    const select = document.getElementById('assignPackageId');
    if (select) {
        select.innerHTML = '<option value="">Select Package</option>';
        try {
            const res = await fetchAuth('/api/admin/packages');
            const packages = await res.json();
            packages.forEach(pkg => {
                const opt = document.createElement('option');
                opt.value = pkg.id;
                opt.innerText = `${pkg.name} (${pkg.price} UGX) - Stock: ${pkg.vouchers_count}`;
                select.appendChild(opt);
            });
            ui.openDashModal('assignVouchersModal');
        } catch (e) { console.error(e); }
    }
}

export async function submitAssignVouchers() {
    const agentId = document.getElementById('assignAgentId').value;
    const packageId = document.getElementById('assignPackageId').value;
    const quantity = document.getElementById('assignQuantity').value;

    if (!packageId || !quantity || quantity <= 0) return ui.showAlert('Please select package and valid quantity', 'error');

    try {
        const res = await fetchAuth(`/api/admin/agents/${agentId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ package_id: packageId, quantity })
        });
        const data = await res.json();

        if (res.ok) {
            ui.showAlert(data.message);
            ui.closeDashModal('assignVouchersModal');
            document.getElementById('assignQuantity').value = '';
            fetchAgentsList();
        } else {
            ui.showAlert(data.error || 'Failed to assign vouchers', 'error');
        }
    } catch (err) { ui.showAlert('Server error', 'error'); }
}

export async function settleAgentAccount(agentId, name, amount) {
    if (amount <= 0) return ui.showAlert('Balance is zero. Nothing to settle.', 'info');

    const confirmed = await ui.showConfirm(`Are you sure you want to settle ${amount.toLocaleString()} UGX for ${name}? This marks all their current sales as paid to you.`);
    if (!confirmed) return;

    try {
        const res = await fetchAuth(`/api/admin/agents/${agentId}/settle`, { method: 'POST' });
        if (res.ok) {
            ui.showAlert('Agent account settled!');
            fetchAgentsList();
        } else {
            const data = await res.json();
            ui.showAlert(data.error || 'Failed to settle account', 'error');
        }
    } catch (err) { ui.showAlert('Server error', 'error'); }
}

export function performLogout() {
    fetchAuth('/api/auth/logout', { method: 'POST' }).catch(console.error);
    localStorage.removeItem('wipay_token');
    localStorage.removeItem('wipay_user');
    window.location.href = 'login_dashboard.html';
}

// --- ADS MANAGEMENT ---

export async function fetchAds() {
    ui.showTableShimmer('adsTableBody', 5, [1, 3]);
    try {
        const res = await fetchAuth('/api/admin/ads');
        const ads = await res.json();
        const tbody = document.getElementById('adsTableBody');
        if (!tbody) return;

        if (!Array.isArray(ads) || ads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #888;">No ads found.</td></tr>';
            return;
        }

        let html = '';
        ads.forEach(ad => {
            const statusColor = ad.status === 'approved' ? '#4caf50' : (ad.status === 'pending' ? '#ff9800' : '#f44336');
            html += `
                <tr>
                    <td>
                        <a href="${ad.image_url}" target="_blank">
                            <img src="${ad.image_url}" style="height: 40px; border-radius: 4px; border: 1px solid #333;" alt="Ad Preview">
                        </a>
                    </td>
                    <td class="mobile-hide">
                        <span style="font-size: 0.85rem; color: #888;">${ui.escapeHtml(ad.target_url || '-')}</span>
                    </td>
                    <td>
                        <span class="badge" style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
                            ${ad.status.toUpperCase()}
                        </span>
                    </td>
                    <td class="mobile-hide" style="font-size: 0.85rem; color: #888;">
                        ${new Date(ad.created_at).toLocaleDateString()}
                    </td>
                    <td>
                        <button class="btn-cancel btn-sm" onclick="deleteAd(${ad.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error('Fetch Ads Error:', e);
        ui.showAlert('Failed to load ads', 'error');
    }
}

export async function uploadAd() {
    const fileInput = document.getElementById('adFile');
    const targetUrlInput = document.getElementById('adTargetUrl');
    const file = fileInput.files[0];
    const target_url = targetUrlInput.value;

    if (!file) return ui.showAlert('Please select a PNG file', 'error');
    if (file.type !== 'image/png') return ui.showAlert('Only PNG files are allowed', 'error');

    const formData = new FormData();
    formData.append('ad_image', file);
    if (target_url) formData.append('target_url', target_url);

    try {
        ui.showAlert('Uploading...', 'info');
        const res = await api.upload('/api/admin/ads/upload', formData);
        const data = await res.json();

        if (res.ok) {
            ui.showAlert(data.message, 'success');
            ui.closeDashModal('uploadAdModal');
            fileInput.value = '';
            targetUrlInput.value = '';
            fetchAds();
        } else {
            ui.showAlert(data.error || 'Upload failed', 'error');
        }
    } catch (e) {
        console.error('Upload Ad Error:', e);
        ui.showAlert('Connection Error', 'error');
    }
}

export async function deleteAd(id) {
    if (await ui.showConfirm('Are you sure you want to delete this ad?')) {
        try {
            const res = await api.delete(`/api/admin/ads/${id}`);
            if (res.ok) {
                ui.showAlert('Ad deleted successfully');
                fetchAds();
            } else {
                const data = await res.json();
                ui.showAlert(data.error || 'Delete failed', 'error');
            }
        } catch (e) {
            console.error('Delete Ad Error:', e);
            ui.showAlert('Connection Error', 'error');
        }
    }
}


