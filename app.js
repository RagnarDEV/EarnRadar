// app.js — EarnRadar Main Application
// Handles: rendering, filtering, search, modal, theme, i18n, stats animation

/* ==========================================
   STATE
========================================== */
const API_BASE = 'https://earnradar-work.manasa.workers.dev';

async function loadFromAPI() {
  try {
    const res = await fetch(`${API_BASE}/api/opportunities`);
    const data = await res.json();
    if (data && data.length > 0) {
      // استبدل البيانات الثابتة بالبيانات الحية
      OPPORTUNITIES.push(...data);
    }
  } catch(e) {
    console.log('Using static data as fallback');
  }
}
const State = {
  currentLang: 'ar',
  currentTheme: localStorage.getItem('theme') || 'dark',
  currentCat: 'all',
  currentSort: 'newest',
  currentDevice: 'all',
  currentPay: 'all',
  searchQuery: '',
  page: 1,
  perPage: 6,
  filtered: [],
  saved: JSON.parse(localStorage.getItem('savedOpps') || '[]')
};

/* ==========================================
   INIT
========================================== */
document.addEventListener('DOMContentLoaded', async () => {
  await loadFromAPI(); // ← أضف هذا السطر أولاً
  applyTheme();
  initFiltered();
  // ... باقي الكود
});
  renderTicker();
  renderStats();
  renderNewToday();
  renderTrending();
  renderMainGrid();
  renderTopRated();
  renderCatStats();
  renderSources();
  setupEventListeners();
  animateCounters();
});

/* ==========================================
   THEME
========================================== */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', State.currentTheme === 'light' ? 'light' : '');
  document.getElementById('themeIcon').textContent = State.currentTheme === 'light' ? '🌙' : '☀️';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  State.currentTheme = State.currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', State.currentTheme);
  applyTheme();
});

/* ==========================================
   FILTERING & SORTING
========================================== */
function initFiltered() {
  let data = [...OPPORTUNITIES];

  if (State.currentCat !== 'all') {
    data = data.filter(o => o.category === State.currentCat);
  }
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    data = data.filter(o =>
      o.title.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      o.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  if (State.currentDevice !== 'all') {
    data = data.filter(o => o.devices === State.currentDevice || o.devices === 'both');
  }
  if (State.currentPay !== 'all') {
    data = data.filter(o => o.payment.includes(State.currentPay));
  }

  switch (State.currentSort) {
    case 'newest': data.sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt)); break;
    case 'trending': data.sort((a,b) => b.views - a.views); break;
    case 'rated': data.sort((a,b) => b.rating - a.rating); break;
    case 'earning': data.sort((a,b) => (b.earningLevel === 'high' ? 3 : b.earningLevel === 'medium' ? 2 : 1) - (a.earningLevel === 'high' ? 3 : a.earningLevel === 'medium' ? 2 : 1)); break;
  }

  State.filtered = data;
  document.getElementById('resultCount').textContent = `${data.length} فرصة`;
}

/* ==========================================
   CARD RENDERER
========================================== */
function renderCard(opp, size = 'normal') {
  const cat = CATEGORIES.find(c => c.id === opp.category) || CATEGORIES[CATEGORIES.length - 1];
  const timeAgo = getTimeAgo(opp.publishedAt);
  const statusMap = { new: 'status-new', trending: 'status-trending', recommended: 'status-recommended' };
  const statusLabel = { new: 'جديد', trending: 'رائج', recommended: 'موصى به' };

  return `
    <div class="opp-card" data-id="${opp.id}" onclick="openModal(${opp.id})">
      <div class="card-img-placeholder">${opp.emoji}</div>
      <div class="card-body">
        <div class="card-header-row">
          <div class="card-title">${opp.title}</div>
          <span class="card-status ${statusMap[opp.status] || 'status-new'}">${statusLabel[opp.status] || 'جديد'}</span>
        </div>
        <div class="card-desc">${opp.description}</div>
        <div class="card-meta">
          <span class="meta-item earn">💰 ${opp.earnings}</span>
          <span class="meta-item trust">⭐ ${opp.trustScore}/10</span>
          <span class="meta-item">🌍 ${opp.country.length > 12 ? opp.country.substring(0,12)+'...' : opp.country}</span>
          <span class="meta-item">${opp.isFree ? '🆓 مجاني' : '💳 مدفوع'}</span>
        </div>
      </div>
      <div class="card-footer">
        <span class="card-cat">${cat.icon} ${cat.name}</span>
        <span class="card-rating">★ ${opp.rating}</span>
        <span class="card-time">${timeAgo}</span>
      </div>
    </div>
  `;
}

function renderSkeletons(count, container) {
  container.innerHTML = Array(count).fill(`
    <div class="skel-card">
      <div class="skeleton skel-img"></div>
      <div class="skel-body">
        <div class="skeleton skel-line w-3-4"></div>
        <div class="skeleton skel-line w-full"></div>
        <div class="skeleton skel-line w-1-2"></div>
      </div>
    </div>
  `).join('');
}

/* ==========================================
   SECTIONS
========================================== */
function renderNewToday() {
  const grid = document.getElementById('newTodayGrid');
  const cutoff = Date.now() - 24 * 3600000;
  const items = OPPORTUNITIES
    .filter(o => new Date(o.publishedAt) > cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 3);

  if (items.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;grid-column:1/-1">لا توجد فرص جديدة منذ 24 ساعة</p>';
    return;
  }
  grid.innerHTML = items.map(o => renderCard(o)).join('');
}

function renderTrending() {
  const grid = document.getElementById('trendingGrid');
  const items = OPPORTUNITIES
    .filter(o => o.status === 'trending' || o.views > 10000)
    .sort((a, b) => b.views - a.views)
    .slice(0, 3);
  grid.innerHTML = items.map(o => renderCard(o)).join('');
}

function renderMainGrid(append = false) {
  const grid = document.getElementById('mainGrid');
  const start = (State.page - 1) * State.perPage;
  const slice = State.filtered.slice(0, State.page * State.perPage);

  if (!append) {
    grid.innerHTML = '';
    renderSkeletons(3, grid);
    setTimeout(() => {
      if (State.filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:12px">🔍</div>
          <div>لا توجد نتائج مطابقة</div>
        </div>`;
        return;
      }
      grid.innerHTML = slice.map(o => renderCard(o)).join('');
      document.getElementById('loadMoreBtn').style.display =
        slice.length >= State.filtered.length ? 'none' : 'inline-block';
    }, 400);
  } else {
    const newItems = State.filtered.slice(start, State.page * State.perPage);
    grid.insertAdjacentHTML('beforeend', newItems.map(o => renderCard(o)).join(''));
    document.getElementById('loadMoreBtn').style.display =
      grid.querySelectorAll('.opp-card').length >= State.filtered.length ? 'none' : 'inline-block';
  }
}

function renderTopRated() {
  const list = document.getElementById('topRatedList');
  const items = [...OPPORTUNITIES].sort((a,b) => b.rating - a.rating).slice(0, 5);
  const rankClasses = ['gold', 'silver', 'bronze', '', ''];

  list.innerHTML = items.map((o, i) => `
    <div class="top-rated-item" onclick="openModal(${o.id})">
      <div class="trl-rank ${rankClasses[i]}">${i+1}</div>
      <div class="trl-info">
        <div class="trl-title">${o.title}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="trl-earn">${o.earnings}</span>
          <span class="trl-stars">★ ${o.rating}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderCatStats() {
  const container = document.getElementById('catStats');
  const counts = {};
  OPPORTUNITIES.forEach(o => { counts[o.category] = (counts[o.category] || 0) + 1; });
  const max = Math.max(...Object.values(counts));

  container.innerHTML = CATEGORIES.slice(0, 8).map(cat => `
    <div class="cat-row" onclick="filterByCat('${cat.id}')">
      <span class="cat-icon">${cat.icon}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="cat-name">${cat.name}</span>
          <span class="cat-count">${counts[cat.id] || 0}</span>
        </div>
        <div class="cat-bar-wrap">
          <div class="cat-bar" style="width:${((counts[cat.id]||0)/max*100)}%"></div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderSources() {
  const list = document.getElementById('sourcesList');
  list.innerHTML = SOURCES.slice(0, 8).map(s => `
    <div class="source-item">
      <div class="source-dot ${s.status}"></div>
      <span class="source-name">${s.name}</span>
      <span class="source-count">${s.count}</span>
    </div>
  `).join('');
}

function renderTicker() {
  const inner = document.getElementById('tickerInner');
  const items = OPPORTUNITIES.slice(0, 8);
  const html = items.map(o => {
    const cat = CATEGORIES.find(c => c.id === o.category);
    return `<span class="ticker-item"><span class="ticker-cat">${cat?.icon || '📦'}</span> ${o.title} — ${o.earnings}</span>`;
  }).join('');
  // duplicate for seamless loop
  inner.innerHTML = html + html;
}

/* ==========================================
   STATS COUNTER ANIMATION
========================================== */
function animateCounters() {
  const total = OPPORTUNITIES.length;
  const today = OPPORTUNITIES.filter(o => new Date(o.publishedAt) > Date.now() - 24*3600000).length;

  animateNum('statTotal', 0, total * 8 + 47, 1500);
  animateNum('statToday', 0, today + 3, 1200);
}

function animateNum(id, from, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const step = (to - from) / (duration / 16);
  let current = from;
  const timer = setInterval(() => {
    current = Math.min(current + step, to);
    el.textContent = Math.floor(current);
    if (current >= to) clearInterval(timer);
  }, 16);
}

/* ==========================================
   STATS BOX
========================================== */
function renderStats() {
  // Populated by animateCounters above
}

/* ==========================================
   MODAL
========================================== */
function openModal(id) {
  const opp = OPPORTUNITIES.find(o => o.id === id);
  if (!opp) return;

  const cat = CATEGORIES.find(c => c.id === opp.category);
  const isSaved = State.saved.includes(id);
  const paymentLabels = {paypal:'PayPal', bank:'تحويل بنكي', crypto:'كريبتو', gift:'بطاقات هدايا', payoneer:'Payoneer', check:'شيك', paypal:'PayPal'};

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-img-placeholder">${opp.emoji}</div>
    <div class="modal-body">
      <div class="modal-category">${cat?.icon || ''} ${cat?.name || opp.category}</div>
      <h2 class="modal-title">${opp.title}</h2>
      <p class="modal-desc">${opp.fullDescription}</p>

      <div class="modal-grid">
        <div class="modal-detail">
          <div class="modal-detail-label">💰 الأرباح المتوقعة</div>
          <div class="modal-detail-value green">${opp.earnings}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">⭐ مستوى الموثوقية</div>
          <div class="modal-detail-value gold">${opp.trustScore}/10</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">★ تقييم المستخدمين</div>
          <div class="modal-detail-value">${opp.rating}/5 (${opp.reviews.toLocaleString()} تقييم)</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">🌍 الدول المدعومة</div>
          <div class="modal-detail-value">${opp.country}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">📱 الأجهزة المدعومة</div>
          <div class="modal-detail-value">${opp.devices === 'both' ? 'موبايل وكمبيوتر' : opp.devices === 'mobile' ? 'موبايل فقط' : 'كمبيوتر فقط'}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">💳 طريقة الدفع</div>
          <div class="modal-detail-value">${opp.payment.map(p => paymentLabels[p] || p).join('، ')}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">💵 الحد الأدنى للسحب</div>
          <div class="modal-detail-value orange">${opp.minWithdraw}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">⏱ الوقت المطلوب</div>
          <div class="modal-detail-value">${opp.timeRequired}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">🎯 مستوى الصعوبة</div>
          <div class="modal-detail-value">${opp.difficulty}</div>
        </div>
        <div class="modal-detail">
          <div class="modal-detail-label">🆓 هل هي مجانية؟</div>
          <div class="modal-detail-value green">${opp.isFree ? 'نعم، مجانية تماماً' : 'تتطلب رسوماً'}</div>
        </div>
      </div>

      <div class="modal-tags">
        ${opp.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
      </div>

      <div class="modal-actions">
        <a href="${opp.url}" target="_blank" rel="noopener noreferrer" class="btn-visit" onclick="trackClick(${opp.id})">
          🔗 زيارة الموقع الرسمي
        </a>
        <button class="btn-save" onclick="toggleSave(${opp.id})" id="saveBtn${opp.id}">
          ${isSaved ? '✅ محفوظ' : '🔖 حفظ'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';

  // track view
  const oppRef = OPPORTUNITIES.find(o => o.id === id);
  if (oppRef) oppRef.views = (oppRef.views || 0) + 1;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function toggleSave(id) {
  const btn = document.getElementById(`saveBtn${id}`);
  if (State.saved.includes(id)) {
    State.saved = State.saved.filter(s => s !== id);
    if (btn) btn.textContent = '🔖 حفظ';
    showToast('تم إزالة الفرصة من المحفوظات');
  } else {
    State.saved.push(id);
    if (btn) btn.textContent = '✅ محفوظ';
    showToast('✅ تم حفظ الفرصة!');
  }
  localStorage.setItem('savedOpps', JSON.stringify(State.saved));
}

function trackClick(id) {
  // In production: send analytics event
  console.log('Tracking click for opportunity:', id);
}

/* ==========================================
   SEARCH
========================================== */
let searchTimer;

document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    State.searchQuery = e.target.value.trim();
    const resultsEl = document.getElementById('searchResults');

    if (!State.searchQuery) { resultsEl.innerHTML = ''; return; }

    const q = State.searchQuery.toLowerCase();
    const matches = OPPORTUNITIES.filter(o =>
      o.title.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      o.tags.some(t => t.toLowerCase().includes(q))
    ).slice(0, 6);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد نتائج</div>';
      return;
    }

    resultsEl.innerHTML = matches.map(o => `
      <div onclick="openModal(${o.id});closeSearch()" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;cursor:pointer;transition:var(--transition)" onmouseover="this.style.borderColor='var(--border-accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:4px">${o.emoji} ${o.title}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${o.description.substring(0,80)}...</div>
      </div>
    `).join('');
  }, 300);
});

function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('active');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}

/* ==========================================
   EVENT LISTENERS
========================================== */
function setupEventListeners() {
  // Search toggle
  document.getElementById('searchToggle').addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.toggle('active');
    if (document.getElementById('searchOverlay').classList.contains('active')) {
      setTimeout(() => document.getElementById('searchInput').focus(), 100);
    }
  });
  document.getElementById('searchClose').addEventListener('click', closeSearch);

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeSearch();
    }
  });

  // Category chips
  document.getElementById('categoryChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    State.currentCat = chip.dataset.cat;
    State.page = 1;
    initFiltered();
    renderMainGrid();
  });

  // Sort/filter selects
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    State.currentSort = e.target.value;
    State.page = 1;
    initFiltered();
    renderMainGrid();
  });

  document.getElementById('deviceFilter').addEventListener('change', (e) => {
    State.currentDevice = e.target.value;
    State.page = 1;
    initFiltered();
    renderMainGrid();
  });

  document.getElementById('payFilter').addEventListener('change', (e) => {
    State.currentPay = e.target.value;
    State.page = 1;
    initFiltered();
    renderMainGrid();
  });

  // Load more
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    State.page++;
    renderMainGrid(true);
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.querySelector('svg').style.animation = 'spin 0.5s linear infinite';
    setTimeout(() => {
      renderNewToday();
      showToast('✅ تم التحديث بنجاح');
      btn.disabled = false;
      btn.querySelector('svg').style.animation = '';
    }, 800);
  });

  // Mobile menu
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('nav').classList.toggle('open');
  });

  // Language select
  document.getElementById('langSelect').addEventListener('change', (e) => {
    State.currentLang = e.target.value;
    showToast(`تم تغيير اللغة`);
    // In production: full i18n re-render
  });
}

/* ==========================================
   FILTER BY CATEGORY (from sidebar)
========================================== */
function filterByCat(catId) {
  State.currentCat = catId;
  State.page = 1;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.cat === catId);
  });
  initFiltered();
  renderMainGrid();
  document.getElementById('all-opps').scrollIntoView({ behavior: 'smooth' });
}

/* ==========================================
   TOAST
========================================== */
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

/* ==========================================
   UTILITIES
========================================== */
function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${days} يوم`;
}

// Auto-refresh ticker every 5 min
setInterval(renderTicker, 5 * 60 * 1000);

// Simulate live update indicator
setInterval(() => {
  const dot = document.querySelector('.pulse-dot');
  if (dot) dot.style.background = '#FF6B35';
  setTimeout(() => { if (dot) dot.style.background = '#00D4AA'; }, 500);
}, 10000);
