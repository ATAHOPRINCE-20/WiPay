/**
 * Charts Module - Handles transaction trends and analytics visualization
 */

import { fetchAuth } from './api.js';

let transactionChartInstance = null;

export async function loadAnalytics(period = 'weekly', routerId = "") {
    // Update Buttons UI
    ['btnWeekly', 'btnMonthly', 'btnYearly'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.background = (id.toLowerCase().includes(period)) ? 'var(--primary-color)' : 'var(--input-bg)';
            btn.style.color = (id.toLowerCase().includes(period)) ? '#fff' : 'var(--text-main)';
        }
    });

    try {
        let url = `/api/admin/analytics/transactions?period=${period}`;
        if (routerId) url += `&router_id=${routerId}`;
        
        const res = await fetchAuth(url);
        const data = await res.json();

        if (!Array.isArray(data)) return;

        const labels = data.map(d => d.label);
        const amounts = data.map(d => Number(d.total_amount));
        const counts = data.map(d => Number(d.count));

        renderChart(labels, amounts, counts);
    } catch (e) {
        console.error('Analytics Error:', e);
    }
}

function renderChart(labels, amounts, counts) {
    const ctx = document.getElementById('transactionChart');
    if (!ctx) return;

    if (transactionChartInstance) {
        transactionChartInstance.destroy();
    }

    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#b0b3b8' : '#4b5563';

    transactionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue (UGX)',
                    data: amounts,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y',
                    fill: true
                },
                {
                    label: 'Transactions',
                    data: counts,
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor } },
                y: { type: 'linear', display: true, position: 'left', grid: { color: gridColor }, ticks: { color: textColor } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: textColor } }
            }
        }
    });
}
