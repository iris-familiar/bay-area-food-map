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
            // Move to approved list
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
        <button onclick="toggleEdit('${r.id}')"
                class="shrink-0 text-blue-500 text-sm px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
            <i class="fas fa-pencil"></i>
        </button>
    </div>
    <div id="edit-${r.id}" class="hidden border-t border-gray-100 px-4 py-4 bg-gray-50">
        ${editForm(r)}
    </div>
</div>`;
}

function editForm(r) {
    return `<div class="grid grid-cols-2 gap-3 mb-3">
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">中文名</span>
        <input type="text" value="${escHtml(r.name || '')}" id="edit-${r.id}-name"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">英文名</span>
        <input type="text" value="${escHtml(r.name_en || '')}" id="edit-${r.id}-name_en"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">菜系</span>
        <input type="text" value="${escHtml(r.cuisine || '')}" id="edit-${r.id}-cuisine"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">区域/城市</span>
        <input type="text" value="${escHtml(r.area || r.city || '')}" id="edit-${r.id}-area"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block col-span-2">
        <span class="text-xs text-gray-500 mb-1 block">地址</span>
        <input type="text" value="${escHtml(r.address || '')}" id="edit-${r.id}-address"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">Google 评分</span>
        <input type="number" step="0.1" min="1" max="5" value="${r.google_rating || ''}" id="edit-${r.id}-google_rating"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="block">
        <span class="text-xs text-gray-500 mb-1 block">人均价位</span>
        <input type="text" value="${escHtml(r.price_range || '')}" id="edit-${r.id}-price_range"
               class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
    </label>
    <label class="flex items-center gap-2 col-span-2">
        <input type="checkbox" id="edit-${r.id}-verified" ${r.verified ? 'checked' : ''} class="rounded">
        <span class="text-sm text-gray-700">已 Google 验证</span>
    </label>
</div>
<label class="block mb-3">
    <span class="text-xs text-gray-500 mb-1 block">备注（可选）</span>
    <input type="text" placeholder="修改原因..." id="edit-${r.id}-reason"
           class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
</label>
<div class="flex gap-2">
    <button onclick="saveEdit('${r.id}')"
            class="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
        保存
    </button>
    <button onclick="toggleEdit('${r.id}')"
            class="px-5 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
        取消
    </button>
</div>`;
}

function toggleEdit(id) {
    const el = document.getElementById('edit-' + id);
    el.classList.toggle('hidden');
}

async function saveEdit(id) {
    const r = approved.find(x => x.id === id);
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

    const reasonEl = document.getElementById(`edit-${id}-reason`);
    const reason = reasonEl?.value || '';

    if (Object.keys(edits).length === 0) {
        toggleEdit(id);
        return;
    }

    const result = await apiCall(`/api/correct/${id}`, { edits, reason });
    if (result.ok) {
        if (r) Object.assign(r, edits);
        // Re-render row in place
        const rowEl = document.getElementById('row-' + id);
        if (rowEl && r) rowEl.outerHTML = approvedRow(r);
        showToast('已保存 ✓');
    } else {
        showToast('保存失败：' + result.error, 'error');
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
