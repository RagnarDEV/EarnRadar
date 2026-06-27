// worker.js — EarnRadar Cloudflare Worker (Fully Embedded Version)

// ==========================================
// 1. FRONTEND ASSETS (EMBEDDED)
// ==========================================

const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت - تحديث تلقائي من مصادر موثوقة">
<meta name="keywords" content="ربح من الإنترنت, فرص عمل حر, استبيانات مدفوعة, تسويق بالعمولة">
<meta property="og:title" content="EarnRadar — منصة فرص الربح الذكية">
<meta property="og:description" content="اكتشف أحدث فرص كسب المال عبر الإنترنت بشكل تلقائي">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<title>EarnRadar — منصة فرص الربح الذكية</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "EarnRadar",
  "description": "منصة ذكية لاكتشاف فرص الربح من الإنترنت",
  "url": "https://earnradar.pages.dev"
}
</script>
</head>
<body>

<!-- HEADER -->
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
        <a href="about.html" class="nav-link">من نحن</a>
      </nav>
      <div class="header-actions">
        <button class="btn-search-toggle" id="searchToggle" aria-label="بحث">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button class="btn-theme" id="themeToggle" aria-label="تغيير المظهر">
          <span id="themeIcon">🌙</span>
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
  <!-- Search Bar -->
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

<!-- HERO -->
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
      <p class="hero-subtitle">منصة آلية تجلب وتنظم أحدث فرص كسب المال من عشرات المصادر الموثوقة — بدون محتوى يدوي.</p>
      <div class="hero-actions">
        <a href="#opportunities" class="btn-primary">استكشف الفرص <span>←</span></a>
        <a href="#categories" class="btn-ghost">تصفح التصنيفات</a>
      </div>
    </div>
    <!-- STATS -->
    <div class="hero-stats">
      <div class="stat-card">
        <div class="stat-num" id="statTotal">0</div>
        <div class="stat-label">فرصة مكتشفة</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" id="statToday">0</div>
        <div class="stat-label">إضافة اليوم</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" id="statSources">12</div>
        <div class="stat-label">مصدر نشط</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" id="statCategories">14</div>
        <div class="stat-label">تصنيف</div>
      </div>
    </div>
  </div>
</section>

<!-- TICKER -->
<div class="ticker-wrap">
  <div class="ticker-label">🔴 LIVE</div>
  <div class="ticker-track" id="tickerTrack">
    <div class="ticker-inner" id="tickerInner"></div>
  </div>
</div>

<!-- FILTERS BAR -->
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
        <button class="chip" data-cat="crypto">₿ عملات رقمية</button>
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
          <option value="both">الاثنان</option>
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

<!-- MAIN CONTENT -->
<main class="main-content" id="opportunities">
  <div class="container">
    <div class="content-layout">

      <!-- OPPORTUNITIES GRID -->
      <div class="content-main">

        <!-- Section: New Today -->
        <section class="section" id="new-today">
          <div class="section-header">
            <h2 class="section-title"><span class="badge-new">NEW</span> جديد اليوم</h2>
            <button class="btn-refresh" id="refreshBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              تحديث
            </button>
          </div>
          <div class="opportunities-grid" id="newTodayGrid">
            <!-- Loaded by JS -->
          </div>
        </section>

        <!-- Section: Trending -->
        <section class="section" id="trending">
          <div class="section-header">
            <h2 class="section-title">🔥 الفرص الرائجة</h2>
            <a href="#" class="see-all">عرض الكل →</a>
          </div>
          <div class="opportunities-grid" id="trendingGrid">
          </div>
        </section>

        <!-- Section: All Opportunities -->
        <section class="section" id="all-opps">
          <div class="section-header">
            <h2 class="section-title">جميع الفرص</h2>
            <span class="result-count" id="resultCount">0 فرصة</span>
          </div>
          <div class="opportunities-grid" id="mainGrid">
          </div>
          <div class="load-more-wrap">
            <button class="btn-load-more" id="loadMoreBtn">تحميل المزيد</button>
          </div>
        </section>

      </div>

      <!-- SIDEBAR -->
      <aside class="sidebar">

        <!-- Top Rated -->
        <div class="sidebar-card" id="top-rated">
          <h3 class="sidebar-title">⭐ الأعلى تقييماً</h3>
          <div id="topRatedList"></div>
        </div>

        <!-- Categories Stats -->
        <div class="sidebar-card" id="categories">
          <h3 class="sidebar-title">📂 التصنيفات</h3>
          <div class="cat-stats" id="catStats"></div>
        </div>

        <!-- Latest Sources -->
        <div class="sidebar-card">
          <h3 class="sidebar-title">📡 المصادر النشطة</h3>
          <div class="sources-list" id="sourcesList"></div>
        </div>

        <!-- Ad Placeholder -->
        <div class="sidebar-ad">
          <div class="ad-label">إعلان</div>
          <div class="ad-content">
            <!-- Google AdSense slot -->
            <ins class="adsbygoogle"
              style="display:block"
              data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
              data-ad-slot="XXXXXXXXXX"
              data-ad-format="auto"
              data-full-width-responsive="true"></ins>
          </div>
        </div>

      </aside>
    </div>
  </div>
</main>

<!-- OPPORTUNITY MODAL -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="oppModal">
    <button class="modal-close" id="modalClose">✕</button>
    <div class="modal-content" id="modalContent"></div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<!-- FOOTER -->
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo">
          <span class="logo-icon">◉</span>
          <span class="logo-text">EarnRadar</span>
        </div>
        <p>منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت، تعمل بالكامل بشكل تلقائي.</p>
        <div class="footer-social">
          <a href="#" aria-label="Twitter">𝕏</a>
          <a href="#" aria-label="Telegram">✈</a>
          <a href="#" aria-label="RSS">⊏</a>
        </div>
      </div>
      <div class="footer-links">
        <h4>التنقل</h4>
        <ul>
          <li><a href="#">الرئيسية</a></li>
          <li><a href="#">التصنيفات</a></li>
          <li><a href="#">الأكثر ربحاً</a></li>
          <li><a href="#">الأكثر مشاهدة</a></li>
        </ul>
      </div>
      <div class="footer-links">
        <h4>المعلومات</h4>
        <ul>
          <li><a href="#">من نحن</a></li>
          <li><a href="#">اتصل بنا</a></li>
          <li><a href="#">الأسئلة الشائعة</a></li>
          <li><a href="#">خريطة الموقع</a></li>
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
      <p class="footer-disclaimer">⚠️ المحتوى للأغراض المعلوماتية فقط. تحقق دائماً من المواقع الرسمية قبل الاستثمار.</p>
    </div>
  </div>
</footer>

<script src="app.js"></script>
</body>
</html>`;

const cssContent = `/* EarnRadar CSS Styles */
:root {
  --bg-primary: #0A0E1A; --bg-secondary: #111827; --bg-card: #1A2035; --bg-card-hover: #1E2640;
  --accent: #00D4AA; --accent-glow: rgba(0, 212, 170, 0.15); --accent-dark: #00A882;
  --ember: #FF6B35; --ember-glow: rgba(255, 107, 53, 0.15); --gold: #FFB800;
  --text-primary: #F0F4FF; --text-secondary: #8B9CC8; --text-muted: #4A5578;
  --border: rgba(255,255,255,0.07); --border-accent: rgba(0, 212, 170, 0.3);
  --radius: 14px; --radius-sm: 8px; --shadow: 0 4px 24px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 30px rgba(0, 212, 170, 0.1); --font-ar: 'Cairo', sans-serif;
  --font-en: 'Space Grotesk', sans-serif; --transition: 0.2s cubic-bezier(0.4,0,0.2,1);
}
[data-theme="light"] {
  --bg-primary: #F0F4FF; --bg-secondary: #E8EDF8; --bg-card: #FFFFFF; --bg-card-hover: #F5F8FF;
  --text-primary: #0A0E1A; --text-secondary: #3D4A6B; --text-muted: #8B9CC8; --border: rgba(0,0,0,0.08); --shadow: 0 4px 24px rgba(0,0,0,0.08);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: var(--font-ar); background: var(--bg-primary); color: var(--text-primary); line-height: 1.6; overflow-x: hidden; transition: background 0.3s, color 0.3s; }
.container { max-width: 1280px; margin: 0 auto; padding: 0 20px; }
.header { position: sticky; top: 0; z-index: 100; background: rgba(10, 14, 26, 0.9); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border); }
[data-theme="light"] .header { background: rgba(240, 244, 255, 0.92); }
.header-inner { display: flex; align-items: center; gap: 24px; padding: 14px 0; }
.logo { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text-primary); font-family: var(--font-en); font-weight: 700; font-size: 1.1rem; flex-shrink: 0; }
.logo-icon { color: var(--accent); font-size: 1.3rem; animation: spin-pulse 4s linear infinite; }
@keyframes spin-pulse { 0%,100% { opacity: 1; transform: rotate(0deg); } 50% { opacity: 0.7; transform: rotate(180deg); } }
.logo-badge { font-size: 0.6rem; background: var(--ember); color: white; padding: 2px 6px; border-radius: 4px; animation: blink 1.5s infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.nav { display: flex; gap: 4px; flex: 1; }
.nav-link { color: var(--text-secondary); text-decoration: none; font-size: 0.9rem; padding: 6px 14px; border-radius: var(--radius-sm); transition: var(--transition); }
.nav-link:hover { color: var(--accent); background: var(--accent-glow); }
.header-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; margin-right: unset; }
[dir="rtl"] .header-actions { margin-right: auto; margin-left: unset; }
.btn-search-toggle, .btn-theme, .btn-menu { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); width: 38px; height: 38px; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: var(--transition); font-size: 1rem; }
.btn-search-toggle:hover, .btn-theme:hover { color: var(--accent); border-color: var(--border-accent); }
.btn-menu { display: none; }
.lang-select select { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-ar); font-size: 0.85rem; outline: none; }
.search-overlay { display: none; padding: 14px 0; border-top: 1px solid var(--border); background: var(--bg-secondary); }
.search-overlay.active { display: block; }
.search-wrap { display: flex; align-items: center; gap: 12px; background: var(--bg-card); border: 1px solid var(--border-accent); border-radius: var(--radius); padding: 10px 16px; }
.search-wrap svg { color: var(--accent); flex-shrink: 0; }
.search-wrap input { flex: 1; background: none; border: none; color: var(--text-primary); font-family: var(--font-ar); font-size: 1rem; outline: none; }
#searchClose { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem; padding: 4px; }
.search-results { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.hero { position: relative; padding: 80px 0 60px; overflow: hidden; }
.hero-bg-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 50px 50px; opacity: 0.5; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent); }
.hero-content { max-width: 640px; position: relative; z-index: 1; }
.hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; background: var(--accent-glow); border: 1px solid var(--border-accent); color: var(--accent); padding: 6px 14px; border-radius: 100px; font-size: 0.8rem; margin-bottom: 24px; }
.pulse-dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; animation: pulse-ring 1.5s infinite; flex-shrink: 0; }
@keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(0,212,170,0.6); } 70% { box-shadow: 0 0 0 8px rgba(0,212,170,0); } 100% { box-shadow: 0 0 0 0 rgba(0,212,170,0); } }
.hero-title { font-size: clamp(2.2rem, 5vw, 3.5rem); font-weight: 700; line-height: 1.15; margin-bottom: 20px; letter-spacing: -0.02em; }
.hero-accent { color: var(--accent); position: relative; }
.hero-subtitle { color: var(--text-secondary); font-size: 1.05rem; margin-bottom: 32px; max-width: 500px; }
.hero-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 60px; }
.btn-primary { background: var(--accent); color: #0A0E1A; padding: 13px 28px; border-radius: var(--radius); text-decoration: none; font-weight: 700; font-size: 0.95rem; transition: var(--transition); display: flex; align-items: center; gap: 8px; }
.btn-primary:hover { background: var(--accent-dark); transform: translateY(-2px); box-shadow: 0 8px 24px var(--accent-glow); }
.btn-ghost { background: transparent; color: var(--text-secondary); padding: 13px 28px; border-radius: var(--radius); text-decoration: none; font-weight: 600; font-size: 0.95rem; border: 1px solid var(--border); transition: var(--transition); }
.btn-ghost:hover { border-color: var(--border-accent); color: var(--accent); }
.hero-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; position: relative; z-index: 1; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 16px; text-align: center; transition: var(--transition); }
.stat-card:hover { border-color: var(--border-accent); box-shadow: var(--shadow-glow); }
.stat-num { font-family: var(--font-en); font-size: 1.9rem; font-weight: 700; color: var(--accent); line-height: 1; margin-bottom: 6px; }
.stat-label { font-size: 0.8rem; color: var(--text-muted); }
.ticker-wrap { display: flex; align-items: center; background: var(--bg-secondary); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); overflow: hidden; height: 40px; }
.ticker-label { background: var(--ember); color: white; font-size: 0.72rem; font-weight: 700; padding: 0 14px; height: 100%; display: flex; align-items: center; white-space: nowrap; gap: 4px; flex-shrink: 0; }
.ticker-track { overflow: hidden; flex: 1; }
.ticker-inner { display: flex; gap: 40px; animation: ticker 30s linear infinite; white-space: nowrap; font-size: 0.82rem; color: var(--text-secondary); }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.filters-bar { background: rgba(10, 14, 26, 0.95); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border); padding: 12px 0; position: sticky; top: 67px; z-index: 90; }
[data-theme="light"] .filters-bar { background: rgba(240, 244, 255, 0.95); }
.filters-inner { display: flex; align-items: center; gap: 12px; overflow-x: auto; scrollbar-width: none; }
.filter-chips { display: flex; gap: 6px; flex-shrink: 0; }
.chip { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 14px; border-radius: 100px; font-family: var(--font-ar); font-size: 0.8rem; cursor: pointer; white-space: nowrap; transition: var(--transition); }
.chip:hover, .chip.active { background: var(--accent); border-color: var(--accent); color: #0A0E1A; font-weight: 600; }
.filter-actions { display: flex; gap: 8px; margin-left: auto; margin-right: unset; flex-shrink: 0; }
[dir="rtl"] .filter-actions { margin-right: auto; margin-left: unset; }
.filter-select { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 12px; border-radius: var(--radius-sm); font-family: var(--font-ar); font-size: 0.8rem; cursor: pointer; outline: none; transition: var(--transition); }
.main-content { padding: 40px 0 80px; }
.content-layout { display: grid; grid-template-columns: 1fr 300px; gap: 32px; align-items: start; }
.section { margin-bottom: 50px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }
.badge-new { background: var(--accent); color: #0A0E1A; font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; font-weight: 800; }
.opportunities-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
.opp-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; cursor: pointer; transition: var(--transition); position: relative; display: flex; flex-direction: column; }
.opp-card:hover { transform: translateY(-4px); border-color: var(--border-accent); box-shadow: var(--shadow), var(--shadow-glow); }
.sidebar { position: sticky; top: 130px; display: flex; flex-direction: column; gap: 20px; }
.sidebar-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); z-index: 200; display: none; align-items: center; justify-content: center; padding: 20px; }
.modal-overlay.active { display: flex; }
.modal { background: var(--bg-card); border: 1px solid var(--border-accent); border-radius: 20px; width: 100%; max-width: 680px; max-height: 85vh; overflow-y: auto; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.footer { background: var(--bg-secondary); border-top: 1px solid var(--border); padding: 60px 0 30px; }
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 40px; }
@media (max-width: 1024px) { .content-layout { grid-template-columns: 1fr; } .sidebar { position: static; flex-direction: row; flex-wrap: wrap; } }
@media (max-width: 768px) { .nav { display: none; } .btn-menu { display: flex; } .hero-title { font-size: 2rem; } .opportunities-grid { grid-template-columns: 1fr; } }
`;

// ==========================================
// 2. MAIN WORKER LOGIC
// ==========================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // عرض الصفحة الرئيسية تلقائياً
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // عرض ملف الـ CSS تلقائياً
    if (url.pathname === '/style.css' || url.pathname === '/styles.css') {
      return new Response(cssContent, {
        headers: { 'Content-Type': 'text/css; charset=utf-8' }
      });
    }

    // مسارات الـ API الخلفية لجلب البيانات
    if (url.pathname === '/api/opportunities') {
      return handleOpportunities(request, env, corsHeaders);
    }
    if (url.pathname === '/api/trending') {
      return handleTrending(env, corsHeaders);
    }
    if (url.pathname === '/api/stats') {
      return handleStats(env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: corsHeaders
    });
  },

  // مهمة مجدولة لتحديث البيانات كل ساعة
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDataFetch(env));
  }
};

/* ==========================================
   SCHEDULED DATA FETCH & APIs
========================================== */
async function runDataFetch(env) {
  const results = [];

  try { const hn = await fetchHackerNews(); results.push(...hn); } catch(e) {}
  try { const reddit = await fetchReddit(); results.push(...reddit); } catch(e) {}
  try { const remote = await fetchRemoteOK(); results.push(...remote); } catch(e) {}
  try { const ph = await fetchProductHunt(); results.push(...ph); } catch(e) {}

  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  await env.EARN_KV.put('opportunities', JSON.stringify(unique), { expirationTtl: 7200 });
  await env.EARN_KV.put('last_updated', new Date().toISOString());
  await env.EARN_KV.put('stats', JSON.stringify({
    total: unique.length,
    lastFetch: new Date().toISOString(),
    sources: ['hackernews', 'reddit', 'remoteok', 'producthunt']
  }));
}

async function fetchHackerNews() {
  const keywords = ['earn', 'money', 'income', 'freelance', 'remote', 'side hustle', 'passive'];
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json();
  const stories = await Promise.allSettled(ids.slice(0, 20).map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())));
  return stories
    .filter(s => s.status === 'fulfilled' && s.value?.url)
    .map(s => s.value)
    .filter(s => keywords.some(k => (s.title || '').toLowerCase().includes(k)))
    .map(s => ({
      id: `hn_${s.id}`, title: s.title, description: `مقال رائج من Hacker News — حصد ${s.score} تفاعل.`,
      category: 'other', status: 'new', emoji: '💡', earnings: 'متفاوت', url: s.url, source: 'hackernews'
    }));
}

async function fetchReddit() {
  const subs = ['beermoney', 'passive_income'];
  const results = [];
  for (const sub of subs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, { headers: { 'User-Agent': 'EarnRadar/1.0' } });
      const data = await res.json();
      const posts = data.data?.children || [];
      results.push(...posts.filter(p => p.data.score > 30).map(p => ({
        id: `reddit_${p.data.id}`, title: p.data.title, description: (p.data.selftext || p.data.title).substring(0, 150),
        category: sub === 'passive_income' ? 'other' : 'freelance', status: 'trending', emoji: '🌐', earnings: 'متفاوت', url: `https://reddit.com${p.data.permalink}`, source: 'reddit'
      })));
    } catch(e) {}
  }
  return results;
}

async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', { headers: { 'User-Agent': 'EarnRadar/1.0' } });
  const jobs = await res.json();
  return jobs.slice(1, 10).filter(j => j.position).map(j => ({
    id: `rok_${j.id}`, title: `${j.position} — ${j.company}`, description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 150),
    category: 'remote', status: 'new', emoji: '💻', earnings: j.salary_min ? `\\$${j.salary_min} - \\$${j.salary_max}/سنة` : 'متفاوت', url: j.url, source: 'remoteok'
  }));
}

async function fetchProductHunt() {
  const res = await fetch('https://www.producthunt.com/feed', { headers: { 'User-Agent': 'EarnRadar/1.0' } });
  const text = await res.text();
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const item = match[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(item) || [])[1] || '';
    const link = (/<link>(.*?)<\/link>/.exec(item) || [])[1] || '';
    if (title && link) {
      const cleanSlug = link.split('/').pop() || Math.random().toString(36).substring(2, 7);
      items.push({
        id: `ph_${cleanSlug}`, title, description: title, category: 'ai', status: 'new', emoji: '🚀', earnings: 'متفاوت', url: link, source: 'producthunt'
      });
    }
  }
  return items.slice(0, 10);
}

async function handleOpportunities(request, env, headers) {
  const cached = await env.EARN_KV.get('opportunities');
  if (cached) return new Response(cached, { headers });
  return new Response('[]', { headers });
}

async function handleTrending(env, headers) {
  const cached = await env.EARN_KV.get('opportunities');
  const opps = JSON.parse(cached || '[]');
  return new Response(JSON.stringify(opps.slice(0, 5)), { headers });
}

async function handleStats(env, headers) {
  const stats = await env.EARN_KV.get('stats');
  return new Response(stats || '{}', { headers });
}
