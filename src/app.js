/* Bay Area Food Map — App Logic */
/* global functions are used by onclick handlers in index.html */

let allRestaurants = [];
let filteredRestaurants = [];
let currentFilters = { cuisine: 'all', region: 'all' };
let currentSort = 'engagement';

// ─── Data loading ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const v = '?v=' + Date.now();

        // Load slim index first for fast render, fall back to full DB
        let data = null;
        try {
            const r = await fetch('data/restaurant_database_index.json' + v);
            if (r.ok) data = await r.json();
        } catch (e) { /* ignore, fallback below */ }

        if (!data) {
            const r = await fetch('data/restaurant_database.json' + v);
            if (!r.ok) throw new Error('Failed to load data');
            data = await r.json();
        }

        allRestaurants = (data.restaurants || []).filter(
            r => r._status !== 'duplicate_merged' && r._status !== 'rejected'
        );
        filteredRestaurants = [...allRestaurants];

        renderRestaurants();

        // Show last pipeline run timestamp
        try {
            const sr = await fetch('data/.pipeline_state.json' + v);
            if (sr.ok) {
                const state = await sr.json();
                if (state.last_run) {
                    const d = new Date(state.last_run);
                    const fmt = d.toLocaleDateString('zh-CN', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    });
                    const el = document.getElementById('last-updated');
                    if (el) el.textContent = `· 更新于 ${fmt}`;
                }
            }
        } catch (e) { /* non-critical */ }

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
    } catch (e) {
        console.error('Load error:', e);
        alert('加载失败: ' + e.message + '\n请按F12查看控制台详细错误');
    }
});

// ─── Filtering & sorting ──────────────────────────────────────────────────────

function applyFilter(type, value) {
    currentFilters[type] = value;
    filterAndRender();
}

function applySort(value) {
    currentSort = value;
    filterAndRender();
}

function clearFilters() {
    currentFilters = { cuisine: 'all', region: 'all' };
    currentSort = 'engagement';
    document.getElementById('cuisine-filter').value = 'all';
    document.getElementById('region-filter').value = 'all';
    document.getElementById('sort-filter').value = 'engagement';
    document.getElementById('search-input').value = '';
    filterAndRender();
}

function applySearch() {
    filterAndRender();
}

function filterAndRender() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();

    filteredRestaurants = allRestaurants.filter(r => {
        if (currentFilters.cuisine !== 'all' && r.cuisine !== currentFilters.cuisine) return false;
        if (currentFilters.region !== 'all' && r.region !== currentFilters.region) return false;
        if (query) {
            return [r.name, r.cuisine, r.city, r.area, r.address].some(
                f => f && f.toLowerCase().includes(query)
            ) || (r.recommendations || []).some(d => d.toLowerCase().includes(query));
        }
        return true;
    });

    filteredRestaurants.sort((a, b) => {
        if (currentSort === 'engagement') return (b.total_engagement || 0) - (a.total_engagement || 0);
        if (currentSort === 'sentiment')  return (b.sentiment_score || 0) - (a.sentiment_score || 0);
        if (currentSort === 'rating')     return (b.google_rating || 0) - (a.google_rating || 0);
        return 0;
    });

    renderRestaurants();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderRestaurants() {
    document.getElementById('total-count').textContent = filteredRestaurants.length;
    const grid = document.getElementById('restaurant-grid');

    if (filteredRestaurants.length === 0) {
        grid.innerHTML = '<p class="text-center text-gray-500 py-8">没有找到匹配的餐厅</p>';
        return;
    }

    grid.innerHTML = filteredRestaurants.map(r => {
        const chips = (r.recommendations || []).slice(0, 3)
            .map(rec => `<span class="recommendation-chip">${rec}</span>`).join('');
        const extra = r.recommendations && r.recommendations.length > 3
            ? `<span class="recommendation-chip bg-blue-50 text-blue-600">+${r.recommendations.length - 3}</span>`
            : '';
        const sentColor = (r.sentiment_score || 0) >= 0.85 ? 'text-green-600' : 'text-gray-600';
        const ratingColor = (r.google_rating || 0) >= 4.5 ? 'text-green-600' : 'text-gray-600';

        return `
        <div class="ios-card p-4 cursor-pointer" onclick="openModal('${r.id}')">
            <h3 class="font-semibold text-lg text-gray-900">${r.name}</h3>
            <p class="text-sm text-gray-500 mt-1">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</p>
            <div class="grid grid-cols-3 gap-2 mt-3">
                <div class="bg-gray-50 rounded-lg p-2 text-center">
                    <div class="text-xs text-gray-400">讨论度</div>
                    <div class="text-sm font-semibold text-orange-600">${(r.total_engagement || 0).toLocaleString()}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-2 text-center">
                    <div class="text-xs text-gray-400">口碑</div>
                    <div class="text-sm font-semibold ${sentColor}">${r.sentiment_score ? Math.round(r.sentiment_score * 100) : '-'}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-2 text-center">
                    <div class="text-xs text-gray-400">Google</div>
                    <div class="text-sm font-semibold ${ratingColor}">${r.google_rating || '-'}</div>
                </div>
            </div>
            ${chips || extra ? `<div class="flex flex-wrap gap-1 mt-3">${chips}${extra}</div>` : ''}
        </div>`;
    }).join('');
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(id) {
    const r = allRestaurants.find(x => x.id === id);
    if (!r) return;

    const sentColor  = (r.sentiment_score || 0) >= 0.85 ? 'text-green-600' : 'text-gray-600';
    const ratingColor = (r.google_rating || 0) >= 4.5 ? 'text-green-600' : 'text-gray-600';
    const mapsQuery  = encodeURIComponent((r.name || '') + ' ' + (r.address || ''));

    document.getElementById('modal-body').innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <h2 class="text-2xl font-bold text-gray-900">${r.name}</h2>
                <p class="text-gray-500 mt-1">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</p>
            </div>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-xmark text-xl"></i>
            </button>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-50 rounded-xl p-4 text-center">
                <div class="text-2xl font-bold text-orange-600">${(r.total_engagement || 0).toLocaleString()}</div>
                <div class="text-xs text-gray-500 mt-1">讨论度</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-4 text-center">
                <div class="text-2xl font-bold ${sentColor}">${r.sentiment_score ? Math.round(r.sentiment_score * 100) : '-'}</div>
                <div class="text-xs text-gray-500 mt-1">口碑</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-4 text-center">
                <div class="text-2xl font-bold ${ratingColor}">${r.google_rating || '-'}</div>
                <div class="text-xs text-gray-500 mt-1">Google评分</div>
            </div>
        </div>

        ${r.address ? `
        <div class="mb-4">
            <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}"
               target="_blank" class="text-sm text-blue-600 hover:underline flex items-center gap-2">
                <i class="fas fa-location-dot mr-2"></i>${r.address}
                <i class="fas fa-external-link-alt text-xs"></i>
            </a>
        </div>` : ''}

        ${r.recommendations && r.recommendations.length > 0 ? `
        <div class="mb-6">
            <h4 class="font-semibold mb-2">推荐菜品</h4>
            <div class="flex flex-wrap gap-2">
                ${r.recommendations.map(rec => `<span class="recommendation-chip">${rec}</span>`).join('')}
            </div>
        </div>` : ''}

        ${generateChart(r.post_details, r.timeseries)}

        ${r.post_details && r.post_details.length > 0 ? `
        <div>
            <h4 class="font-semibold mb-2">来源帖子</h4>
            <div class="space-y-2">
                ${r.post_details.slice(0, 5).map(p => `
                <div class="p-3 bg-gray-50 rounded-lg">
                    <div class="flex justify-between items-start">
                        <a href="https://www.xiaohongshu.com/explore/${p.post_id}" target="_blank" class="flex-1">
                            <p class="text-sm font-medium text-gray-900 hover:text-red-600">${p.title || '无标题'}</p>
                            <p class="text-xs text-gray-500 mt-1">${p.date} · 讨论度 ${p.engagement}</p>
                        </a>
                        <button onclick="showQRCode('${p.post_id}','${(p.title||'').replace(/'/g,"\\'")}')"
                                class="ml-2 text-gray-400 hover:text-red-500" title="显示二维码">
                            <i class="fas fa-qrcode"></i>
                        </button>
                    </div>
                </div>`).join('')}
            </div>
        </div>` : ''}
    `;

    document.getElementById('detail-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('detail-modal').classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ─── QR Code ──────────────────────────────────────────────────────────────────

function showQRCode(postId, title) {
    const url = `https://www.xiaohongshu.com/explore/${postId}`;
    const modal = document.createElement('div');
    modal.id = 'qrcode-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60]';
    modal.onclick = closeQRCode;
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 text-center" onclick="event.stopPropagation()">
            <h3 class="font-semibold mb-2">${title || '小红书帖子'}</h3>
            <p class="text-sm text-gray-500 mb-4">扫码打开小红书</p>
            <div class="mb-4">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}"
                     alt="二维码" class="mx-auto rounded-lg">
            </div>
            <div class="flex gap-2">
                <button onclick="copyToClipboard('${url}')"
                        class="flex-1 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">复制链接</button>
                <button onclick="closeQRCode()"
                        class="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">关闭</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function closeQRCode() {
    const modal = document.getElementById('qrcode-modal');
    if (modal) modal.remove();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => alert('链接已复制')).catch(() => {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        alert('链接已复制');
    });
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function generateChart(postDetails, timeseries) {
    const hasTimeseries = Array.isArray(timeseries) && timeseries.length > 0;
    const hasPostDetails = postDetails && postDetails.length > 0;
    if (!hasTimeseries && !hasPostDetails) return '';

    const now = new Date();
    const monthly = {};
    for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthly[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`] = 0;
    }

    if (hasTimeseries) {
        // Use structured timeseries data directly (already monthly)
        timeseries.forEach(t => {
            if (monthly[t.month] !== undefined) monthly[t.month] += (t.engagement || t.mentions || 0);
        });
    } else {
        // Fall back to aggregating post_details by month
        postDetails.forEach(p => {
            if (!p.date) return;
            const d = new Date(p.date);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (monthly[key] !== undefined) monthly[key] += (p.engagement || 0);
        });
    }

    const data = Object.entries(monthly).sort((a,b) => a[0].localeCompare(b[0]));
    const maxVal = Math.max(...data.map(d => d[1]), 1);
    const W = 400, H = 150, PAD = 30;
    const cW = W - PAD*2, cH = H - PAD*2;

    const pts = data.map(([,v], i) => {
        const x = PAD + (i/(data.length-1))*cW;
        const y = PAD + cH - (v/maxVal)*cH;
        return `${x},${y}`;
    });

    const circles = data.map(([,v], i) => {
        const x = PAD + (i/(data.length-1))*cW;
        const y = PAD + cH - (v/maxVal)*cH;
        return `<circle cx="${x}" cy="${y}" r="3" fill="#007AFF"/>`;
    }).join('');

    const labels = data.filter((_,i) => i % 6 === 0 || i === data.length-1).map(([k],i,arr) => {
        const idx = i === arr.length-1 ? data.length-1 : i*6;
        const x = PAD + (idx/(data.length-1))*cW;
        const [yr, mo] = k.split('-');
        return `<text x="${x}" y="${H-5}" text-anchor="middle" font-size="10" fill="#8E8E93">${mo==='01'?`${yr}.${mo}`:`${mo}月`}</text>`;
    }).join('');

    return `
    <div class="mb-6">
        <h4 class="font-semibold mb-3">月度讨论度趋势</h4>
        <div class="bg-white rounded-xl p-4 border border-gray-100">
            <svg viewBox="0 0 ${W} ${H}" class="w-full">
                <defs>
                    <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   style="stop-color:#007AFF;stop-opacity:0.3"/>
                        <stop offset="100%" style="stop-color:#007AFF;stop-opacity:0.05"/>
                    </linearGradient>
                </defs>
                <polygon points="${PAD},${PAD+cH} ${pts.join(' ')} ${PAD+cW},${PAD+cH}" fill="url(#chartGrad)"/>
                <polyline points="${pts.join(' ')}" fill="none" stroke="#007AFF" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round"/>
                ${circles}
                ${labels}
            </svg>
        </div>
    </div>`;
}
