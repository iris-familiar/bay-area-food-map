/* Review UI — Local dev only at http://localhost:8080/review.html */

let db = null;
let pending = [];
let approved = [];

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function containsReplacementChar(str) {
    return typeof str === 'string' && (str.includes('\uFFFD') || /[?？]{2,}/.test(str));
}

async function apiCall(endpoint, body) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok && !res.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`Server error ${res.status} — is dev.js running?`);
    }
    return res.json();
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-white text-sm font-medium z-50 shadow-lg ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadData() {
    const v = '?v=' + Date.now();
    const res = await fetch('/data/restaurant_database.json' + v);
    if (!res.ok) throw new Error('Failed to load database');
    db = await res.json();
    pending = db.restaurants.filter(r => r.merge_info?.needs_review && r._status !== 'rejected');
    approved = db.restaurants.filter(
        r => !r.merge_info?.needs_review && r._status !== 'rejected' && r._status !== 'duplicate_merged'
    );
}

// ─── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
    document.getElementById('pending-list').classList.toggle('hidden', tab !== 'pending');
    document.getElementById('approved-list').classList.toggle('hidden', tab !== 'approved');
    document.getElementById('tab-pending').className =
        `px-4 py-2 rounded-lg text-sm font-medium ${tab === 'pending' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`;
    document.getElementById('tab-approved').className =
        `px-4 py-2 rounded-lg text-sm font-medium ${tab === 'approved' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`;
}

// ─── Count display ─────────────────────────────────────────────────────────────

function updateCounts() {
    document.getElementById('pending-count').textContent = `(${pending.length})`;
    document.getElementById('approved-count').textContent = `(${approved.length})`;
    const badge = document.getElementById('pending-badge');
    if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ─── Pending tab ──────────────────────────────────────────────────────────────

function renderPending() {
    const el = document.getElementById('pending-list');
    if (pending.length === 0) {
        el.innerHTML = '<p class="text-center text-gray-400 py-16 text-lg">没有待审核的餐厅 ✓</p>';
        return;
    }
    el.innerHTML = pending.map(r => pendingCard(r)).join('');
}

function pendingCard(r) {
    const hasGarbled = containsReplacementChar(r.name) || containsReplacementChar(r.cuisine);
    const sourceTitle = r.post_details?.[0]?.title || r.source_query || '';
    const region = [r.city, r.region].filter(Boolean).join(' · ');

    return `<div class="bg-white rounded-2xl shadow-sm p-4 mb-4" id="card-${r.id}">
    ${hasGarbled ? `<div class="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-xs">
        <i class="fas fa-exclamation-triangle mr-1"></i>检测到乱码，请核实名称
    </div>` : ''}
    <div class="mb-3">
        <div class="text-xs text-gray-400 mb-1">ID: ${escHtml(r.id)} · 提及 ${r.mention_count || 0} 次 · ${escHtml(region)}</div>
        ${sourceTitle ? `<div class="text-xs text-gray-500 truncate" title="${escHtml(sourceTitle)}">来源：${escHtml(sourceTitle)}</div>` : ''}
    </div>
    <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">餐厅名称</span>
            <input type="text" value="${escHtml(r.name || '')}" id="${r.id}-name"
                   class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">菜系</span>
            <input type="text" value="${escHtml(r.cuisine || '')}" id="${r.id}-cuisine"
                   class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">城市</span>
            <input type="text" value="${escHtml(r.city || '')}" id="${r.id}-city"
                   class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">人均价位</span>
            <input type="text" value="${escHtml(r.price_range || '')}" id="${r.id}-price_range"
                   class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
    </div>
    <div class="flex gap-2">
        <button onclick="approveRestaurant('${r.id}')"
                class="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 active:scale-95 transition-all">
            <i class="fas fa-check mr-1"></i>通过
        </button>
        <button onclick="rejectRestaurant('${r.id}')"
                class="px-5 py-2.5 border border-red-300 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 active:scale-95 transition-all">
            <i class="fas fa-times mr-1"></i>拒绝
        </button>
    </div>
</div>`;
}

async function approveRestaurant(id) {
    const orig = db.restaurants.find(r => r.id === id);
    const edits = {};

    const fields = ['name', 'cuisine', 'city', 'price_range'];
    for (const f of fields) {
        const el = document.getElementById(`${id}-${f}`);
        if (el && el.value !== (orig?.[f] || '')) edits[f] = el.value;
    }

    const btn = document.querySelector(`#card-${id} button`);
    if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }

    const result = await apiCall(`/api/approve/${id}`, { edits });
    if (result.ok) {
        const card = document.getElementById('card-' + id);
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(40px)';
        setTimeout(() => {
            card.remove();
            pending = pending.filter(r => r.id !== id);
            if (orig) {
                Object.assign(orig, edits);
                orig.merge_info = { ...orig.merge_info, needs_review: false };
                approved.unshift(orig);
                renderApprovedTable(getFilteredApproved());
            }
            updateCounts();
            showToast('已通过 ✓');
        }, 300);
    } else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-1"></i>通过'; }
        showToast('操作失败：' + result.error, 'error');
    }
}

async function rejectRestaurant(id) {
    const r = db.restaurants.find(x => x.id === id);
    if (!confirm(`确认拒绝"${r?.name || id}"？该餐厅将不再显示在地图上。`)) return;

    const result = await apiCall(`/api/reject/${id}`, {});
    if (result.ok) {
        const card = document.getElementById('card-' + id);
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(-40px)';
        setTimeout(() => {
            card.remove();
            pending = pending.filter(r => r.id !== id);
            updateCounts();
            showToast('已拒绝');
        }, 300);
    } else {
        showToast('操作失败：' + result.error, 'error');
    }
}

// ─── Approved tab ──────────────────────────────────────────────────────────────

let approvedSearchQuery = '';

function renderApproved() {
    const el = document.getElementById('approved-list');
    el.innerHTML = `
<div class="mb-4 relative">
    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
    <input type="text" id="approved-search" placeholder="搜索餐厅名、菜系、城市..."
           oninput="filterApproved(this.value)"
           class="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
</div>
<div id="approved-table"></div>`;
    renderApprovedTable(approved);
}

function getFilteredApproved() {
    if (!approvedSearchQuery) return approved;
    const q = approvedSearchQuery;
    return approved.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.cuisine || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q)
    );
}

function filterApproved(q) {
    approvedSearchQuery = q.toLowerCase();
    renderApprovedTable(getFilteredApproved());
}

function renderApprovedTable(list) {
    const el = document.getElementById('approved-table');
    if (!el) return;
    if (list.length === 0) {
        el.innerHTML = '<p class="text-center text-gray-400 py-8">没有匹配的餐厅</p>';
        return;
    }
    el.innerHTML = list.map(r => approvedRow(r)).join('');
}

function approvedRow(r) {
    return `<div class="bg-white rounded-xl mb-2 overflow-hidden" id="row-${r.id}">
    <div class="flex items-center px-4 py-3 gap-3">
        <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900 truncate">${escHtml(r.name)}</div>
            <div class="text-xs text-gray-500 mt-0.5">${escHtml(r.cuisine || '—')} · ${escHtml(r.city || '—')}</div>
        </div>
        ${r.google_rating ? `<div class="text-sm text-amber-500 font-medium whitespace-nowrap shrink-0">
            <i class="fas fa-star text-xs mr-0.5"></i>${r.google_rating}
        </div>` : ''}
        <button onclick="toggleDrawer('${r.id}')"
                class="shrink-0 text-blue-500 text-sm px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
            <i class="fas fa-pencil"></i>
        </button>
    </div>
    <div id="drawer-${r.id}" class="hidden border-t border-gray-100">
        ${renderDrawer(r)}
    </div>
</div>`;
}

// ─── Drawer state ─────────────────────────────────────────────────────────────

const drawerState = {};  // keyed by restaurant id

function getDrawerState(id) {
    return drawerState[id];
}

function initDrawerState(r) {
    drawerState[r.id] = {
        posts: (r.post_details || []).map(p => ({ ...p })),
        pendingGoogleData: null,   // set when re-fetch succeeds
        pendingPlaceId: null,      // the new place_id to apply on save
    };
}

function toggleDrawer(id) {
    const el = document.getElementById('drawer-' + id);
    const isHidden = el.classList.contains('hidden');
    if (isHidden) {
        const r = approved.find(x => x.id === id);
        if (r) initDrawerState(r);
        el.innerHTML = renderDrawer(approved.find(x => x.id === id));
    }
    el.classList.toggle('hidden');
}

// ─── Client-side metric recalculation ─────────────────────────────────────────

function recalcMetrics(posts) {
    const active = posts.filter(p => !p._removed);
    const total = active.reduce(
        (s, p) => s + (p.engagement || 0) / Math.sqrt(p.restaurant_count_in_post || 1), 0
    );
    return { total_engagement: Math.round(total), mention_count: active.length };
}

function updateMetricsFooter(id) {
    const state = getDrawerState(id);
    if (!state) return;
    const { total_engagement, mention_count } = recalcMetrics(state.posts);
    const footer = document.getElementById(`metrics-footer-${id}`);
    if (footer) {
        footer.innerHTML = `<span class="font-medium">互动总分：${total_engagement.toLocaleString()}</span>
            <span class="text-gray-400 mx-2">|</span>
            <span class="font-medium">提及次数：${mention_count}</span>`;
    }
}

// ─── Two-panel drawer ─────────────────────────────────────────────────────────

function renderDrawer(r) {
    if (!r) return '';
    const state = getDrawerState(r.id);
    const posts = state ? state.posts : (r.post_details || []);

    return `<div class="bg-gray-50 px-4 py-4">
    <!-- Drawer header -->
    <div class="flex items-center justify-between mb-4">
        <div class="text-sm font-medium text-gray-700">${escHtml(r.name)}</div>
        <div class="flex gap-2">
            <button onclick="saveDrawer('${r.id}')"
                    class="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
                保存
            </button>
            <button onclick="toggleDrawer('${r.id}')"
                    class="px-4 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
                取消
            </button>
        </div>
    </div>
    <!-- Two-panel layout -->
    <div class="flex gap-4">
        <!-- Left: Details panel -->
        <div class="flex-1 min-w-0">
            ${renderDetailsPanel(r)}
        </div>
        <!-- Right: Posts panel -->
        <div class="flex-1 min-w-0">
            ${renderPostsPanel(r.id, posts)}
        </div>
    </div>
</div>`;
}

// ─── Details panel ────────────────────────────────────────────────────────────

function renderDetailsPanel(r) {
    return `<div class="bg-white rounded-xl p-3">
    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">详细信息</div>
    <div class="grid grid-cols-2 gap-2 mb-2">
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">中文名</span>
            <input type="text" value="${escHtml(r.name || '')}" id="edit-${r.id}-name"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">英文名</span>
            <input type="text" value="${escHtml(r.name_en || '')}" id="edit-${r.id}-name_en"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">菜系</span>
            <input type="text" value="${escHtml(r.cuisine || '')}" id="edit-${r.id}-cuisine"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">区域/城市</span>
            <input type="text" value="${escHtml(r.area || r.city || '')}" id="edit-${r.id}-area"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block col-span-2">
            <span class="text-xs text-gray-500 mb-1 block">地址</span>
            <input type="text" value="${escHtml(r.address || '')}" id="edit-${r.id}-address"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">Google 评分</span>
            <input type="number" step="0.1" min="1" max="5" value="${r.google_rating || ''}" id="edit-${r.id}-google_rating"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
        <label class="block">
            <span class="text-xs text-gray-500 mb-1 block">人均价位</span>
            <input type="text" value="${escHtml(r.price_range || '')}" id="edit-${r.id}-price_range"
                   class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
        </label>
    </div>
    <label class="flex items-center gap-2 mb-2">
        <input type="checkbox" id="edit-${r.id}-verified" ${r.verified ? 'checked' : ''} class="rounded">
        <span class="text-sm text-gray-700">已 Google 验证</span>
    </label>
    <!-- Google Place ID field -->
    <div class="mb-2">
        <span class="text-xs text-gray-500 mb-1 block">Google Place ID</span>
        <div class="flex gap-1.5">
            <input type="text" value="${escHtml(r.google_place_id || '')}" id="edit-${r.id}-google_place_id"
                   placeholder="ChIJ..."
                   class="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400">
            <button onclick="refetchPlaceId('${r.id}')"
                    id="refetch-btn-${r.id}"
                    class="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 transition-colors whitespace-nowrap">
                ↻ 重新获取
            </button>
        </div>
        <div id="refetch-preview-${r.id}" class="hidden mt-1.5 text-xs bg-blue-50 border border-blue-200 rounded-lg p-2 text-blue-700"></div>
    </div>
    <!-- Reason -->
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">备注（可选）</span>
        <input type="text" placeholder="修改原因..." id="edit-${r.id}-reason"
               class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
</div>`;
}

// ─── Posts panel ──────────────────────────────────────────────────────────────

function renderPostsPanel(id, posts) {
    const { total_engagement, mention_count } = recalcMetrics(posts);

    const rows = posts.map((p, i) => renderPostRow(id, p, i)).join('');

    return `<div class="bg-white rounded-xl p-3 flex flex-col h-full">
    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        帖子 <span class="normal-case font-normal">(${posts.filter(p => !p._removed).length})</span>
    </div>
    <div class="overflow-auto flex-1 mb-2" id="posts-table-${id}">
        ${posts.length === 0
            ? '<p class="text-xs text-gray-400 py-4 text-center">暂无帖子</p>'
            : `<table class="w-full text-xs">
                <thead>
                    <tr class="text-gray-400 border-b border-gray-100">
                        <th class="text-left pb-1 font-medium">帖子 ID</th>
                        <th class="text-left pb-1 font-medium">标题</th>
                        <th class="text-right pb-1 font-medium">互动</th>
                        <th class="text-right pb-1 font-medium">调整</th>
                        <th class="pb-1"></th>
                    </tr>
                </thead>
                <tbody id="posts-tbody-${id}">${rows}</tbody>
            </table>`
        }
    </div>
    <!-- Add post row -->
    <div class="border-t border-gray-100 pt-2 mb-2">
        <div class="flex gap-1.5 items-center">
            <input type="text" id="add-post-id-${id}" placeholder="输入帖子 ID..."
                   class="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400">
            <button onclick="addPost('${id}')"
                    class="px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors">
                + 添加
            </button>
        </div>
    </div>
    <!-- Metrics footer -->
    <div class="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2" id="metrics-footer-${id}">
        <span class="font-medium">互动总分：${total_engagement.toLocaleString()}</span>
        <span class="text-gray-400 mx-2">|</span>
        <span class="font-medium">提及次数：${mention_count}</span>
    </div>
</div>`;
}

function renderPostRow(id, post, index) {
    if (post._removed) {
        return `<tr id="post-row-${id}-${index}" class="opacity-40">
            <td class="py-1 pr-1 font-mono line-through">${escHtml((post.post_id || '').slice(-8))}</td>
            <td class="py-1 pr-1 line-through truncate max-w-24" title="${escHtml(post.title)}">${escHtml(post.title || '—')}</td>
            <td class="py-1 pr-1 text-right">${post.engagement || 0}</td>
            <td class="py-1 pr-1 text-right">${Math.round((post.engagement || 0) / Math.sqrt(post.restaurant_count_in_post || 1))}</td>
            <td class="py-1 text-right whitespace-nowrap">
                <button onclick="unremovePost('${id}', ${index})" class="text-blue-500 hover:text-blue-700 px-1">↩</button>
            </td>
        </tr>`;
    }

    if (post._editing) {
        return `<tr id="post-row-${id}-${index}" class="bg-blue-50">
            <td class="py-1 pr-1 font-mono text-gray-500">${escHtml((post.post_id || '').slice(-8))}</td>
            <td class="py-1 pr-1">
                <input type="text" value="${escHtml(post.context || '')}" placeholder="备注..."
                       id="post-ctx-${id}-${index}"
                       class="w-full px-1 py-0.5 bg-white border border-blue-300 rounded text-xs focus:outline-none">
            </td>
            <td class="py-1 pr-1">
                <input type="number" value="${post.engagement || 0}" id="post-eng-${id}-${index}"
                       oninput="onPostEngagementChange('${id}', ${index})"
                       class="w-14 px-1 py-0.5 bg-white border border-blue-300 rounded text-xs text-right focus:outline-none">
            </td>
            <td class="py-1 pr-1 text-right text-gray-500" id="post-adj-${id}-${index}">
                ${Math.round((post.engagement || 0) / Math.sqrt(post.restaurant_count_in_post || 1))}
            </td>
            <td class="py-1 text-right whitespace-nowrap">
                <select id="post-sent-${id}-${index}"
                        class="text-xs bg-white border border-blue-300 rounded px-1 py-0.5 mr-1">
                    <option value="positive" ${post.sentiment === 'positive' ? 'selected' : ''}>+</option>
                    <option value="neutral" ${post.sentiment === 'neutral' ? 'selected' : ''}>~</option>
                    <option value="negative" ${post.sentiment === 'negative' ? 'selected' : ''}>-</option>
                </select>
                <input type="number" value="${post.restaurant_count_in_post || 1}"
                       id="post-cnt-${id}-${index}" min="1"
                       oninput="onPostEngagementChange('${id}', ${index})"
                       title="该帖餐厅数量"
                       class="w-10 px-1 py-0.5 bg-white border border-blue-300 rounded text-xs text-right mr-1 focus:outline-none">
                <button onclick="savePostEdit('${id}', ${index})" class="text-green-600 hover:text-green-800 px-1">✓</button>
            </td>
        </tr>`;
    }

    const adj = Math.round((post.engagement || 0) / Math.sqrt(post.restaurant_count_in_post || 1));
    return `<tr id="post-row-${id}-${index}">
        <td class="py-1 pr-1 font-mono text-gray-500" title="${escHtml(post.post_id || '')}">${escHtml((post.post_id || '').slice(-8))}</td>
        <td class="py-1 pr-1 truncate max-w-28" title="${escHtml(post.title || '')}">${escHtml(post.title || '—')}</td>
        <td class="py-1 pr-1 text-right text-gray-700">${post.engagement || 0}</td>
        <td class="py-1 pr-1 text-right text-gray-500">${adj}</td>
        <td class="py-1 text-right whitespace-nowrap">
            <button onclick="editPost('${id}', ${index})" class="text-blue-400 hover:text-blue-600 px-1" title="编辑">✏</button>
            <button onclick="removePost('${id}', ${index})" class="text-red-400 hover:text-red-600 px-1" title="删除">×</button>
        </td>
    </tr>`;
}

// ─── Post management actions ───────────────────────────────────────────────────

function refreshPostsTable(id) {
    const state = getDrawerState(id);
    if (!state) return;
    const tbody = document.getElementById(`posts-tbody-${id}`);
    if (tbody) {
        tbody.innerHTML = state.posts.map((p, i) => renderPostRow(id, p, i)).join('');
    }
    updateMetricsFooter(id);
}

function removePost(id, index) {
    const state = getDrawerState(id);
    if (!state) return;
    state.posts[index]._removed = true;
    refreshPostsTable(id);
}

function unremovePost(id, index) {
    const state = getDrawerState(id);
    if (!state) return;
    delete state.posts[index]._removed;
    refreshPostsTable(id);
}

function editPost(id, index) {
    const state = getDrawerState(id);
    if (!state) return;
    state.posts[index]._editing = true;
    refreshPostsTable(id);
}

function onPostEngagementChange(id, index) {
    const engEl = document.getElementById(`post-eng-${id}-${index}`);
    const cntEl = document.getElementById(`post-cnt-${id}-${index}`);
    const adjEl = document.getElementById(`post-adj-${id}-${index}`);
    if (!engEl || !adjEl) return;
    const eng = parseFloat(engEl.value) || 0;
    const cnt = parseFloat(cntEl?.value) || 1;
    adjEl.textContent = Math.round(eng / Math.sqrt(cnt));
}

function savePostEdit(id, index) {
    const state = getDrawerState(id);
    if (!state) return;
    const post = state.posts[index];

    const engEl = document.getElementById(`post-eng-${id}-${index}`);
    const cntEl = document.getElementById(`post-cnt-${id}-${index}`);
    const sentEl = document.getElementById(`post-sent-${id}-${index}`);
    const ctxEl = document.getElementById(`post-ctx-${id}-${index}`);

    if (engEl) post.engagement = parseFloat(engEl.value) || 0;
    if (cntEl) post.restaurant_count_in_post = parseInt(cntEl.value) || 1;
    if (sentEl) post.sentiment = sentEl.value;
    if (ctxEl) post.context = ctxEl.value;
    post.adjusted_engagement = post.engagement / Math.sqrt(post.restaurant_count_in_post || 1);
    delete post._editing;

    refreshPostsTable(id);
}

async function addPost(id) {
    const inputEl = document.getElementById(`add-post-id-${id}`);
    if (!inputEl) return;
    const postId = inputEl.value.trim();
    if (!postId) return;

    const state = getDrawerState(id);
    if (!state) return;

    // Check for duplicate
    if (state.posts.some(p => p.post_id === postId)) {
        showToast('该帖子已存在', 'error');
        return;
    }

    // Try to fetch post data
    let title = '', date = '', engagement = 0;
    try {
        const res = await fetch(`/api/post/${encodeURIComponent(postId)}`);
        const data = await res.json();
        if (data.ok && data.post) {
            title = data.post.title || '';
            date = data.post.date || '';
            engagement = data.post.engagement || 0;
        }
    } catch (e) {
        // Silently continue — user can fill in manually
    }

    state.posts.push({
        post_id: postId,
        title,
        date,
        engagement,
        context: '',
        restaurant_count_in_post: 1,
        sentiment: 'positive',
        adjusted_engagement: engagement,
    });

    inputEl.value = '';

    // If no table yet, re-render the whole posts panel
    const tbody = document.getElementById(`posts-tbody-${id}`);
    if (!tbody) {
        const panelContainer = document.querySelector(`#drawer-${id} .flex.gap-4 > div:last-child`);
        if (panelContainer) panelContainer.innerHTML = renderPostsPanel(id, state.posts);
    } else {
        refreshPostsTable(id);
    }
}

// ─── Place ID re-fetch ─────────────────────────────────────────────────────────

async function refetchPlaceId(id) {
    const inputEl = document.getElementById(`edit-${id}-google_place_id`);
    const previewEl = document.getElementById(`refetch-preview-${id}`);
    const btn = document.getElementById(`refetch-btn-${id}`);
    if (!inputEl || !previewEl) return;

    const newPlaceId = inputEl.value.trim();
    if (!newPlaceId) {
        showToast('请先输入 Place ID', 'error');
        return;
    }

    const orig = approved.find(r => r.id === id);
    if (orig && newPlaceId === orig.google_place_id) {
        showToast('Place ID 未变更', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '获取中...';
    previewEl.classList.add('hidden');

    try {
        const result = await apiCall(`/api/relink-place/${id}`, { google_place_id: newPlaceId });

        if (!result.ok && result.conflict) {
            // Show merge dialog
            openMergeDialog(id, newPlaceId, result.conflict);
        } else if (result.ok && result.newData) {
            // Show diff preview
            const state = getDrawerState(id);
            if (state) {
                state.pendingGoogleData = { ...result.newData, google_place_id: newPlaceId };
                state.pendingPlaceId = newPlaceId;
            }

            const { google_name, address, google_rating } = result.newData;
            const lines = [];
            if (google_name) lines.push(`名称 → "${google_name}"`);
            if (address) lines.push(`地址 → "${address}"`);
            if (google_rating) lines.push(`评分 → ${google_rating}`);
            previewEl.innerHTML = `<span class="font-medium">将更新：</span> ${escHtml(lines.join(' · '))}`;
            previewEl.classList.remove('hidden');
        } else if (result.error) {
            showToast('获取失败：' + result.error, 'error');
        }
    } catch (err) {
        showToast('请求失败：' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '↻ 重新获取';
    }
}

// ─── Save drawer ──────────────────────────────────────────────────────────────

async function saveDrawer(id) {
    const r = approved.find(x => x.id === id);
    const state = getDrawerState(id);
    if (!r || !state) return;

    const edits = {};

    const textFields = ['name', 'name_en', 'cuisine', 'area', 'address', 'price_range'];
    for (const f of textFields) {
        const el = document.getElementById(`edit-${id}-${f}`);
        if (el && el.value !== (r?.[f] || '')) edits[f] = el.value;
    }

    const ratingEl = document.getElementById(`edit-${id}-google_rating`);
    if (ratingEl && ratingEl.value !== '') {
        const val = parseFloat(ratingEl.value);
        if (!isNaN(val) && val !== (r?.google_rating || null)) edits.google_rating = val;
    }

    const verifiedEl = document.getElementById(`edit-${id}-verified`);
    if (verifiedEl && verifiedEl.checked !== (r?.verified || false)) edits.verified = verifiedEl.checked;

    // Include post_details if changed
    const activePosts = state.posts.filter(p => !p._removed).map(({ _removed, _editing, ...p }) => p);
    const origPosts = r.post_details || [];
    const postsChanged = JSON.stringify(activePosts) !== JSON.stringify(origPosts);
    if (postsChanged) {
        edits.post_details = activePosts;
    }

    // Include Google data from re-fetch if any
    if (state.pendingGoogleData) {
        Object.assign(edits, state.pendingGoogleData);
    }

    const reasonEl = document.getElementById(`edit-${id}-reason`);
    const reason = reasonEl?.value || '';

    if (Object.keys(edits).length === 0) {
        toggleDrawer(id);
        return;
    }

    const result = await apiCall(`/api/correct/${id}`, { edits, reason });
    if (result.ok) {
        Object.assign(r, edits);
        // Re-render row in place
        const rowEl = document.getElementById('row-' + id);
        if (rowEl && r) rowEl.outerHTML = approvedRow(r);
        showToast('已保存 ✓');
    } else {
        showToast('保存失败：' + result.error, 'error');
    }
}

// ─── Merge dialog ──────────────────────────────────────────────────────────────

let mergeDialogState = null;

function openMergeDialog(currentId, newPlaceId, conflict) {
    const current = approved.find(r => r.id === currentId);
    if (!current) return;

    mergeDialogState = { currentId, newPlaceId, conflict };

    const currentPosts = (current.post_details || []).map((p, i) => ({
        ...p,
        _source: 'current',
        _key: `current-${i}`,
    }));
    const conflictPosts = (conflict.post_details || []).map((p, i) => ({
        ...p,
        _source: 'conflict',
        _key: `conflict-${i}`,
    }));
    const allPosts = [...currentPosts, ...conflictPosts];

    const postRows = allPosts.map(p => `
        <label class="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
            <input type="checkbox" class="merge-post-check mt-0.5" value="${escHtml(p._key)}" checked>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-medium truncate">${escHtml(p.title || p.post_id || '—')}</div>
                <div class="text-xs text-gray-400">${escHtml(p.date || '')} · 互动 ${p.engagement || 0}
                    <span class="ml-1 px-1 py-0.5 rounded text-xs ${p._source === 'current' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}">${p._source === 'current' ? '当前' : '冲突'}</span>
                </div>
            </div>
        </label>`).join('');

    const dialog = document.createElement('div');
    dialog.id = 'merge-dialog';
    dialog.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
    dialog.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div class="px-5 pt-5 pb-4 border-b border-gray-100">
                <div class="text-base font-semibold text-gray-900 mb-1">合并餐厅</div>
                <div class="text-xs text-gray-500">Place ID 已被另一家餐厅占用。选择要保留的帖子，然后合并。</div>
            </div>
            <!-- Two-column comparison -->
            <div class="grid grid-cols-2 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div>
                    <div class="text-xs font-medium text-blue-600 mb-1">当前餐厅（保留）</div>
                    <div class="font-medium text-sm">${escHtml(current.name)}</div>
                    <div class="text-xs text-gray-500">${escHtml(current.area || current.city || '—')}</div>
                    <div class="text-xs text-gray-500">评分 ${current.google_rating || '—'} · ${(current.post_details || []).length} 条帖子</div>
                </div>
                <div>
                    <div class="text-xs font-medium text-amber-600 mb-1">冲突餐厅（将合并）</div>
                    <div class="font-medium text-sm">${escHtml(conflict.name)}</div>
                    <div class="text-xs text-gray-500">${escHtml(conflict.area || '—')}</div>
                    <div class="text-xs text-gray-500">评分 ${conflict.google_rating || '—'} · ${(conflict.post_details || []).length} 条帖子</div>
                </div>
            </div>
            <!-- Post checklist -->
            <div class="flex-1 overflow-auto px-5 py-3">
                <div class="text-xs font-medium text-gray-500 mb-2">选择要保留的帖子</div>
                ${postRows}
            </div>
            <div class="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
                <button onclick="closeMergeDialog()"
                        class="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                    取消
                </button>
                <button onclick="executeMerge()"
                        class="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors">
                    合并
                </button>
            </div>
        </div>`;

    // Store all posts on the dialog for later use
    dialog._allPosts = allPosts;
    document.body.appendChild(dialog);
}

function closeMergeDialog() {
    const dialog = document.getElementById('merge-dialog');
    if (dialog) dialog.remove();
    // Revert Place ID field
    if (mergeDialogState) {
        const { currentId } = mergeDialogState;
        const orig = approved.find(r => r.id === currentId);
        const inputEl = document.getElementById(`edit-${currentId}-google_place_id`);
        if (inputEl && orig) inputEl.value = orig.google_place_id || '';
    }
    mergeDialogState = null;
}

async function executeMerge() {
    if (!mergeDialogState) return;
    const { currentId, newPlaceId, conflict } = mergeDialogState;

    const dialog = document.getElementById('merge-dialog');
    const allPosts = dialog._allPosts || [];
    const checks = dialog.querySelectorAll('.merge-post-check');
    const selectedKeys = new Set([...checks].filter(c => c.checked).map(c => c.value));

    const mergedPostDetails = allPosts
        .filter(p => selectedKeys.has(p._key))
        .map(({ _source, _key, ...p }) => p);

    // Fetch Google data for the new place_id (re-fetch was already done)
    // Pass googleData from the refetch state
    const state = getDrawerState(currentId);
    const googleData = state?.pendingGoogleData || { google_place_id: newPlaceId };

    const mergeBtn = dialog.querySelector('button:last-child');
    mergeBtn.disabled = true;
    mergeBtn.textContent = '合并中...';

    try {
        const result = await apiCall('/api/merge', {
            keepId: currentId,
            mergeId: conflict.id,
            mergedPostDetails,
            googleData,
        });

        if (result.ok) {
            dialog.remove();
            mergeDialogState = null;
            showToast('合并成功 ✓');
            // Reload data to reflect changes
            await loadData();
            renderApproved();
            updateCounts();
        } else {
            mergeBtn.disabled = false;
            mergeBtn.textContent = '合并';
            showToast('合并失败：' + result.error, 'error');
        }
    } catch (err) {
        mergeBtn.disabled = false;
        mergeBtn.textContent = '合并';
        showToast('请求失败：' + err.message, 'error');
    }
}

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadData();
        updateCounts();
        renderPending();
        renderApproved();
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
    } catch (err) {
        document.getElementById('loading').innerHTML =
            `<div class="text-center"><p class="text-red-500 mb-2">加载失败</p><p class="text-sm text-gray-400">${escHtml(err.message)}</p><p class="text-xs text-gray-400 mt-2">请确认 dev.js 正在运行</p></div>`;
    }
});
