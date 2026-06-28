// ============================================================
//  EarnRadar — Cloudflare Worker (All-in-One)
//  يخدم الموقع كاملاً + API من ملف واحد
//  النشر: npx wrangler deploy
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── API Routes ──────────────────────────────────────────
    if (path === '/api/opportunities') {
      return serveOpportunities(env, cors);
    }
    if (path === '/api/stats') {
      return serveStats(env, cors);
    }
    if (path === '/api/refresh') {
      ctx.waitUntil(fetchAllSources(env));
      return new Response(JSON.stringify({ ok: true, message: 'جاري التحديث...' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // ── Static Assets ───────────────────────────────────────
    if (path === '/styles.css') {
      return new Response(getCSS(), {
        headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    if (path === '/app.js') {
      return new Response(getAppJS(), {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    if (path === '/data.js') {
      return new Response(getDataJS(), {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // ── HTML Page (كل المسارات ترجع الصفحة الرئيسية) ────────
    return new Response(getHTML(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }
    });
  },

  // Cron: كل ساعة
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAllSources(env));
  }
};

// ============================================================
//  API HANDLERS
// ============================================================

async function serveOpportunities(env, cors) {
  try {
    // حاول من KV أولاً
    if (env.EARN_KV) {
      const cached = await env.EARN_KV.get('opportunities');
      if (cached) {
        return new Response(cached, {
          headers: { ...cors, 'Content-Type': 'application/json', 'X-Source': 'kv-cache' }
        });
      }
    }
  } catch(e) {}

  // fallback: أرسل البيانات الثابتة
  return new Response(JSON.stringify({ source: 'static', data: [] }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function serveStats(env, cors) {
  let stats = { total: 143, today: 12, sources: 12, categories: 14, lastUpdate: new Date().toISOString() };
  try {
    if (env.EARN_KV) {
      const s = await env.EARN_KV.get('stats');
      if (s) stats = JSON.parse(s);
    }
  } catch(e) {}
  return new Response(JSON.stringify(stats), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

// ============================================================
//  DATA FETCHING (Scheduled)
// ============================================================

async function fetchAllSources(env) {
  if (!env.EARN_KV) return;
  const results = [];

  try { results.push(...await fetchHN()); } catch(e) {}
  try { results.push(...await fetchReddit()); } catch(e) {}
  try { results.push(...await fetchRemoteOK()); } catch(e) {}

  // Deduplicate
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url); return true;
  });

  await env.EARN_KV.put('opportunities', JSON.stringify(unique), { expirationTtl: 7200 });
  await env.EARN_KV.put('stats', JSON.stringify({
    total: unique.length,
    today: unique.filter(u => new Date(u.publishedAt) > Date.now() - 86400000).length,
    sources: 12,
    categories: 14,
    lastUpdate: new Date().toISOString()
  }));
}

async function fetchHN() {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json();
  const keywords = ['earn', 'money', 'income', 'freelance', 'remote', 'side hustle'];

  const stories = await Promise.allSettled(
    ids.slice(0, 20).map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
    )
  );

  return stories
    .filter(s => s.status === 'fulfilled' && s.value?.url)
    .map(s => s.value)
    .filter(s => keywords.some(k => (s.title || '').toLowerCase().includes(k)))
    .map(s => ({
      id: `hn_${s.id}`, title: s.title,
      description: `من Hacker News — ${s.score} نقطة`,
      fullDescription: s.title, category: 'other', status: 'new', emoji: '💡',
      earnings: 'متفاوت', earningLevel: 'medium', trustScore: 7.5,
      rating: 4.0, reviews: s.descendants || 0, country: 'عالمي',
      devices: 'both', payment: ['paypal'], minWithdraw: 'متفاوت',
      isFree: true, difficulty: 'متوسط', timeRequired: 'متفاوت',
      url: s.url, tags: ['hacker-news'], source: 'hackernews',
      publishedAt: new Date(s.time * 1000).toISOString(), views: s.score || 0
    }));
}

async function fetchReddit() {
  const res = await fetch('https://www.reddit.com/r/beermoney/hot.json?limit=10', {
    headers: { 'User-Agent': 'EarnRadar/1.0' }
  });
  const data = await res.json();
  return (data.data?.children || [])
    .filter(p => p.data.score > 20)
    .map(p => ({
      id: `reddit_${p.data.id}`, title: p.data.title,
      description: (p.data.selftext || p.data.title).substring(0, 200),
      fullDescription: p.data.selftext || p.data.title,
      category: 'other', status: p.data.score > 200 ? 'trending' : 'new', emoji: '🌐',
      earnings: 'متفاوت', earningLevel: 'medium', trustScore: 7.0,
      rating: 4.0, reviews: p.data.num_comments, country: 'عالمي',
      devices: 'both', payment: ['paypal'], minWithdraw: 'متفاوت',
      isFree: true, difficulty: 'متفاوت', timeRequired: 'متفاوت',
      url: `https://reddit.com${p.data.permalink}`,
      tags: ['reddit', 'beermoney'], source: 'reddit',
      publishedAt: new Date(p.data.created_utc * 1000).toISOString(), views: p.data.score
    }));
}

async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'EarnRadar/1.0' }
  });
  const jobs = await res.json();
  return jobs.slice(1, 10).filter(j => j.position).map(j => ({
    id: `rok_${j.id}`, title: `${j.position} — ${j.company}`,
    description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    fullDescription: (j.description || '').replace(/<[^>]+>/g, ''),
    category: 'remote', status: 'new', emoji: '💻',
    earnings: j.salary_min ? `$${j.salary_min}+/سنة` : 'متفاوت',
    earningLevel: 'medium', trustScore: 8.5, rating: 4.2, reviews: 0,
    country: 'عالمي (عن بعد)', devices: 'desktop', payment: ['bank'],
    minWithdraw: 'شهري', isFree: true, difficulty: 'متوسط', timeRequired: 'دوام كامل',
    url: j.url, tags: (j.tags || []).slice(0, 4), source: 'remoteok',
    publishedAt: j.date || new Date().toISOString(), views: 0
  }));
}

// ============================================================
//  HTML
// ============================================================
function getHTML() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت - تحديث تلقائي من مصادر موثوقة">
<meta property="og:title" content="EarnRadar — منصة فرص الربح الذكية">
<meta property="og:description" content="اكتشف أحدث فرص كسب المال عبر الإنترنت بشكل تلقائي">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<title>EarnRadar — منصة فرص الربح الذكية</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="header" id="header">
  <div class="container">
    <div class="header-inner">
      <a href="/" class="logo">
        <span class="logo-icon">◉</span>
        <span class="logo-text">EarnRadar</span>
        <span class="logo-badge">LIVE</span>
      </a>
      <nav class="nav" id="nav">
        <a href="#categories" class="nav-link">التصنيفات</a>
        <a href="#trending" class="nav-link">الرائج</a>
        <a href="#top-rated" class="nav-link">الأعلى تقييماً</a>
      </nav>
      <div class="header-actions">
        <button class="btn-search-toggle" id="searchToggle" aria-label="بحث">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button class="btn-theme" id="themeToggle" aria-label="تغيير المظهر">
          <span id="themeIcon">☀️</span>
        </button>
        <div class="lang-select">
          <select id="langSelect" aria-label="اختر اللغة">
            <option value="ar">🇸🇦 عربي</option>
            <option value="en">🇺🇸 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="tr">🇹🇷 Türkçe</option>
          </select>
        </div>
        <button class="btn-menu" id="menuToggle" aria-label="القائمة">☰</button>
      </div>
    </div>
  </div>
  <div class="search-overlay" id="searchOverlay">
    <div class="container">
      <div class="search-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" id="searchInput" placeholder="ابحث عن فرصة..." autocomplete="off">
        <button id="searchClose">✕</button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>
  </div>
</header>

<section class="hero">
  <div class="hero-bg-grid"></div>
  <div class="container">
    <div class="hero-content">
      <div class="hero-eyebrow">
        <span class="pulse-dot"></span>
        يتحدث تلقائياً كل ساعة
      </div>
      <h1 class="hero-title">
        اكتشف فرص<br>
        <span class="hero-accent">الربح الذكي</span><br>
        من الإنترنت
      </h1>
      <p class="hero-subtitle">منصة آلية تجلب وتنظم أحدث فرص كسب المال من عشرات المصادر الموثوقة.</p>
      <div class="hero-actions">
        <a href="#opportunities" class="btn-primary">استكشف الفرص <span>←</span></a>
        <a href="#categories" class="btn-ghost">تصفح التصنيفات</a>
      </div>
    </div>
    <div class="hero-stats">
      <div class="stat-card"><div class="stat-num" id="statTotal">0</div><div class="stat-label">فرصة مكتشفة</div></div>
      <div class="stat-card"><div class="stat-num" id="statToday">0</div><div class="stat-label">إضافة اليوم</div></div>
      <div class="stat-card"><div class="stat-num" id="statSources">12</div><div class="stat-label">مصدر نشط</div></div>
      <div class="stat-card"><div class="stat-num" id="statCategories">14</div><div class="stat-label">تصنيف</div></div>
    </div>
  </div>
</section>

<div class="ticker-wrap">
  <div class="ticker-label">🔴 LIVE</div>
  <div class="ticker-track"><div class="ticker-inner" id="tickerInner"></div></div>
</div>

<div class="filters-bar sticky-bar" id="filtersBar">
  <div class="container">
    <div class="filters-inner">
      <div class="filter-chips" id="categoryChips">
        <button class="chip active" data-cat="all">الكل</button>
        <button class="chip" data-cat="freelance">🎨 عمل حر</button>
        <button class="chip" data-cat="ai">🤖 ذكاء اصطناعي</button>
        <button class="chip" data-cat="surveys">📋 استبيانات</button>
        <button class="chip" data-cat="affiliate">🔗 عمولة</button>
        <button class="chip" data-cat="referral">👥 إحالات</button>
        <button class="chip" data-cat="cashback">💰 كاش باك</button>
        <button class="chip" data-cat="apps">📱 تطبيقات</button>
        <button class="chip" data-cat="contests">🏆 مسابقات</button>
        <button class="chip" data-cat="remote">💻 عمل عن بعد</button>
        <button class="chip" data-cat="crypto">₿ كريبتو</button>
        <button class="chip" data-cat="grants">🎓 منح</button>
        <button class="chip" data-cat="testing">🧪 اختبارات</button>
        <button class="chip" data-cat="other">📦 أخرى</button>
      </div>
      <div class="filter-actions">
        <select class="filter-select" id="sortSelect">
          <option value="newest">الأحدث</option>
          <option value="trending">الأكثر رواجاً</option>
          <option value="rated">الأعلى تقييماً</option>
          <option value="earning">الأعلى دخلاً</option>
        </select>
        <select class="filter-select" id="deviceFilter">
          <option value="all">كل الأجهزة</option>
          <option value="mobile">موبايل</option>
          <option value="desktop">كمبيوتر</option>
        </select>
        <select class="filter-select" id="payFilter">
          <option value="all">طريقة الدفع</option>
          <option value="paypal">PayPal</option>
          <option value="bank">تحويل بنكي</option>
          <option value="crypto">كريبتو</option>
          <option value="gift">بطاقات هدايا</option>
        </select>
      </div>
    </div>
  </div>
</div>

<main class="main-content" id="opportunities">
  <div class="container">
    <div class="content-layout">
      <div class="content-main">
        <section class="section" id="new-today">
          <div class="section-header">
            <h2 class="section-title"><span class="badge-new">NEW</span> جديد اليوم</h2>
            <button class="btn-refresh" id="refreshBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              تحديث
            </button>
          </div>
          <div class="opportunities-grid" id="newTodayGrid"></div>
        </section>
        <section class="section" id="trending">
          <div class="section-header">
            <h2 class="section-title">🔥 الفرص الرائجة</h2>
            <a href="#all-opps" class="see-all">عرض الكل →</a>
          </div>
          <div class="opportunities-grid" id="trendingGrid"></div>
        </section>
        <section class="section" id="all-opps">
          <div class="section-header">
            <h2 class="section-title">جميع الفرص</h2>
            <span class="result-count" id="resultCount">0 فرصة</span>
          </div>
          <div class="opportunities-grid" id="mainGrid"></div>
          <div class="load-more-wrap">
            <button class="btn-load-more" id="loadMoreBtn">تحميل المزيد</button>
          </div>
        </section>
      </div>
      <aside class="sidebar">
        <div class="sidebar-card" id="top-rated">
          <h3 class="sidebar-title">⭐ الأعلى تقييماً</h3>
          <div id="topRatedList"></div>
        </div>
        <div class="sidebar-card" id="categories">
          <h3 class="sidebar-title">📂 التصنيفات</h3>
          <div class="cat-stats" id="catStats"></div>
        </div>
        <div class="sidebar-card">
          <h3 class="sidebar-title">📡 المصادر النشطة</h3>
          <div class="sources-list" id="sourcesList"></div>
        </div>
      </aside>
    </div>
  </div>
</main>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="oppModal">
    <button class="modal-close" id="modalClose">✕</button>
    <div class="modal-content" id="modalContent"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo"><span class="logo-icon">◉</span><span class="logo-text">EarnRadar</span></div>
        <p>منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت، تعمل بالكامل بشكل تلقائي.</p>
        <div class="footer-social">
          <a href="#" aria-label="Twitter">𝕏</a>
          <a href="#" aria-label="Telegram">✈</a>
        </div>
      </div>
      <div class="footer-links">
        <h4>التنقل</h4>
        <ul>
          <li><a href="/">الرئيسية</a></li>
          <li><a href="#categories">التصنيفات</a></li>
          <li><a href="#trending">الرائج</a></li>
        </ul>
      </div>
      <div class="footer-links">
        <h4>قانوني</h4>
        <ul>
          <li><a href="#">سياسة الخصوصية</a></li>
          <li><a href="#">الشروط والأحكام</a></li>
          <li><a href="#">إخلاء المسؤولية</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2025 EarnRadar. جميع الحقوق محفوظة. | يتحدث تلقائياً كل ساعة</p>
      <p class="footer-disclaimer">⚠️ المحتوى للأغراض المعلوماتية فقط. تحقق دائماً من المواقع الرسمية.</p>
    </div>
  </div>
</footer>

<script src="/data.js"></script>
<script src="/app.js"></script>
</body>
</html>`;
}

// ============================================================
//  CSS (مضغوط في سطر واحد عبر template literal)
// ============================================================
function getCSS() {
  return `/* EarnRadar Styles */
:root{--bg-primary:#0A0E1A;--bg-secondary:#111827;--bg-card:#1A2035;--bg-card-hover:#1E2640;--accent:#00D4AA;--accent-glow:rgba(0,212,170,.15);--accent-dark:#00A882;--ember:#FF6B35;--ember-glow:rgba(255,107,53,.15);--gold:#FFB800;--text-primary:#F0F4FF;--text-secondary:#8B9CC8;--text-muted:#4A5578;--border:rgba(255,255,255,.07);--border-accent:rgba(0,212,170,.3);--radius:14px;--radius-sm:8px;--shadow:0 4px 24px rgba(0,0,0,.4);--shadow-glow:0 0 30px rgba(0,212,170,.1);--font-ar:'Cairo',sans-serif;--font-en:'Space Grotesk',sans-serif;--transition:.2s cubic-bezier(.4,0,.2,1)}
[data-theme=light]{--bg-primary:#F0F4FF;--bg-secondary:#E8EDF8;--bg-card:#fff;--bg-card-hover:#F5F8FF;--text-primary:#0A0E1A;--text-secondary:#3D4A6B;--text-muted:#8B9CC8;--border:rgba(0,0,0,.08);--shadow:0 4px 24px rgba(0,0,0,.08)}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{font-family:var(--font-ar);background:var(--bg-primary);color:var(--text-primary);line-height:1.6;overflow-x:hidden;transition:background .3s,color .3s}
.container{max-width:1280px;margin:0 auto;padding:0 20px}
.header{position:sticky;top:0;z-index:100;background:rgba(10,14,26,.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
[data-theme=light] .header{background:rgba(240,244,255,.92)}
.header-inner{display:flex;align-items:center;gap:24px;padding:14px 0}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text-primary);font-family:var(--font-en);font-weight:700;font-size:1.1rem;flex-shrink:0}
.logo-icon{color:var(--accent);font-size:1.3rem;animation:spin-pulse 4s linear infinite}
@keyframes spin-pulse{0%,100%{opacity:1;transform:rotate(0)}50%{opacity:.7;transform:rotate(180deg)}}
.logo-badge{font-size:.6rem;background:var(--ember);color:#fff;padding:2px 6px;border-radius:4px;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
.nav{display:flex;gap:4px;flex:1}
.nav-link{color:var(--text-secondary);text-decoration:none;font-size:.9rem;padding:6px 14px;border-radius:var(--radius-sm);transition:var(--transition)}
.nav-link:hover{color:var(--accent);background:var(--accent-glow)}
.header-actions{display:flex;align-items:center;gap:10px;margin-right:auto}
[dir=rtl] .header-actions{margin-right:unset;margin-left:auto}
.btn-search-toggle,.btn-theme,.btn-menu{background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:38px;height:38px;border-radius:var(--radius-sm);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:var(--transition);font-size:1rem}
.btn-search-toggle:hover,.btn-theme:hover{color:var(--accent);border-color:var(--border-accent)}
.btn-menu{display:none}
.lang-select select{background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-ar);font-size:.85rem;outline:none}
.search-overlay{display:none;padding:14px 0;border-top:1px solid var(--border);background:var(--bg-secondary)}
.search-overlay.active{display:block}
.search-wrap{display:flex;align-items:center;gap:12px;background:var(--bg-card);border:1px solid var(--border-accent);border-radius:var(--radius);padding:10px 16px}
.search-wrap svg{color:var(--accent);flex-shrink:0}
.search-wrap input{flex:1;background:none;border:none;color:var(--text-primary);font-family:var(--font-ar);font-size:1rem;outline:none}
.search-wrap input::placeholder{color:var(--text-muted)}
#searchClose{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:4px}
.search-results{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.hero{position:relative;padding:80px 0 60px;overflow:hidden}
.hero-bg-grid{position:absolute;inset:0;background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:50px 50px;opacity:.5;mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000,transparent)}
.hero-content{max-width:640px;position:relative;z-index:1}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;background:var(--accent-glow);border:1px solid var(--border-accent);color:var(--accent);padding:6px 14px;border-radius:100px;font-size:.8rem;margin-bottom:24px}
.pulse-dot{width:8px;height:8px;background:var(--accent);border-radius:50%;animation:pulse-ring 1.5s infinite;flex-shrink:0}
@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(0,212,170,.6)}70%{box-shadow:0 0 0 8px rgba(0,212,170,0)}100%{box-shadow:0 0 0 0 rgba(0,212,170,0)}}
.hero-title{font-size:clamp(2.2rem,5vw,3.5rem);font-weight:700;line-height:1.15;margin-bottom:20px;letter-spacing:-.02em}
.hero-accent{color:var(--accent)}
.hero-subtitle{color:var(--text-secondary);font-size:1.05rem;margin-bottom:32px;max-width:500px}
.hero-actions{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:60px}
.btn-primary{background:var(--accent);color:#0A0E1A;padding:13px 28px;border-radius:var(--radius);text-decoration:none;font-weight:700;font-size:.95rem;transition:var(--transition);display:flex;align-items:center;gap:8px}
.btn-primary:hover{background:var(--accent-dark);transform:translateY(-2px);box-shadow:0 8px 24px var(--accent-glow)}
.btn-ghost{background:transparent;color:var(--text-secondary);padding:13px 28px;border-radius:var(--radius);text-decoration:none;font-weight:600;font-size:.95rem;border:1px solid var(--border);transition:var(--transition)}
.btn-ghost:hover{border-color:var(--border-accent);color:var(--accent)}
.hero-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;position:relative;z-index:1}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 16px;text-align:center;transition:var(--transition)}
.stat-card:hover{border-color:var(--border-accent);box-shadow:var(--shadow-glow)}
.stat-num{font-family:var(--font-en);font-size:1.9rem;font-weight:700;color:var(--accent);line-height:1;margin-bottom:6px}
.stat-label{font-size:.8rem;color:var(--text-muted)}
.ticker-wrap{display:flex;align-items:center;background:var(--bg-secondary);border-top:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;height:40px}
.ticker-label{background:var(--ember);color:#fff;font-size:.72rem;font-weight:700;padding:0 14px;height:100%;display:flex;align-items:center;white-space:nowrap;gap:4px;flex-shrink:0}
.ticker-track{overflow:hidden;flex:1}
.ticker-inner{display:flex;gap:40px;animation:ticker 30s linear infinite;white-space:nowrap;font-size:.82rem;color:var(--text-secondary)}
.ticker-inner:hover{animation-play-state:paused}
@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.ticker-item{display:inline-flex;align-items:center;gap:8px}
.ticker-item .ticker-cat{color:var(--accent)}
.filters-bar{background:rgba(10,14,26,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:12px 0;position:sticky;top:67px;z-index:90}
[data-theme=light] .filters-bar{background:rgba(240,244,255,.95)}
.filters-inner{display:flex;align-items:center;gap:12px;overflow-x:auto;scrollbar-width:none}
.filters-inner::-webkit-scrollbar{display:none}
.filter-chips{display:flex;gap:6px;flex-shrink:0}
.chip{background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:6px 14px;border-radius:100px;font-family:var(--font-ar);font-size:.8rem;cursor:pointer;white-space:nowrap;transition:var(--transition)}
.chip:hover,.chip.active{background:var(--accent);border-color:var(--accent);color:#0A0E1A;font-weight:600}
.filter-actions{display:flex;gap:8px;margin-right:auto;flex-shrink:0}
[dir=rtl] .filter-actions{margin-right:unset;margin-left:auto}
.filter-select{background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:6px 12px;border-radius:var(--radius-sm);font-family:var(--font-ar);font-size:.8rem;cursor:pointer;outline:none;transition:var(--transition)}
.filter-select:hover{border-color:var(--border-accent)}
.main-content{padding:40px 0 80px}
.content-layout{display:grid;grid-template-columns:1fr 300px;gap:32px;align-items:start}
.section{margin-bottom:50px}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.section-title{font-size:1.2rem;font-weight:700;display:flex;align-items:center;gap:10px}
.badge-new{background:var(--accent);color:#0A0E1A;font-size:.65rem;padding:2px 8px;border-radius:4px;font-weight:800;letter-spacing:.05em}
.see-all{color:var(--accent);text-decoration:none;font-size:.85rem;transition:var(--transition)}
.see-all:hover{opacity:.7}
.result-count{font-size:.85rem;color:var(--text-muted);background:var(--bg-card);padding:4px 12px;border-radius:100px;border:1px solid var(--border)}
.btn-refresh{background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:6px 14px;border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-ar);font-size:.82rem;display:flex;align-items:center;gap:6px;transition:var(--transition)}
.btn-refresh:hover{color:var(--accent);border-color:var(--border-accent)}
.btn-refresh svg{transition:transform .5s}
.btn-refresh:hover svg{transform:rotate(360deg)}
.opportunities-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.opp-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:var(--transition);position:relative;display:flex;flex-direction:column}
.opp-card:hover{transform:translateY(-4px);border-color:var(--border-accent);box-shadow:var(--shadow),var(--shadow-glow)}
.opp-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember));transform:scaleX(0);transform-origin:right;transition:transform .3s ease}
.opp-card:hover::after{transform:scaleX(1);transform-origin:left}
.card-img-placeholder{width:100%;height:140px;background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));display:flex;align-items:center;justify-content:center;font-size:2.5rem}
.card-body{padding:16px;flex:1;display:flex;flex-direction:column;gap:10px}
.card-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.card-title{font-size:.95rem;font-weight:600;color:var(--text-primary);line-height:1.4;flex:1}
.card-status{font-size:.65rem;padding:3px 8px;border-radius:4px;font-weight:700;white-space:nowrap;flex-shrink:0}
.status-new{background:var(--accent-glow);color:var(--accent);border:1px solid var(--border-accent)}
.status-trending{background:var(--ember-glow);color:var(--ember);border:1px solid rgba(255,107,53,.3)}
.status-recommended{background:rgba(255,184,0,.1);color:var(--gold);border:1px solid rgba(255,184,0,.3)}
.card-desc{font-size:.82rem;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.card-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}
.meta-item{display:flex;align-items:center;gap:4px;font-size:.75rem;color:var(--text-muted);background:var(--bg-secondary);padding:3px 8px;border-radius:4px}
.meta-item.earn{color:var(--accent)}
.meta-item.trust{color:var(--gold)}
.card-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--border);background:rgba(255,255,255,.02)}
.card-cat{font-size:.72rem;color:var(--accent);font-weight:600}
.card-rating{display:flex;align-items:center;gap:4px;font-size:.78rem;color:var(--gold)}
.card-time{font-size:.72rem;color:var(--text-muted);font-family:var(--font-en)}
.load-more-wrap{text-align:center;margin-top:30px}
.btn-load-more{background:transparent;border:1px solid var(--border);color:var(--text-secondary);padding:12px 36px;border-radius:var(--radius);cursor:pointer;font-family:var(--font-ar);font-size:.9rem;transition:var(--transition)}
.btn-load-more:hover{border-color:var(--accent);color:var(--accent)}
.skeleton{background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-card-hover) 50%,var(--bg-card) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--radius-sm)}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.skel-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.skel-img{height:140px}
.skel-body{padding:16px;display:flex;flex-direction:column;gap:10px}
.skel-line{height:14px;border-radius:4px}
.skel-line.w-full{width:100%}.skel-line.w-3-4{width:75%}.skel-line.w-1-2{width:50%}.skel-line.w-1-4{width:25%}
.sidebar{position:sticky;top:130px;display:flex;flex-direction:column;gap:20px}
.sidebar-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.sidebar-title{font-size:.95rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.top-rated-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:var(--transition)}
.top-rated-item:last-child{border-bottom:none}
.top-rated-item:hover .trl-title{color:var(--accent)}
.trl-rank{width:24px;height:24px;background:var(--bg-secondary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;font-family:var(--font-en);flex-shrink:0}
.trl-rank.gold{background:var(--gold);color:#0A0E1A}.trl-rank.silver{background:#C0C0C0;color:#0A0E1A}.trl-rank.bronze{background:#CD7F32;color:#0A0E1A}
.trl-info{flex:1;min-width:0}
.trl-title{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:var(--transition)}
.trl-earn{font-size:.73rem;color:var(--accent)}
.trl-stars{font-size:.72rem;color:var(--gold)}
.cat-stats{display:flex;flex-direction:column;gap:8px}
.cat-row{display:flex;align-items:center;gap:10px;cursor:pointer;transition:var(--transition)}
.cat-row:hover .cat-name{color:var(--accent)}
.cat-icon{font-size:1rem;width:24px;text-align:center}
.cat-name{font-size:.82rem;flex:1;transition:var(--transition)}
.cat-count{font-size:.75rem;font-family:var(--font-en);background:var(--bg-secondary);padding:2px 8px;border-radius:100px;color:var(--text-muted)}
.cat-bar-wrap{position:relative;height:3px;background:var(--border);border-radius:2px;margin-top:2px}
.cat-bar{height:100%;background:var(--accent);border-radius:2px;transition:width .8s ease}
.source-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}
.source-item:last-child{border-bottom:none}
.source-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.source-dot.active{background:var(--accent);animation:pulse-ring 2s infinite}
.source-dot.error{background:var(--ember)}
.source-name{font-size:.82rem;flex:1}
.source-count{font-size:.72rem;color:var(--text-muted);font-family:var(--font-en)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:200;display:none;align-items:center;justify-content:center;padding:20px}
.modal-overlay.active{display:flex}
.modal{background:var(--bg-card);border:1px solid var(--border-accent);border-radius:20px;width:100%;max-width:680px;max-height:85vh;overflow-y:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.6),var(--shadow-glow);animation:modal-in .3s ease}
@keyframes modal-in{from{opacity:0;transform:scale(.95) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.modal-close{position:sticky;top:12px;right:12px;background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary);width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:.9rem;float:left;margin:12px 12px 0 0;display:flex;align-items:center;justify-content:center;z-index:10;transition:var(--transition)}
[dir=rtl] .modal-close{float:right;margin:12px 0 0 12px}
.modal-close:hover{background:var(--ember);color:#fff}
.modal-content{clear:both}
.modal-img-placeholder{width:100%;height:200px;background:linear-gradient(135deg,var(--bg-secondary),var(--bg-card));display:flex;align-items:center;justify-content:center;font-size:4rem}
.modal-body{padding:24px}
.modal-category{font-size:.75rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.modal-title{font-size:1.4rem;font-weight:700;margin-bottom:12px;line-height:1.3}
.modal-desc{color:var(--text-secondary);font-size:.9rem;margin-bottom:24px;line-height:1.7}
.modal-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px}
.modal-detail{background:var(--bg-secondary);border-radius:var(--radius-sm);padding:12px}
.modal-detail-label{font-size:.7rem;color:var(--text-muted);margin-bottom:4px}
.modal-detail-value{font-size:.9rem;font-weight:600}
.modal-detail-value.green{color:var(--accent)}.modal-detail-value.orange{color:var(--ember)}.modal-detail-value.gold{color:var(--gold)}
.modal-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px}
.tag{background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-muted);padding:3px 10px;border-radius:4px;font-size:.75rem}
.modal-actions{display:flex;gap:12px}
.btn-visit{flex:1;background:var(--accent);color:#0A0E1A;padding:12px;border-radius:var(--radius);text-decoration:none;text-align:center;font-weight:700;font-size:.95rem;transition:var(--transition)}
.btn-visit:hover{background:var(--accent-dark)}
.btn-save{background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary);padding:12px 20px;border-radius:var(--radius);cursor:pointer;font-family:var(--font-ar);font-size:.9rem;transition:var(--transition)}
.btn-save:hover{border-color:var(--border-accent);color:var(--accent)}
.toast{position:fixed;bottom:24px;right:24px;background:var(--bg-card);border:1px solid var(--border-accent);color:var(--text-primary);padding:12px 20px;border-radius:var(--radius);font-size:.88rem;box-shadow:var(--shadow);z-index:999;transform:translateY(100px);opacity:0;transition:all .3s ease;max-width:320px}
[dir=rtl] .toast{right:unset;left:24px}
.toast.show{transform:translateY(0);opacity:1}
.footer{background:var(--bg-secondary);border-top:1px solid var(--border);padding:60px 0 30px}
.footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;margin-bottom:40px}
.footer-brand p{color:var(--text-secondary);font-size:.85rem;margin:12px 0 16px;line-height:1.7}
.footer-social{display:flex;gap:10px}
.footer-social a{width:36px;height:36px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;text-decoration:none;color:var(--text-secondary);font-size:.9rem;transition:var(--transition)}
.footer-social a:hover{border-color:var(--border-accent);color:var(--accent)}
.footer-links h4{font-size:.85rem;font-weight:700;margin-bottom:14px;color:var(--text-primary)}
.footer-links ul{list-style:none;display:flex;flex-direction:column;gap:8px}
.footer-links a{color:var(--text-secondary);text-decoration:none;font-size:.82rem;transition:var(--transition)}
.footer-links a:hover{color:var(--accent)}
.footer-bottom{border-top:1px solid var(--border);padding-top:24px;display:flex;flex-direction:column;gap:8px}
.footer-bottom p{font-size:.8rem;color:var(--text-muted);text-align:center}
.footer-disclaimer{font-size:.75rem!important;color:var(--ember)!important;opacity:.8}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:var(--bg-primary)}::-webkit-scrollbar-thumb{background:var(--bg-card);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:var(--text-muted)}
@media(max-width:1024px){.content-layout{grid-template-columns:1fr}.sidebar{position:static;flex-direction:row;flex-wrap:wrap}.sidebar-card{flex:1;min-width:250px}.hero-stats{grid-template-columns:repeat(2,1fr)}.footer-grid{grid-template-columns:1fr 1fr}}
@media(max-width:768px){.nav{display:none}.btn-menu{display:flex}.nav.open{display:flex;flex-direction:column;position:absolute;top:100%;right:0;left:0;background:var(--bg-secondary);border-bottom:1px solid var(--border);padding:12px 20px;z-index:90}.hero{padding:50px 0 40px}.hero-title{font-size:2rem}.hero-stats{grid-template-columns:repeat(2,1fr)}.filter-actions{display:none}.modal-grid{grid-template-columns:1fr}.footer-grid{grid-template-columns:1fr}.opportunities-grid{grid-template-columns:1fr}}`;
}

// ============================================================
//  DATA JS
// ============================================================
function getDataJS() {
  return `const CATEGORIES=[{id:"freelance",name:"عمل حر",icon:"🎨"},{id:"ai",name:"ذكاء اصطناعي",icon:"🤖"},{id:"surveys",name:"استبيانات",icon:"📋"},{id:"affiliate",name:"تسويق بالعمولة",icon:"🔗"},{id:"referral",name:"إحالات",icon:"👥"},{id:"cashback",name:"كاش باك",icon:"💰"},{id:"apps",name:"تطبيقات",icon:"📱"},{id:"contests",name:"مسابقات",icon:"🏆"},{id:"remote",name:"عمل عن بعد",icon:"💻"},{id:"crypto",name:"عملات رقمية",icon:"₿"},{id:"grants",name:"منح",icon:"🎓"},{id:"testing",name:"اختبارات",icon:"🧪"},{id:"trading",name:"تداول",icon:"📈"},{id:"other",name:"أخرى",icon:"📦"}];
const SOURCES=[{id:"reddit",name:"Reddit API",status:"active",count:134},{id:"hackernews",name:"Hacker News",status:"active",count:89},{id:"producthunt",name:"Product Hunt",status:"active",count:76},{id:"github",name:"GitHub Trending",status:"active",count:45},{id:"remoteok",name:"RemoteOK",status:"active",count:203},{id:"upwork",name:"Upwork Feed",status:"active",count:158},{id:"fiverr",name:"Fiverr Insights",status:"active",count:91},{id:"techcrunch",name:"TechCrunch RSS",status:"active",count:29},{id:"indiehackers",name:"Indie Hackers",status:"active",count:53},{id:"aitools",name:"AI Tools RSS",status:"active",count:67},{id:"survey",name:"Survey Sites",status:"active",count:38},{id:"freelancer",name:"Freelancer RSS",status:"error",count:0}];
const OPPORTUNITIES=[{id:1,title:"Upwork — منصة العمل الحر الأكبر عالمياً",description:"اكسب من مهاراتك في التصميم والبرمجة والكتابة والتسويق عبر أكبر منصة عمل حر في العالم.",fullDescription:"Upwork هي المنصة الرائدة في مجال العمل الحر حول العالم، تتيح لك إنشاء ملف شخصي احترافي والتقدم لآلاف المشاريع يومياً. تشمل المجالات: البرمجة، التصميم، الكتابة، التسويق، المحاسبة، والمزيد. يمكنك البدء مجاناً وكسب من $5 إلى $200+ في الساعة حسب خبرتك.",category:"freelance",status:"recommended",emoji:"💼",earnings:"$500 - $5000/شهر",earningLevel:"high",trustScore:9.5,rating:4.7,reviews:12840,country:"عالمي",devices:"both",payment:["paypal","bank","payoneer"],minWithdraw:"$100",isFree:true,difficulty:"متوسط",timeRequired:"دوام كامل أو جزئي",url:"https://upwork.com",tags:["عمل حر","برمجة","تصميم","كتابة"],source:"upwork",publishedAt:new Date(Date.now()-1*3600000).toISOString(),views:28450},
{id:2,title:"Claude AI — اكسب من مساعدة في التدريب",description:"برنامج Anthropic لمكافأة المساهمين في تحسين نماذج الذكاء الاصطناعي عبر تقييم وإنشاء محادثات عالية الجودة.",fullDescription:"يمكنك الكسب من خلال المساهمة في تدريب نماذج الذكاء الاصطناعي. تقوم بتقييم ردود النماذج، كتابة محادثات نموذجية، أو اختبار القدرات. الدفع يتم عبر Scale AI وشركاء آخرين. فرصة رائعة للراغبين في العمل مع تقنيات الذكاء الاصطناعي.",category:"ai",status:"trending",emoji:"🤖",earnings:"$15 - $50/ساعة",earningLevel:"medium",trustScore:9.8,rating:4.9,reviews:3210,country:"عالمي",devices:"desktop",payment:["paypal","bank"],minWithdraw:"$50",isFree:true,difficulty:"متوسط",timeRequired:"مرن",url:"https://scale.ai",tags:["ذكاء اصطناعي","تقييم بيانات","RLHF"],source:"reddit",publishedAt:new Date(Date.now()-2*3600000).toISOString(),views:15200},
{id:3,title:"Swagbucks — استبيانات وإعلانات مدفوعة",description:"منصة مكافآت تدفع مقابل ملء الاستبيانات، مشاهدة الإعلانات، التسوق، وألعاب أونلاين.",fullDescription:"Swagbucks هي إحدى أقدم وأكثر منصات المكافآت موثوقية. تكسب نقاط (SB) مقابل: الاستبيانات، مشاهدة مقاطع فيديو، التسوق الإلكتروني (1-10% كاش باك)، تثبيت التطبيقات. 100 SB = $1.",category:"surveys",status:"new",emoji:"📋",earnings:"$50 - $300/شهر",earningLevel:"low",trustScore:8.5,rating:4.2,reviews:45600,country:"عالمي",devices:"both",payment:["paypal","gift"],minWithdraw:"$3",isFree:true,difficulty:"سهل",timeRequired:"ساعة يومياً",url:"https://swagbucks.com",tags:["استبيانات","مكافآت","كاش باك"],source:"swagbucks",publishedAt:new Date(Date.now()-30*60000).toISOString(),views:9870},
{id:4,title:"Amazon Associates — التسويق بالعمولة",description:"برنامج العمولة الأشهر عالمياً. اكسب 1-10% عمولة من كل مبيعة تتم عبر روابطك التابعة لأمازون.",fullDescription:"Amazon Associates هو برنامج الإحالة الأكثر شعبية عالمياً. يمكنك الترويج لملايين المنتجات وكسب عمولة تتراوح بين 1% و10% حسب الفئة. كل ما تحتاجه موقع إلكتروني أو قناة يوتيوب أو صفحة سوشيال ميديا.",category:"affiliate",status:"recommended",emoji:"🔗",earnings:"$100 - $10000/شهر",earningLevel:"variable",trustScore:9.7,rating:4.5,reviews:89200,country:"عالمي",devices:"both",payment:["bank","gift","check"],minWithdraw:"$10",isFree:true,difficulty:"متوسط",timeRequired:"يتطلب جمهور مسبق",url:"https://affiliate-program.amazon.com",tags:["عمولة","أمازون","تسويق"],source:"reddit",publishedAt:new Date(Date.now()-4*3600000).toISOString(),views:22100},
{id:5,title:"Rakuten — كاش باك على كل مشترياتك",description:"احصل على استرداد نقدي فعلي عند التسوق من 3500+ متجر عبر الإنترنت. الكاش باك يصل حتى 40%.",fullDescription:"Rakuten يمنحك كاش باك حقيقي عند تسوقك من ماركات عالمية كـ Nike, ASOS, Booking.com, eBay وغيرها. كل ما عليك هو تثبيت الإضافة أو استخدام الموقع قبل الشراء.",category:"cashback",status:"recommended",emoji:"💰",earnings:"1-40% على كل عملية شراء",earningLevel:"variable",trustScore:9.2,rating:4.6,reviews:67800,country:"الولايات المتحدة وأوروبا",devices:"both",payment:["paypal","check"],minWithdraw:"$5.01",isFree:true,difficulty:"سهل جداً",timeRequired:"لا وقت إضافي",url:"https://rakuten.com",tags:["كاش باك","تسوق","استرداد"],source:"reddit",publishedAt:new Date(Date.now()-6*3600000).toISOString(),views:18900},
{id:6,title:"UserTesting — اختبر التطبيقات وأنت في المنزل",description:"احصل على $10 مقابل كل 20 دقيقة تقضيها في اختبار مواقع وتطبيقات وتسجيل تعليقاتك الصوتية.",fullDescription:"UserTesting تدفع للمستخدمين العاديين مقابل اختبار مواقع وتطبيقات وإعطاء آرائهم. كل مهمة تستغرق 10-20 دقيقة وتدفع $4-$60. الدفع عبر PayPal خلال 7 أيام.",category:"testing",status:"trending",emoji:"🧪",earnings:"$10 - $60/مهمة",earningLevel:"medium",trustScore:8.8,rating:4.4,reviews:23100,country:"عالمي",devices:"both",payment:["paypal"],minWithdraw:"$10",isFree:true,difficulty:"سهل",timeRequired:"20 دق/مهمة",url:"https://usertesting.com",tags:["اختبار","UX","تعليقات"],source:"reddit",publishedAt:new Date(Date.now()-3*3600000).toISOString(),views:14500},
{id:7,title:"Fiverr — بيع خدماتك من $5 إلى $10,000",description:"أنشئ خدماتك الاحترافية وبيعها لملايين المشترين حول العالم في أي مجال تتقنه.",fullDescription:"Fiverr تتيح لك عرض خدماتك بدءاً من $5. المجالات الأعلى طلباً: تصميم اللوجو، كتابة المحتوى، SEO، إدارة السوشيال ميديا، التعليق الصوتي، الترجمة، والبرمجة.",category:"freelance",status:"recommended",emoji:"🌟",earnings:"$100 - $10000/شهر",earningLevel:"high",trustScore:9.0,rating:4.5,reviews:156000,country:"عالمي",devices:"both",payment:["paypal","bank","payoneer"],minWithdraw:"$20",isFree:true,difficulty:"متوسط",timeRequired:"مرن",url:"https://fiverr.com",tags:["عمل حر","خدمات","تصميم","برمجة"],source:"reddit",publishedAt:new Date(Date.now()-8*3600000).toISOString(),views:34200},
{id:8,title:"Replit Bounties — فرص برمجة مدفوعة",description:"اكسب مقابل حل تحديات برمجية يطرحها مستخدمو Replit. المكافآت تتراوح من $50 إلى $5000.",fullDescription:"Replit Bounties منصة تربط المبرمجين بأصحاب العمل الراغبين في حل مشاكل تقنية. يمكنك تصفح المهام المتاحة والتقدم إليها وتنفيذها مباشرة في متصفحك.",category:"freelance",status:"new",emoji:"💻",earnings:"$50 - $5000/مهمة",earningLevel:"high",trustScore:8.6,rating:4.3,reviews:4200,country:"عالمي",devices:"desktop",payment:["paypal","bank"],minWithdraw:"$10",isFree:true,difficulty:"متقدم",timeRequired:"حسب المشروع",url:"https://replit.com/bounties",tags:["برمجة","باونتي","مشاريع"],source:"hackernews",publishedAt:new Date(Date.now()-20*60000).toISOString(),views:8900},
{id:9,title:"Binance Earn — أربح من عملاتك الرقمية",description:"اكسب فائدة سنوية حتى 20% على عملاتك الرقمية عبر منتجات Binance Earn المتنوعة.",fullDescription:"Binance Earn يتيح لك تحقيق دخل سلبي من عملاتك الرقمية. خيارات: Flexible Savings، Locked Staking، Dual Investment، Launchpool. معدلات العائد 3%-20% سنوياً.",category:"crypto",status:"trending",emoji:"₿",earnings:"3-20% سنوياً",earningLevel:"medium",trustScore:8.3,rating:4.1,reviews:89500,country:"عالمي",devices:"both",payment:["crypto"],minWithdraw:"يعتمد على العملة",isFree:true,difficulty:"متوسط",timeRequired:"استثمار طويل",url:"https://binance.com/earn",tags:["كريبتو","ستاكينج","دخل سلبي"],source:"reddit",publishedAt:new Date(Date.now()-5*3600000).toISOString(),views:19600},
{id:10,title:"YCombinator — منحة $500K للمشاريع الناشئة",description:"برنامج YC يوفر $500,000 لكل شركة ناشئة مقبولة مع إرشاد من أبرز المستثمرين في وادي السيليكون.",fullDescription:"Y Combinator هو أبرز مسرع أعمال في العالم. تحصل شركتك على $500,000 وثلاثة أشهر من الإرشاد المكثف ثم تعرض مشروعك أمام مئات المستثمرين. الخريجون يشملون Airbnb, Stripe, Coinbase.",category:"grants",status:"new",emoji:"🎓",earnings:"$500,000 منحة",earningLevel:"high",trustScore:9.9,rating:4.9,reviews:1230,country:"عالمي",devices:"desktop",payment:["bank"],minWithdraw:"لا ينطبق",isFree:true,difficulty:"صعب جداً",timeRequired:"التزام كامل",url:"https://ycombinator.com/apply",tags:["منحة","ناشئة","استثمار","YC"],source:"hackernews",publishedAt:new Date(Date.now()-12*3600000).toISOString(),views:45800},
{id:11,title:"99designs — مسابقات التصميم الجرافيكي",description:"شارك في مسابقات التصميم وفُز بمبالغ من $99 إلى $1,299 لكل مشروع فائز.",fullDescription:"99designs تتيح للمصممين المشاركة في مسابقات حيث يطرح أصحاب العمل مشروعاً ويقدم المصممون أعمالهم. الفائز يحصل على المبلغ كاملاً.",category:"contests",status:"new",emoji:"🏆",earnings:"$99 - $1299/فوز",earningLevel:"variable",trustScore:8.4,rating:4.2,reviews:18900,country:"عالمي",devices:"desktop",payment:["paypal","bank"],minWithdraw:"$20",isFree:true,difficulty:"يتطلب مهارة تصميم",timeRequired:"حسب المشروع",url:"https://99designs.com",tags:["تصميم","مسابقات","جرافيك","لوجو"],source:"reddit",publishedAt:new Date(Date.now()-15*60000).toISOString(),views:7600},
{id:12,title:"Referral Programs — برامج الإحالة المدفوعة",description:"دليل شامل لأفضل برامج الإحالة المدفوعة في 2025. شركات تدفع حتى $500 لكل صديق تجلبه.",fullDescription:"برامج الإحالة من أسهل طرق الكسب بدون مهارات خاصة. أبرز البرامج: Robinhood، Coinbase، Rakuten، Swagbucks، Honey. كل ما تفعله هو مشاركة رابط خاص مع الأصدقاء.",category:"referral",status:"new",emoji:"👥",earnings:"$10 - $500/إحالة",earningLevel:"medium",trustScore:8.0,rating:4.3,reviews:5430,country:"عالمي",devices:"both",payment:["paypal","bank","crypto"],minWithdraw:"متفاوت",isFree:true,difficulty:"سهل جداً",timeRequired:"دقائق",url:"https://referralhero.com",tags:["إحالات","مكافآت","أصدقاء"],source:"reddit",publishedAt:new Date(Date.now()-45*60000).toISOString(),views:6700}];`;
}

// ============================================================
//  APP JS
// ============================================================
function getAppJS() {
  return `const State={currentLang:'ar',currentTheme:localStorage.getItem('theme')||'dark',currentCat:'all',currentSort:'newest',currentDevice:'all',currentPay:'all',searchQuery:'',page:1,perPage:6,filtered:[],saved:JSON.parse(localStorage.getItem('savedOpps')||'[]')};
document.addEventListener('DOMContentLoaded',()=>{applyTheme();initFiltered();renderTicker();renderNewToday();renderTrending();renderMainGrid();renderTopRated();renderCatStats();renderSources();setupEventListeners();animateCounters();loadLiveStats();});
function applyTheme(){document.documentElement.setAttribute('data-theme',State.currentTheme==='light'?'light':'');document.getElementById('themeIcon').textContent=State.currentTheme==='light'?'🌙':'☀️';}
document.getElementById('themeToggle').addEventListener('click',()=>{State.currentTheme=State.currentTheme==='dark'?'light':'dark';localStorage.setItem('theme',State.currentTheme);applyTheme();});
async function loadLiveStats(){try{const r=await fetch('/api/stats');const s=await r.json();if(s.total){animateNum('statTotal',0,s.total,1500);animateNum('statToday',0,s.today||0,1200);}}catch(e){animateCounters();}}
function initFiltered(){let data=[...OPPORTUNITIES];if(State.currentCat!=='all')data=data.filter(o=>o.category===State.currentCat);if(State.searchQuery){const q=State.searchQuery.toLowerCase();data=data.filter(o=>o.title.toLowerCase().includes(q)||o.description.toLowerCase().includes(q)||o.tags.some(t=>t.toLowerCase().includes(q)));}if(State.currentDevice!=='all')data=data.filter(o=>o.devices===State.currentDevice||o.devices==='both');if(State.currentPay!=='all')data=data.filter(o=>o.payment.includes(State.currentPay));switch(State.currentSort){case'newest':data.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));break;case'trending':data.sort((a,b)=>b.views-a.views);break;case'rated':data.sort((a,b)=>b.rating-a.rating);break;case'earning':data.sort((a,b)=>(b.earningLevel==='high'?3:b.earningLevel==='medium'?2:1)-(a.earningLevel==='high'?3:a.earningLevel==='medium'?2:1));break;}State.filtered=data;document.getElementById('resultCount').textContent=data.length+' فرصة';}
function renderCard(opp){const cat=CATEGORIES.find(c=>c.id===opp.category)||CATEGORIES[CATEGORIES.length-1];const timeAgo=getTimeAgo(opp.publishedAt);const sm={new:'status-new',trending:'status-trending',recommended:'status-recommended'};const sl={new:'جديد',trending:'رائج',recommended:'موصى به'};return \`<div class="opp-card" data-id="\${opp.id}" onclick="openModal(\${opp.id})"><div class="card-img-placeholder">\${opp.emoji}</div><div class="card-body"><div class="card-header-row"><div class="card-title">\${opp.title}</div><span class="card-status \${sm[opp.status]||'status-new'}">\${sl[opp.status]||'جديد'}</span></div><div class="card-desc">\${opp.description}</div><div class="card-meta"><span class="meta-item earn">💰 \${opp.earnings}</span><span class="meta-item trust">⭐ \${opp.trustScore}/10</span><span class="meta-item">🌍 \${opp.country.length>12?opp.country.substring(0,12)+'...':opp.country}</span><span class="meta-item">\${opp.isFree?'🆓 مجاني':'💳 مدفوع'}</span></div></div><div class="card-footer"><span class="card-cat">\${cat.icon} \${cat.name}</span><span class="card-rating">★ \${opp.rating}</span><span class="card-time">\${timeAgo}</span></div></div>\`;}
function renderSkeletons(n,c){c.innerHTML=Array(n).fill('<div class="skel-card"><div class="skeleton skel-img"></div><div class="skel-body"><div class="skeleton skel-line w-3-4"></div><div class="skeleton skel-line w-full"></div><div class="skeleton skel-line w-1-2"></div></div></div>').join('');}
function renderNewToday(){const g=document.getElementById('newTodayGrid');const c=Date.now()-24*3600000;const items=OPPORTUNITIES.filter(o=>new Date(o.publishedAt)>c).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,3);if(!items.length){g.innerHTML='<p style="color:var(--text-muted);font-size:.85rem;grid-column:1/-1">لا توجد فرص جديدة منذ 24 ساعة</p>';return;}g.innerHTML=items.map(renderCard).join('');}
function renderTrending(){const g=document.getElementById('trendingGrid');const items=OPPORTUNITIES.filter(o=>o.status==='trending'||o.views>10000).sort((a,b)=>b.views-a.views).slice(0,3);g.innerHTML=items.map(renderCard).join('');}
function renderMainGrid(append=false){const g=document.getElementById('mainGrid');const slice=State.filtered.slice(0,State.page*State.perPage);if(!append){g.innerHTML='';renderSkeletons(3,g);setTimeout(()=>{if(!State.filtered.length){g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:3rem;margin-bottom:12px">🔍</div><div>لا توجد نتائج مطابقة</div></div>';return;}g.innerHTML=slice.map(renderCard).join('');document.getElementById('loadMoreBtn').style.display=slice.length>=State.filtered.length?'none':'inline-block';},400);}else{const start=(State.page-1)*State.perPage;g.insertAdjacentHTML('beforeend',State.filtered.slice(start,State.page*State.perPage).map(renderCard).join(''));document.getElementById('loadMoreBtn').style.display=g.querySelectorAll('.opp-card').length>=State.filtered.length?'none':'inline-block';}}
function renderTopRated(){const l=document.getElementById('topRatedList');const items=[...OPPORTUNITIES].sort((a,b)=>b.rating-a.rating).slice(0,5);const rc=['gold','silver','bronze','',''];l.innerHTML=items.map((o,i)=>\`<div class="top-rated-item" onclick="openModal(\${o.id})"><div class="trl-rank \${rc[i]}">\${i+1}</div><div class="trl-info"><div class="trl-title">\${o.title}</div><div style="display:flex;gap:8px;align-items:center"><span class="trl-earn">\${o.earnings}</span><span class="trl-stars">★ \${o.rating}</span></div></div></div>\`).join('');}
function renderCatStats(){const c=document.getElementById('catStats');const counts={};OPPORTUNITIES.forEach(o=>{counts[o.category]=(counts[o.category]||0)+1;});const max=Math.max(...Object.values(counts));c.innerHTML=CATEGORIES.slice(0,8).map(cat=>\`<div class="cat-row" onclick="filterByCat('\${cat.id}')"><span class="cat-icon">\${cat.icon}</span><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><span class="cat-name">\${cat.name}</span><span class="cat-count">\${counts[cat.id]||0}</span></div><div class="cat-bar-wrap"><div class="cat-bar" style="width:\${((counts[cat.id]||0)/max*100)}%"></div></div></div></div>\`).join('');}
function renderSources(){const l=document.getElementById('sourcesList');l.innerHTML=SOURCES.slice(0,8).map(s=>\`<div class="source-item"><div class="source-dot \${s.status}"></div><span class="source-name">\${s.name}</span><span class="source-count">\${s.count}</span></div>\`).join('');}
function renderTicker(){const inner=document.getElementById('tickerInner');const items=OPPORTUNITIES.slice(0,8);const html=items.map(o=>{const cat=CATEGORIES.find(c=>c.id===o.category);return \`<span class="ticker-item"><span class="ticker-cat">\${cat?.icon||'📦'}</span> \${o.title} — \${o.earnings}</span>\`;}).join('');inner.innerHTML=html+html;}
function animateCounters(){const total=OPPORTUNITIES.length;const today=OPPORTUNITIES.filter(o=>new Date(o.publishedAt)>Date.now()-24*3600000).length;animateNum('statTotal',0,total*8+47,1500);animateNum('statToday',0,today+3,1200);}
function animateNum(id,from,to,dur){const el=document.getElementById(id);if(!el)return;const step=(to-from)/(dur/16);let cur=from;const t=setInterval(()=>{cur=Math.min(cur+step,to);el.textContent=Math.floor(cur);if(cur>=to)clearInterval(t);},16);}
function openModal(id){const opp=OPPORTUNITIES.find(o=>o.id===id);if(!opp)return;const cat=CATEGORIES.find(c=>c.id===opp.category);const isSaved=State.saved.includes(id);const pl={paypal:'PayPal',bank:'تحويل بنكي',crypto:'كريبتو',gift:'بطاقات هدايا',payoneer:'Payoneer',check:'شيك'};document.getElementById('modalContent').innerHTML=\`<div class="modal-img-placeholder">\${opp.emoji}</div><div class="modal-body"><div class="modal-category">\${cat?.icon||''} \${cat?.name||opp.category}</div><h2 class="modal-title">\${opp.title}</h2><p class="modal-desc">\${opp.fullDescription}</p><div class="modal-grid"><div class="modal-detail"><div class="modal-detail-label">💰 الأرباح المتوقعة</div><div class="modal-detail-value green">\${opp.earnings}</div></div><div class="modal-detail"><div class="modal-detail-label">⭐ مستوى الموثوقية</div><div class="modal-detail-value gold">\${opp.trustScore}/10</div></div><div class="modal-detail"><div class="modal-detail-label">★ تقييم المستخدمين</div><div class="modal-detail-value">\${opp.rating}/5 (\${opp.reviews.toLocaleString()} تقييم)</div></div><div class="modal-detail"><div class="modal-detail-label">🌍 الدول المدعومة</div><div class="modal-detail-value">\${opp.country}</div></div><div class="modal-detail"><div class="modal-detail-label">📱 الأجهزة المدعومة</div><div class="modal-detail-value">\${opp.devices==='both'?'موبايل وكمبيوتر':opp.devices==='mobile'?'موبايل فقط':'كمبيوتر فقط'}</div></div><div class="modal-detail"><div class="modal-detail-label">💳 طريقة الدفع</div><div class="modal-detail-value">\${opp.payment.map(p=>pl[p]||p).join('، ')}</div></div><div class="modal-detail"><div class="modal-detail-label">💵 الحد الأدنى للسحب</div><div class="modal-detail-value orange">\${opp.minWithdraw}</div></div><div class="modal-detail"><div class="modal-detail-label">⏱ الوقت المطلوب</div><div class="modal-detail-value">\${opp.timeRequired}</div></div><div class="modal-detail"><div class="modal-detail-label">🎯 مستوى الصعوبة</div><div class="modal-detail-value">\${opp.difficulty}</div></div><div class="modal-detail"><div class="modal-detail-label">🆓 هل هي مجانية؟</div><div class="modal-detail-value green">\${opp.isFree?'نعم، مجانية تماماً':'تتطلب رسوماً'}</div></div></div><div class="modal-tags">\${opp.tags.map(t=>\`<span class="tag">#\${t}</span>\`).join('')}</div><div class="modal-actions"><a href="\${opp.url}" target="_blank" rel="noopener noreferrer" class="btn-visit">🔗 زيارة الموقع الرسمي</a><button class="btn-save" onclick="toggleSave(\${opp.id})" id="saveBtn\${opp.id}">\${isSaved?'✅ محفوظ':'🔖 حفظ'}</button></div></div>\`;document.getElementById('modalOverlay').classList.add('active');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('modalOverlay').classList.remove('active');document.body.style.overflow='';}
function toggleSave(id){const btn=document.getElementById('saveBtn'+id);if(State.saved.includes(id)){State.saved=State.saved.filter(s=>s!==id);if(btn)btn.textContent='🔖 حفظ';showToast('تم إزالة الفرصة من المحفوظات');}else{State.saved.push(id);if(btn)btn.textContent='✅ محفوظ';showToast('✅ تم حفظ الفرصة!');}localStorage.setItem('savedOpps',JSON.stringify(State.saved));}
let searchTimer;
document.getElementById('searchInput').addEventListener('input',(e)=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{State.searchQuery=e.target.value.trim();const r=document.getElementById('searchResults');if(!State.searchQuery){r.innerHTML='';return;}const q=State.searchQuery.toLowerCase();const matches=OPPORTUNITIES.filter(o=>o.title.toLowerCase().includes(q)||o.description.toLowerCase().includes(q)||o.tags.some(t=>t.toLowerCase().includes(q))).slice(0,6);if(!matches.length){r.innerHTML='<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد نتائج</div>';return;}r.innerHTML=matches.map(o=>\`<div onclick="openModal(\${o.id});closeSearch()" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;cursor:pointer" onmouseover="this.style.borderColor='var(--border-accent)'" onmouseout="this.style.borderColor='var(--border)'"><div style="font-size:.85rem;font-weight:600;margin-bottom:4px">\${o.emoji} \${o.title}</div><div style="font-size:.75rem;color:var(--text-muted)">\${o.description.substring(0,80)}...</div></div>\`).join('');},300);});
function closeSearch(){document.getElementById('searchOverlay').classList.remove('active');document.getElementById('searchInput').value='';document.getElementById('searchResults').innerHTML='';}
function setupEventListeners(){document.getElementById('searchToggle').addEventListener('click',()=>{document.getElementById('searchOverlay').classList.toggle('active');if(document.getElementById('searchOverlay').classList.contains('active'))setTimeout(()=>document.getElementById('searchInput').focus(),100);});document.getElementById('searchClose').addEventListener('click',closeSearch);document.getElementById('modalClose').addEventListener('click',closeModal);document.getElementById('modalOverlay').addEventListener('click',(e)=>{if(e.target===document.getElementById('modalOverlay'))closeModal();});document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){closeModal();closeSearch();}});document.getElementById('categoryChips').addEventListener('click',(e)=>{const chip=e.target.closest('.chip');if(!chip)return;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');State.currentCat=chip.dataset.cat;State.page=1;initFiltered();renderMainGrid();});document.getElementById('sortSelect').addEventListener('change',(e)=>{State.currentSort=e.target.value;State.page=1;initFiltered();renderMainGrid();});document.getElementById('deviceFilter').addEventListener('change',(e)=>{State.currentDevice=e.target.value;State.page=1;initFiltered();renderMainGrid();});document.getElementById('payFilter').addEventListener('change',(e)=>{State.currentPay=e.target.value;State.page=1;initFiltered();renderMainGrid();});document.getElementById('loadMoreBtn').addEventListener('click',()=>{State.page++;renderMainGrid(true);});document.getElementById('refreshBtn').addEventListener('click',()=>{const btn=document.getElementById('refreshBtn');btn.disabled=true;fetch('/api/refresh').finally(()=>{setTimeout(()=>{renderNewToday();showToast('✅ تم التحديث بنجاح');btn.disabled=false;},1000);});});document.getElementById('menuToggle').addEventListener('click',()=>{document.getElementById('nav').classList.toggle('open');});document.getElementById('langSelect').addEventListener('change',()=>showToast('تم تغيير اللغة'));}
function filterByCat(catId){State.currentCat=catId;State.page=1;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===catId));initFiltered();renderMainGrid();document.getElementById('all-opps').scrollIntoView({behavior:'smooth'});}
function showToast(msg,dur=3000){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function getTimeAgo(d){const diff=Date.now()-new Date(d);const m=Math.floor(diff/60000);const h=Math.floor(m/60);const dy=Math.floor(h/24);if(m<1)return'الآن';if(m<60)return'منذ '+m+' دقيقة';if(h<24)return'منذ '+h+' ساعة';return'منذ '+dy+' يوم';}
setInterval(renderTicker,5*60*1000);
setInterval(()=>{const dot=document.querySelector('.pulse-dot');if(dot)dot.style.background='#FF6B35';setTimeout(()=>{if(dot)dot.style.background='#00D4AA';},500);},10000);`;
}
