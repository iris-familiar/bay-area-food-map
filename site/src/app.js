/* Bay Area Food Map — App Logic */
/* global functions are used by onclick handlers in index.html */

let allRestaurants = [];
let filteredRestaurants = [];
let currentFilters = { cuisine: 'all', region: 'all' };
let currentSort = 'engagement';
let searchPlaceholderCount = '';
let searchPlaceholderUpdated = '';

// Map state
let currentView = 'list';
let leafletMap = null;
let mapMarkers = [];
let selectedMarkerId = null;
let engagementQ33 = 0, engagementQ66 = 0;
let locationMarker = null;

function updateSearchPlaceholder() {
    const parts = [];
    if (searchPlaceholderCount) parts.push(searchPlaceholderCount);
    if (searchPlaceholderUpdated) parts.push(searchPlaceholderUpdated);
    const el = document.getElementById('search-input');
    if (el) el.placeholder = parts.length ? parts.join(' · ') : '搜索餐厅、菜品、地址...';
}

// ─── Data loading ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize pill filter listeners
    initPillFilters();

    // Initialize modal swipe gesture
    initModalGesture();

    // Initialize sheet swipe gesture
    initSheetGesture();

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
        searchPlaceholderCount = `${allRestaurants.length} 家餐厅`;
        updateSearchPlaceholder();

        buildCuisineFilter();
        filterAndRender();

        // Show last pipeline run timestamp
        try {
            const sr = await fetch('data/.pipeline_state.json' + v);
            if (sr.ok) {
                const state = await sr.json();
                if (state.last_run) {
                    const d = new Date(state.last_run);
                    const fmt = d.toLocaleDateString('zh-CN', {
                        month: 'short', day: 'numeric',
                    });
                    searchPlaceholderUpdated = `更新于 ${fmt}`;
                    updateSearchPlaceholder();
                }
            }
        } catch (e) { /* non-critical */ }

        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    } catch (e) {
        console.error('Load error:', e);
        alert('加载失败: ' + e.message + '\n请按F12查看控制台详细错误');
    }
});

// ─── Pill Filters ─────────────────────────────────────────────────────────────

function initPillGroup(group) {
    group.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
            group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filterType = group.dataset.filter;
            const value = pill.dataset.value;

            if (filterType === 'sort') {
                applySort(value);
            } else {
                applyFilter(filterType, value);
            }
        });
    });
}

function initPillFilters() {
    document.querySelectorAll('.filter-pills').forEach(group => initPillGroup(group));
}

function buildCuisineFilter() {
    const counts = {};
    allRestaurants.forEach(r => {
        if (r.cuisine) counts[r.cuisine] = (counts[r.cuisine] || 0) + 1;
    });

    const top10 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const active = currentFilters.cuisine;
    let html = `<button class="pill${active === 'all' ? ' active' : ''}" data-value="all">全部</button>`;
    for (const [cuisine, count] of top10) {
        html += `<button class="pill${active === cuisine ? ' active' : ''}" data-value="${cuisine}">${cuisine} <span class="pill-count">${count}</span></button>`;
    }

    const container = document.getElementById('cuisine-pills');
    if (!container) return;
    container.innerHTML = html;
    initPillGroup(container);
}

function updatePillActive(group, value) {
    const pills = document.querySelector(`#${group}-pills`);
    if (!pills) return;
    pills.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.value === value);
    });
}

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

    // Reset all pills
    updatePillActive('cuisine', 'all');
    updatePillActive('region', 'all');
    updatePillActive('sort', 'engagement');

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
    if (currentView === 'map') { renderMarkers(); renderSheetCards(); }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderRestaurants() {
    const grid = document.getElementById('restaurant-grid');

    if (filteredRestaurants.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon"><i class="fas fa-utensils"></i></div>
                <p class="empty-text">没有找到匹配的餐厅</p>
            </div>`;
        return;
    }

    grid.innerHTML = filteredRestaurants.map(r => {
        const chips = (r.recommendations || []).slice(0, 2)
            .map(rec => `<span class="chip">${rec}</span>`).join('');
        const extra = r.recommendations && r.recommendations.length > 2
            ? `<span class="chip chip-more">+${r.recommendations.length - 2}</span>`
            : '';

        const sentimentBadge = (r.sentiment_score || 0) >= 0.85
            ? `<span class="stat-badge success"><i class="fas fa-heart"></i> ${Math.round(r.sentiment_score * 100)}</span>`
            : `<span class="stat-badge"><i class="fas fa-heart"></i> ${r.sentiment_score != null ? Math.round(r.sentiment_score * 100) : '-'}</span>`;

        const ratingBadge = (r.google_rating || 0) >= 4.5
            ? `<span class="stat-badge success"><i class="fas fa-star"></i> ${r.google_rating || '-'}</span>`
            : `<span class="stat-badge"><i class="fas fa-star"></i> ${r.google_rating || '-'}</span>`;

        return `
        <div class="restaurant-card" onclick="openModal('${r.id}')">
            <div class="card-header">
                <h3 class="card-title">${r.name}</h3>
                <p class="card-meta">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</p>
            </div>
            <div class="card-stats">
                <div class="stat-primary">
                    <span class="stat-value">${Math.round(r.total_engagement || 0)}</span>
                    <span class="stat-label">讨论度</span>
                </div>
                ${sentimentBadge}
                ${ratingBadge}
            </div>
            ${chips || extra ? `<div class="card-chips">${chips}${extra}</div>` : ''}
        </div>`;
    }).join('');
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(id) {
    const r = allRestaurants.find(x => x.id === id);
    if (!r) return;

    const sentimentClass = (r.sentiment_score || 0) >= 0.85 ? 'success' : 'neutral';
    const ratingClass = (r.google_rating || 0) >= 4.5 ? 'success' : 'neutral';
    const mapsQuery = encodeURIComponent((r.name || '') + ' ' + (r.address || ''));

    document.getElementById('modal-body').innerHTML = `
        <div class="modal-header">
            <div>
                <h2 class="modal-title">${r.name}</h2>
                <p class="modal-subtitle">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</p>
            </div>
            <button onclick="closeModal()" class="modal-close">
                <i class="fas fa-xmark"></i>
            </button>
        </div>

        <div class="modal-stats">
            <div class="modal-stat">
                <div class="modal-stat-value">${Math.round(r.total_engagement || 0)}</div>
                <div class="modal-stat-label">讨论度</div>
            </div>
            <div class="modal-stat">
                <div class="modal-stat-value ${sentimentClass}">${r.sentiment_score != null ? Math.round(r.sentiment_score * 100) : '-'}</div>
                <div class="modal-stat-label">口碑</div>
            </div>
            <div class="modal-stat">
                <div class="modal-stat-value ${ratingClass}">${r.google_rating || '-'}</div>
                <div class="modal-stat-label">Google评分</div>
            </div>
        </div>

        ${r.address ? `
        <div class="modal-section">
            <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}"
               target="_blank" class="address-link">
                <i class="fas fa-location-dot"></i>
                ${r.address}
                <i class="fas fa-external-link-alt"></i>
            </a>
        </div>` : ''}

        ${r.recommendations && r.recommendations.length > 0 ? `
        <div class="modal-section">
            <h4 class="modal-section-title">推荐菜品</h4>
            <div class="recommendations">
                ${r.recommendations.map(rec => `<span class="recommendation-chip">${rec}</span>`).join('')}
            </div>
        </div>` : ''}

        ${generateChart(r.post_details, r.timeseries)}

        ${r.post_details && r.post_details.length > 0 ? `
        <div class="modal-section">
            <h4 class="modal-section-title">来源帖子 Top 5</h4>
            <div class="post-list">
                ${r.post_details.slice(0, 5).map(p => `
                <div class="post-item">
                    <div class="post-content">
                        <p class="post-title">${p.title || '无标题'}</p>
                        <p class="post-meta">${p.date} · 讨论度 ${Math.round(p.adjusted_engagement || 0)}</p>
                    </div>
                    <div class="post-actions">
                        <button onclick="openXHSPost('${p.post_id}','${(p.title||'').replace(/'/g,"\\'")}')"
                                class="xhs-btn" title="${isMobile ? '在App中打开' : '扫码在App中查看'}">
                            <i class="fas ${isMobile ? 'fa-external-link-alt' : 'fa-qrcode'}"></i>
                            <span>${isMobile ? '打开' : '查看'}</span>
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

// ─── Modal Swipe Gesture ──────────────────────────────────────────────────────

function initModalGesture() {
    const sheet = document.querySelector('.modal-sheet');
    const content = document.querySelector('.modal-content');
    if (!sheet || !content) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let canDismiss = false;

    sheet.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        // Only allow dismiss gesture when content is scrolled to the top
        canDismiss = content.scrollTop === 0;
        if (canDismiss) sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
        if (!isDragging || !canDismiss) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;

        // If user scrolls up (finger moves down) but content has scrolled, cancel dismiss
        if (content.scrollTop > 0) {
            canDismiss = false;
            sheet.style.transition = '';
            sheet.style.transform = '';
            return;
        }

        if (delta > 0) {
            e.preventDefault(); // block pull-to-refresh while dismissing
            sheet.style.transform = `translateY(${delta}px)`;
        }
    }, { passive: false });

    sheet.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;

        if (!canDismiss) {
            sheet.style.transition = '';
            sheet.style.transform = '';
            return;
        }

        const delta = currentY - startY;

        if (delta > 100) {
            // Animate sheet off-screen, then close
            sheet.style.transition = 'transform 260ms ease-in';
            sheet.style.transform = 'translateY(100%)';
            sheet.addEventListener('transitionend', () => {
                sheet.style.transition = '';
                sheet.style.transform = '';
                closeModal();
            }, { once: true });
        } else {
            // Snap back
            sheet.style.transition = 'transform 300ms var(--ease-spring)';
            sheet.style.transform = '';
            sheet.addEventListener('transitionend', () => {
                sheet.style.transition = '';
            }, { once: true });
        }
    });
}

// ─── Device Detection ──────────────────────────────────────────────────────────

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Open XHS post - deep link on mobile, QR modal on desktop
function openXHSPost(postId, title) {
    const deepLink = `xhsdiscover://item/${postId}`;
    const webUrl = `https://www.xiaohongshu.com/explore/${postId}`;

    if (isMobile) {
        // Try deep link, fallback to web if app not installed
        window.location.href = deepLink;
        setTimeout(() => {
            if (document.hasFocus()) {
                window.open(webUrl, '_blank');
            }
        }, 500);
    } else {
        // Desktop: show QR modal
        showQRCode(postId, title);
    }
}

// ─── QR Code ──────────────────────────────────────────────────────────────────

function showQRCode(postId, title) {
    const url = `https://www.xiaohongshu.com/explore/${postId}`;
    const modal = document.createElement('div');
    modal.id = 'qrcode-modal';
    modal.className = 'qr-modal';
    modal.onclick = closeQRCode;
    modal.innerHTML = `
        <div class="qr-content" onclick="event.stopPropagation()">
            <h3 class="qr-title">${title || '小红书帖子'}</h3>
            <p class="qr-subtitle">扫码打开小红书</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}"
                 alt="二维码" class="qr-image">
            <div class="qr-actions">
                <button onclick="copyToClipboard('${url}')"
                        class="qr-btn qr-btn-secondary">复制链接</button>
                <button onclick="closeQRCode()"
                        class="qr-btn qr-btn-primary">关闭</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function closeQRCode() {
    const modal = document.getElementById('qrcode-modal');
    if (modal) modal.remove();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('链接已复制');
    }).catch(() => {
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

    // Prefer post_details (complete historical data), fallback to timeseries
    // Timeseries may be incomplete for older restaurants added before the feature
    if (hasPostDetails) {
        postDetails.forEach(p => {
            if (!p.date) return;
            const d = new Date(p.date);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (monthly[key] !== undefined) monthly[key] += (p.adjusted_engagement ?? p.engagement ?? 0);
        });
    } else if (hasTimeseries) {
        timeseries.forEach(t => {
            if (monthly[t.month] !== undefined) monthly[t.month] += (t.engagement || t.mentions || 0);
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
        return `<circle cx="${x}" cy="${y}" r="3" fill="#FF2442"/>`;
    }).join('');

    const labels = data.filter((_,i) => i % 6 === 0 || i === data.length-1).map(([k],i,arr) => {
        const idx = i === arr.length-1 ? data.length-1 : i*6;
        const x = PAD + (idx/(data.length-1))*cW;
        const [yr, mo] = k.split('-');
        return `<text x="${x}" y="${H-5}" text-anchor="middle" font-size="10" fill="#8E8E93">${mo==='01'?`${yr}.${mo}`:`${mo}月`}</text>`;
    }).join('');

    return `
    <div class="modal-section">
        <h4 class="modal-section-title">月度讨论度趋势</h4>
        <div class="chart-container">
            <svg viewBox="0 0 ${W} ${H}">
                <defs>
                    <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   style="stop-color:#FF2442;stop-opacity:0.3"/>
                        <stop offset="100%" style="stop-color:#FF2442;stop-opacity:0.05"/>
                    </linearGradient>
                </defs>
                <polygon points="${PAD},${PAD+cH} ${pts.join(' ')} ${PAD+cW},${PAD+cH}" fill="url(#chartGrad)"/>
                <polyline points="${pts.join(' ')}" fill="none" stroke="#FF2442" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round"/>
                ${circles}
                ${labels}
            </svg>
        </div>
    </div>`;
}

// ─── Map View ─────────────────────────────────────────────────────────────────

function switchView(view) {
    if (currentView === view) return;
    currentView = view;

    const mapEl = document.getElementById('map-view');
    const mainEl = document.querySelector('.main-content');
    const btns = document.querySelectorAll('.view-btn');

    btns.forEach(b => b.classList.toggle('active', b.dataset.view === view));

    if (view === 'map') {
        mainEl.style.display = 'none';
        mapEl.classList.remove('hidden');
        // Measure header height so map positions correctly below it
        const headerH = document.querySelector('.header').getBoundingClientRect().height;
        document.documentElement.style.setProperty('--header-height', headerH + 'px');
        mapEl.style.top = headerH + 'px';
        initMap();
        renderMarkers();
        renderSheetCards();
    } else {
        mapEl.classList.add('hidden');
        mainEl.style.display = '';
    }
}

function initMap() {
    if (leafletMap) return;
    leafletMap = L.map('leaflet-map', { zoomControl: false }).setView([37.55, -122.05], 10);
    L.control.zoom({ position: 'topright' }).addTo(leafletMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(leafletMap);
    computeEngagementTiers();
}

function computeEngagementTiers() {
    const vals = allRestaurants
        .filter(r => r.lat && r.lng)
        .map(r => r.total_engagement || 0)
        .sort((a, b) => a - b);
    if (vals.length === 0) return;
    engagementQ33 = vals[Math.floor(vals.length * 0.33)];
    engagementQ66 = vals[Math.floor(vals.length * 0.66)];
}

function markerRadius(engagement) {
    if (engagement >= engagementQ66) return 8;
    if (engagement >= engagementQ33) return 6;
    return 4;
}

function renderMarkers() {
    if (!leafletMap) return;
    // Clear existing markers
    mapMarkers.forEach(m => m.marker.remove());
    mapMarkers = [];
    selectedMarkerId = null;

    filteredRestaurants.forEach(r => {
        if (!r.lat || !r.lng) return;
        const radius = markerRadius(r.total_engagement || 0);
        const marker = L.circleMarker([r.lat, r.lng], {
            radius,
            fillColor: '#FF2442',
            color: '#FFFFFF',
            weight: 1.5,
            fillOpacity: 0.85,
        });

        const popup = L.popup({ className: 'map-popup', closeButton: false, maxWidth: 260 })
            .setContent(createMarkerPopupHTML(r));
        marker.bindPopup(popup);
        marker.on('click', () => selectMarker(r.id, marker));
        marker.addTo(leafletMap);
        mapMarkers.push({ id: r.id, marker, radius });
    });
}

function createMarkerPopupHTML(r) {
    const engagement = Math.round(r.total_engagement || 0);
    const sentiment = r.sentiment_score != null ? Math.round(r.sentiment_score * 100) : '-';
    const rating = r.google_rating || '-';
    return `<div class="popup-card" onclick="openModal('${r.id}')">
        <div class="popup-name">${r.name}</div>
        <div class="popup-meta">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</div>
        <div class="popup-stats">
            <span class="popup-stat"><i class="fas fa-fire"></i> ${engagement}</span>
            <span class="popup-stat"><i class="fas fa-heart"></i> ${sentiment}</span>
            <span class="popup-stat"><i class="fas fa-star"></i> ${rating}</span>
        </div>
        <div class="popup-hint">点击查看详情</div>
    </div>`;
}

function selectMarker(id, marker) {
    // Restore previous selection
    if (selectedMarkerId) {
        const prev = mapMarkers.find(m => m.id === selectedMarkerId);
        if (prev) {
            prev.marker.setStyle({ fillColor: '#FF2442', color: '#FFFFFF', fillOpacity: 0.85 });
            prev.marker.setRadius(prev.radius);
        }
    }
    selectedMarkerId = id;
    marker.setStyle({ fillColor: '#FFFFFF', color: '#FF2442', weight: 2.5, fillOpacity: 1 });
    const entry = mapMarkers.find(m => m.id === id);
    if (entry) marker.setRadius(entry.radius + 2);
    scrollSheetToCard(id);
}

function scrollSheetToCard(id) {
    const card = document.querySelector(`[data-rid="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    card.classList.add('sheet-card-hl');
    setTimeout(() => card.classList.remove('sheet-card-hl'), 1200);
}

function renderSheetCards() {
    const container = document.getElementById('sheet-content');
    if (!container) return;
    if (filteredRestaurants.length === 0) {
        container.innerHTML = '<p style="color:var(--color-text-tertiary);font-size:13px;padding:8px 0;">没有找到匹配的餐厅</p>';
        return;
    }
    container.innerHTML = filteredRestaurants.map((r, i) => {
        const engagement = Math.round(r.total_engagement || 0);
        const sentiment = r.sentiment_score != null ? Math.round(r.sentiment_score * 100) : '-';
        const rating = r.google_rating || '-';
        const hasLocation = r.lat && r.lng ? '' : ' style="opacity:0.6"';
        return `<div class="sheet-card" data-rid="${r.id}" onclick="sheetCardClick('${r.id}')"${hasLocation}>
            <div class="sheet-card-rank">#${i + 1}</div>
            <div class="sheet-card-name">${r.name}</div>
            <div class="sheet-card-meta">${r.cuisine || '未知'} · ${r.city || r.area || '未知'}</div>
            <div class="sheet-card-stats">
                <span class="sheet-card-stat"><i class="fas fa-fire"></i> ${engagement}</span>
                <span class="sheet-card-stat"><i class="fas fa-star"></i> ${rating}</span>
            </div>
        </div>`;
    }).join('');
}

function sheetCardClick(id) {
    const entry = mapMarkers.find(m => m.id === id);
    if (entry) {
        leafletMap.panTo(entry.marker.getLatLng(), { animate: true });
        entry.marker.openPopup();
        selectMarker(id, entry.marker);
    } else {
        // No location — open modal directly
        openModal(id);
    }
}

function toggleSheet() {
    const sheet = document.getElementById('map-sheet');
    if (!sheet) return;
    sheet.classList.toggle('expanded');
    sheet.classList.toggle('collapsed');
}

function initSheetGesture() {
    const handleBar = document.querySelector('.sheet-handle-bar');
    if (!handleBar) return;
    let startY = 0;
    handleBar.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
    }, { passive: true });
    handleBar.addEventListener('touchend', e => {
        const delta = e.changedTouches[0].clientY - startY;
        const sheet = document.getElementById('map-sheet');
        if (!sheet) return;
        if (delta < -50) { sheet.classList.remove('collapsed'); sheet.classList.add('expanded'); }
        else if (delta > 50) { sheet.classList.remove('expanded'); sheet.classList.add('collapsed'); }
    }, { passive: true });
}

// ─── Location Permission Helpers ──────────────────────────────────────────────

function getPlatform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
}

const LOCATION_INSTRUCTIONS = {
    ios: '设置 → Safari → 位置\n→ 找到本网站 → 选择"允许"\n\n如仍无效：\n设置 → 隐私与安全性 → 定位服务\n→ Safari → 使用期间',
    android: '浏览器地址栏 → 点击锁形图标\n→ 权限 → 位置 → 允许',
    desktop: '点击地址栏左侧的锁形图标\n→ 位置 → 允许\n\n如已永久拒绝，请前往\n浏览器设置 → 网站权限 → 位置',
};

function showLocationDeniedModal() {
    const modal = document.getElementById('location-denied-modal');
    const steps = document.getElementById('location-denied-steps');
    if (!modal || !steps) return;
    steps.textContent = LOCATION_INSTRUCTIONS[getPlatform()];
    modal.hidden = false;
    modal.querySelector('.location-denied-close').onclick = () => modal.hidden = true;
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };
}

// ─── Locate Me ────────────────────────────────────────────────────────────────

function locateMe() {
    if (!navigator.geolocation) {
        alert('您的浏览器不支持定位功能');
        return;
    }
    const btn = document.getElementById('locate-btn');
    if (btn) btn.classList.add('locating');

    navigator.geolocation.getCurrentPosition(pos => {
        if (btn) btn.classList.remove('locating');
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!leafletMap) return;
        leafletMap.setView([lat, lng], 13);

        // Remove previous location marker
        if (locationMarker) locationMarker.remove();
        locationMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#007AFF',
            color: '#FFFFFF',
            weight: 2,
            fillOpacity: 0.9,
        }).addTo(leafletMap);
        locationMarker.bindPopup('<div style="padding:8px;font-size:13px;font-weight:600;">📍 我在这里</div>').openPopup();
    }, err => {
        if (btn) btn.classList.remove('locating');
        if (err.code === err.PERMISSION_DENIED) {
            showLocationDeniedModal();
        }
    }, { timeout: 10000 });
}
