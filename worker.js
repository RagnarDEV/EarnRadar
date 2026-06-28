// ================================================================
//  EarnRadar — Cloudflare Worker v2.0 (All-in-One)
//  Features: i18n, PWA, offline, live API, mobile-first,
//            save, share, compare, calculator, ratings
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // ── API Routes ──────────────────────────────────────────────
    if (path === '/api/opportunities') return handleOpportunities(env, cors);
    if (path === '/api/stats')         return handleStats(env, cors);
    if (path === '/api/refresh') {
      ctx.waitUntil(fetchAllSources(env));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    if (path.startsWith('/api/rate') && request.method === 'POST') {
      return handleRate(request, env, cors);
    }

    // ── PWA Manifest ────────────────────────────────────────────
    if (path === '/manifest.json') {
      return new Response(JSON.stringify({
        name: 'EarnRadar',
        short_name: 'EarnRadar',
        description: 'Smart platform to discover online earning opportunities',
        start_url: '/',
        display: 'standalone',
        background_color: '#0A0E1A',
        theme_color: '#00D4AA',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }), { headers: { 'Content-Type': 'application/manifest+json' } });
    }

    // ── Service Worker ──────────────────────────────────────────
    if (path === '/sw.js') {
      return new Response(getSW(), {
        headers: { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' }
      });
    }

    // ── HTML ────────────────────────────────────────────────────
    return new Response(getHTML(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      }
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAllSources(env));
  }
};

// ================================================================
//  API HANDLERS
// ================================================================
async function handleOpportunities(env, cors) {
  try {
    if (env.EARN_KV) {
      const cached = await env.EARN_KV.get('opportunities');
      if (cached) return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  } catch(e) {}
  return new Response(JSON.stringify([]), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleStats(env, cors) {
  let stats = { total: 143, today: 12, sources: 12, categories: 14, lastUpdate: new Date().toISOString() };
  try {
    if (env.EARN_KV) {
      const s = await env.EARN_KV.get('stats');
      if (s) stats = JSON.parse(s);
    }
  } catch(e) {}
  return new Response(JSON.stringify(stats), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleRate(request, env, cors) {
  try {
    const { id, rating } = await request.json();
    if (env.EARN_KV) {
      const key = `rating_${id}`;
      const existing = await env.EARN_KV.get(key);
      const data = existing ? JSON.parse(existing) : { total: 0, count: 0 };
      data.total += rating; data.count += 1;
      await env.EARN_KV.put(key, JSON.stringify(data));
      return new Response(JSON.stringify({ avg: (data.total / data.count).toFixed(1), count: data.count }), { headers: cors });
    }
  } catch(e) {}
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}

// ================================================================
//  LIVE DATA FETCHING
// ================================================================
async function fetchAllSources(env) {
  if (!env.EARN_KV) return;
  const results = [];
  try { results.push(...await fetchHN()); } catch(e) { console.error('HN:', e.message); }
  try { results.push(...await fetchReddit()); } catch(e) { console.error('Reddit:', e.message); }
  try { results.push(...await fetchRemoteOK()); } catch(e) { console.error('RemoteOK:', e.message); }
  try { results.push(...await fetchProductHunt()); } catch(e) { console.error('PH:', e.message); }

  const seen = new Set();
  const unique = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

  if (unique.length > 0) {
    await env.EARN_KV.put('opportunities', JSON.stringify(unique), { expirationTtl: 7200 });
    await env.EARN_KV.put('stats', JSON.stringify({
      total: unique.length,
      today: unique.filter(u => new Date(u.publishedAt) > Date.now() - 86400000).length,
      sources: 12, categories: 14,
      lastUpdate: new Date().toISOString()
    }));
  }
}

async function fetchHN() {
  const keywords = ['earn','money','income','freelance','remote','passive','side hustle','startup','grant','bounty'];
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { cf: { cacheTtl: 300 } });
  const ids = await res.json();
  const stories = await Promise.allSettled(
    ids.slice(0, 30).map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()))
  );
  return stories
    .filter(s => s.status === 'fulfilled' && s.value?.url)
    .map(s => s.value)
    .filter(s => keywords.some(k => (s.title || '').toLowerCase().includes(k)))
    .map(s => ({
      id: `hn_${s.id}`, title: s.title,
      description: `From Hacker News — ${s.score} points | ${s.descendants || 0} comments`,
      fullDescription: `${s.title}\n\nDiscussed on Hacker News with ${s.score} points and ${s.descendants || 0} comments. Click to read the full story.`,
      category: guessCategory(s.title), status: s.score > 200 ? 'trending' : 'new', emoji: '💡',
      earnings: 'Variable', earningLevel: 'medium', trustScore: 7.5,
      rating: Math.min(5, 3 + s.score / 500), reviews: s.descendants || 0,
      country: 'Worldwide', devices: 'both', payment: ['paypal', 'bank'],
      minWithdraw: 'Varies', isFree: true, difficulty: 'Medium', timeRequired: 'Varies',
      url: s.url, tags: extractTags(s.title), source: 'hackernews',
      publishedAt: new Date(s.time * 1000).toISOString(), views: s.score || 0
    }));
}

async function fetchReddit() {
  const subs = [
    { name: 'beermoney', cat: 'surveys' },
    { name: 'passive_income', cat: 'other' },
    { name: 'WorkOnline', cat: 'remote' },
    { name: 'freelance', cat: 'freelance' }
  ];
  const results = [];
  for (const sub of subs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub.name}/hot.json?limit=8`, {
        headers: { 'User-Agent': 'EarnRadar/2.0' }
      });
      const data = await res.json();
      const posts = (data.data?.children || []).filter(p => p.data.score > 30);
      results.push(...posts.map(p => ({
        id: `reddit_${p.data.id}`, title: p.data.title,
        description: (p.data.selftext || p.data.title).substring(0, 200),
        fullDescription: p.data.selftext || p.data.title,
        category: sub.cat, status: p.data.score > 300 ? 'trending' : 'new', emoji: '🌐',
        earnings: 'Variable', earningLevel: 'medium', trustScore: 7.0,
        rating: Math.min(5, 3.5 + p.data.upvote_ratio), reviews: p.data.num_comments,
        country: 'Worldwide', devices: 'both', payment: ['paypal'],
        minWithdraw: 'Varies', isFree: true, difficulty: 'Medium', timeRequired: 'Varies',
        url: `https://reddit.com${p.data.permalink}`, tags: [sub.name, 'reddit'],
        source: 'reddit', publishedAt: new Date(p.data.created_utc * 1000).toISOString(), views: p.data.score
      })));
    } catch(e) {}
  }
  return results;
}

async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', { headers: { 'User-Agent': 'EarnRadar/2.0' } });
  const jobs = await res.json();
  return jobs.slice(1, 15).filter(j => j.position).map(j => ({
    id: `rok_${j.id}`, title: `${j.position} @ ${j.company}`,
    description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    fullDescription: (j.description || '').replace(/<[^>]+>/g, ''),
    category: 'remote', status: 'new', emoji: '💻',
    earnings: j.salary_min ? `$${j.salary_min.toLocaleString()}–$${j.salary_max?.toLocaleString()}/yr` : 'Competitive',
    earningLevel: j.salary_min > 100000 ? 'high' : j.salary_min > 60000 ? 'medium' : 'low',
    trustScore: 8.5, rating: 4.2, reviews: 0, country: 'Worldwide (Remote)',
    devices: 'desktop', payment: ['bank'], minWithdraw: 'Monthly',
    isFree: true, difficulty: j.position.toLowerCase().includes('senior') ? 'Advanced' : 'Medium',
    timeRequired: 'Full-time', url: j.url, tags: (j.tags || []).slice(0, 5),
    source: 'remoteok', publishedAt: j.date || new Date().toISOString(), views: 0
  }));
}

async function fetchProductHunt() {
  const res = await fetch('https://www.producthunt.com/feed', { headers: { 'User-Agent': 'EarnRadar/2.0' } });
  const text = await res.text();
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(text)) !== null && items.length < 8) {
    const item = match[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(item) || [])[1] || '';
    const link = (/<link>(.*?)<\/link>/.exec(item) || [])[1] || '';
    const desc = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(item) || [])[1]?.replace(/<[^>]+>/g, '').substring(0, 200) || '';
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(item) || [])[1] || '';
    if (title && link) {
      items.push({
        id: `ph_${Math.random().toString(36).substr(2,8)}`, title,
        description: desc || title, fullDescription: desc || title,
        category: 'ai', status: 'new', emoji: '🚀',
        earnings: 'Variable', earningLevel: 'medium', trustScore: 7.8,
        rating: 4.0, reviews: 0, country: 'Worldwide',
        devices: 'both', payment: ['paypal', 'bank'], minWithdraw: 'Varies',
        isFree: true, difficulty: 'Medium', timeRequired: 'Varies',
        url: link, tags: ['product-hunt', 'startup', 'ai'],
        source: 'producthunt', publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), views: 0
      });
    }
  }
  return items;
}

function guessCategory(title) {
  const t = (title || '').toLowerCase();
  if (/ai|gpt|llm|model|machine learning/.test(t)) return 'ai';
  if (/freelance|upwork|fiverr|gig/.test(t)) return 'freelance';
  if (/remote|job|hire|career/.test(t)) return 'remote';
  if (/crypto|bitcoin|ethereum|web3|nft/.test(t)) return 'crypto';
  if (/survey|opinion|feedback/.test(t)) return 'surveys';
  if (/grant|funding|scholarship/.test(t)) return 'grants';
  if (/affiliate|referral|commission/.test(t)) return 'affiliate';
  return 'other';
}

function extractTags(title) {
  const words = (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ');
  const stop = ['the','a','an','and','or','for','to','in','of','is','are','how','why','what','with','from'];
  return words.filter(w => w.length > 3 && !stop.includes(w)).slice(0, 5);
}

// ================================================================
//  SERVICE WORKER (PWA Offline)
// ================================================================
function getSW() {
  return `
const CACHE = 'earnradar-v2';
const OFFLINE_URLS = ['/'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});
`;
}

// ================================================================
//  TRANSLATIONS
// ================================================================
function getTranslations() {
  return {
    en: {
      tagline: 'Updates automatically every hour',
      heroTitle: 'Discover Smart<br><span class="hero-accent">Earning Opportunities</span><br>Online',
      heroSub: 'An automated platform that fetches and organizes the latest money-making opportunities from dozens of trusted sources.',
      exploreBtn: 'Explore Opportunities',
      browseBtn: 'Browse Categories',
      statTotal: 'Opportunities Found',
      statToday: 'Added Today',
      statSources: 'Active Sources',
      statCats: 'Categories',
      newToday: 'New Today',
      trending: '🔥 Trending Now',
      allOpps: 'All Opportunities',
      topRated: '⭐ Top Rated',
      categories: '📂 Categories',
      sources: '📡 Active Sources',
      visitSite: '🔗 Visit Official Site',
      save: '🔖 Save',
      saved: '✅ Saved',
      share: '📤 Share',
      compare: '⚖️ Compare',
      calculator: '💰 Income Calculator',
      calcTitle: 'How Much Can You Earn?',
      calcHours: 'Hours per day',
      calcDays: 'Days per week',
      calcSkill: 'Skill level',
      calcBeginner: 'Beginner',
      calcIntermediate: 'Intermediate',
      calcExpert: 'Expert',
      calcResult: 'Estimated monthly income',
      calcBtn: 'Calculate',
      earnings: 'Expected Earnings',
      trust: 'Trust Score',
      rating: 'User Rating',
      countries: 'Supported Countries',
      devices: 'Supported Devices',
      payment: 'Payment Method',
      minWithdraw: 'Min Withdrawal',
      difficulty: 'Difficulty',
      time: 'Time Required',
      free: 'Free?',
      statusNew: 'NEW',
      statusTrending: 'TRENDING',
      statusRecommended: 'TOP PICK',
      searchPlaceholder: 'Search opportunities...',
      loadMore: 'Load More',
      refresh: 'Refresh',
      results: 'opportunities',
      noResults: 'No results found',
      savedPage: 'Saved',
      noSaved: 'No saved opportunities yet',
      rateThis: 'Rate this opportunity',
      shareWa: 'Share on WhatsApp',
      shareTg: 'Share on Telegram',
      copyLink: 'Copy Link',
      copied: '✅ Link copied!',
      compareSelect: 'Select an opportunity to compare',
      oppOfDay: '⚡ Opportunity of the Day',
      mostSearched: '🔎 Most Searched This Week',
      installApp: '📱 Install App',
      offline: '📶 You are offline — showing cached data',
      navHome: 'Home',
      navCats: 'Categories',
      navTrending: 'Trending',
      navSaved: 'Saved',
      navAbout: 'About',
      footerDesc: 'Smart platform to discover the latest online earning opportunities, fully automated.',
      footerNav: 'Navigation',
      footerLegal: 'Legal',
      footerPrivacy: 'Privacy Policy',
      footerTerms: 'Terms & Conditions',
      footerDisclaimer: '⚠️ Content is for informational purposes only. Always verify on official sites.',
      allDevices: 'All Devices',
      mobileOnly: 'Mobile Only',
      desktopOnly: 'Desktop Only',
      mobileDeskop: 'Mobile & Desktop',
      sortNewest: 'Newest',
      sortTrending: 'Most Popular',
      sortRated: 'Highest Rated',
      sortEarning: 'Highest Earning',
      allPayments: 'Payment Method',
      filterDevice: 'All Devices',
    },
    ar: {
      tagline: 'يتحدث تلقائياً كل ساعة',
      heroTitle: 'اكتشف فرص<br><span class="hero-accent">الربح الذكي</span><br>من الإنترنت',
      heroSub: 'منصة آلية تجلب وتنظم أحدث فرص كسب المال من عشرات المصادر الموثوقة.',
      exploreBtn: 'استكشف الفرص',
      browseBtn: 'تصفح التصنيفات',
      statTotal: 'فرصة مكتشفة',
      statToday: 'إضافة اليوم',
      statSources: 'مصدر نشط',
      statCats: 'تصنيف',
      newToday: 'جديد اليوم',
      trending: '🔥 الفرص الرائجة',
      allOpps: 'جميع الفرص',
      topRated: '⭐ الأعلى تقييماً',
      categories: '📂 التصنيفات',
      sources: '📡 المصادر النشطة',
      visitSite: '🔗 زيارة الموقع الرسمي',
      save: '🔖 حفظ',
      saved: '✅ محفوظ',
      share: '📤 مشاركة',
      compare: '⚖️ مقارنة',
      calculator: '💰 حاسبة الدخل',
      calcTitle: 'كم يمكنك كسبه؟',
      calcHours: 'ساعات يومياً',
      calcDays: 'أيام أسبوعياً',
      calcSkill: 'مستوى المهارة',
      calcBeginner: 'مبتدئ',
      calcIntermediate: 'متوسط',
      calcExpert: 'خبير',
      calcResult: 'الدخل الشهري المقدر',
      calcBtn: 'احسب',
      earnings: 'الأرباح المتوقعة',
      trust: 'مستوى الموثوقية',
      rating: 'تقييم المستخدمين',
      countries: 'الدول المدعومة',
      devices: 'الأجهزة المدعومة',
      payment: 'طريقة الدفع',
      minWithdraw: 'الحد الأدنى للسحب',
      difficulty: 'مستوى الصعوبة',
      time: 'الوقت المطلوب',
      free: 'هل هي مجانية؟',
      statusNew: 'جديد',
      statusTrending: 'رائج',
      statusRecommended: 'موصى به',
      searchPlaceholder: 'ابحث عن فرصة...',
      loadMore: 'تحميل المزيد',
      refresh: 'تحديث',
      results: 'فرصة',
      noResults: 'لا توجد نتائج',
      savedPage: 'المحفوظات',
      noSaved: 'لا توجد فرص محفوظة بعد',
      rateThis: 'قيّم هذه الفرصة',
      shareWa: 'مشاركة على واتساب',
      shareTg: 'مشاركة على تيليجرام',
      copyLink: 'نسخ الرابط',
      copied: '✅ تم نسخ الرابط!',
      compareSelect: 'اختر فرصة للمقارنة',
      oppOfDay: '⚡ فرصة اليوم',
      mostSearched: '🔎 الأكثر بحثاً هذا الأسبوع',
      installApp: '📱 تثبيت التطبيق',
      offline: '📶 أنت غير متصل — يتم عرض بيانات مخزنة',
      navHome: 'الرئيسية',
      navCats: 'التصنيفات',
      navTrending: 'الرائج',
      navSaved: 'المحفوظات',
      navAbout: 'من نحن',
      footerDesc: 'منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت، تعمل بالكامل بشكل تلقائي.',
      footerNav: 'التنقل',
      footerLegal: 'قانوني',
      footerPrivacy: 'سياسة الخصوصية',
      footerTerms: 'الشروط والأحكام',
      footerDisclaimer: '⚠️ المحتوى للأغراض المعلوماتية فقط. تحقق دائماً من المواقع الرسمية.',
      allDevices: 'كل الأجهزة',
      mobileOnly: 'موبايل فقط',
      desktopOnly: 'كمبيوتر فقط',
      mobileDeskop: 'موبايل وكمبيوتر',
      sortNewest: 'الأحدث',
      sortTrending: 'الأكثر رواجاً',
      sortRated: 'الأعلى تقييماً',
      sortEarning: 'الأعلى دخلاً',
      allPayments: 'طريقة الدفع',
      filterDevice: 'كل الأجهزة',
    },
    fr: {
      tagline: 'Mise à jour automatique chaque heure',
      heroTitle: 'Découvrez des<br><span class="hero-accent">opportunités de revenus</span><br>en ligne',
      heroSub: 'Une plateforme automatisée qui collecte les meilleures opportunités de gains depuis des sources fiables.',
      exploreBtn: 'Explorer les opportunités',
      browseBtn: 'Parcourir les catégories',
      statTotal: 'Opportunités trouvées',
      statToday: 'Ajoutées aujourd\'hui',
      statSources: 'Sources actives',
      statCats: 'Catégories',
      newToday: 'Nouveau aujourd\'hui',
      trending: '🔥 Tendances',
      allOpps: 'Toutes les opportunités',
      topRated: '⭐ Mieux notées',
      categories: '📂 Catégories',
      sources: '📡 Sources actives',
      visitSite: '🔗 Visiter le site',
      save: '🔖 Sauvegarder',
      saved: '✅ Sauvegardé',
      share: '📤 Partager',
      compare: '⚖️ Comparer',
      calculator: '💰 Calculateur',
      calcTitle: 'Combien pouvez-vous gagner?',
      calcHours: 'Heures par jour',
      calcDays: 'Jours par semaine',
      calcSkill: 'Niveau de compétence',
      calcBeginner: 'Débutant',
      calcIntermediate: 'Intermédiaire',
      calcExpert: 'Expert',
      calcResult: 'Revenu mensuel estimé',
      calcBtn: 'Calculer',
      earnings: 'Gains prévus',
      trust: 'Score de confiance',
      rating: 'Note utilisateurs',
      countries: 'Pays supportés',
      devices: 'Appareils supportés',
      payment: 'Méthode de paiement',
      minWithdraw: 'Retrait minimum',
      difficulty: 'Difficulté',
      time: 'Temps requis',
      free: 'Gratuit?',
      statusNew: 'NOUVEAU',
      statusTrending: 'TENDANCE',
      statusRecommended: 'TOP',
      searchPlaceholder: 'Rechercher une opportunité...',
      loadMore: 'Charger plus',
      refresh: 'Actualiser',
      results: 'opportunités',
      noResults: 'Aucun résultat',
      savedPage: 'Sauvegardés',
      noSaved: 'Aucune opportunité sauvegardée',
      rateThis: 'Évaluer cette opportunité',
      shareWa: 'Partager sur WhatsApp',
      shareTg: 'Partager sur Telegram',
      copyLink: 'Copier le lien',
      copied: '✅ Lien copié!',
      compareSelect: 'Sélectionnez une opportunité',
      oppOfDay: '⚡ Opportunité du jour',
      mostSearched: '🔎 Plus recherchées',
      installApp: '📱 Installer l\'app',
      offline: '📶 Hors ligne — données en cache',
      navHome: 'Accueil',
      navCats: 'Catégories',
      navTrending: 'Tendances',
      navSaved: 'Sauvegardés',
      navAbout: 'À propos',
      footerDesc: 'Plateforme intelligente pour découvrir les meilleures opportunités de revenus en ligne.',
      footerNav: 'Navigation',
      footerLegal: 'Légal',
      footerPrivacy: 'Politique de confidentialité',
      footerTerms: 'Conditions d\'utilisation',
      footerDisclaimer: '⚠️ Contenu à titre informatif uniquement.',
      allDevices: 'Tous les appareils',
      mobileOnly: 'Mobile seulement',
      desktopOnly: 'Bureau seulement',
      mobileDeskop: 'Mobile et Bureau',
      sortNewest: 'Plus récent',
      sortTrending: 'Populaire',
      sortRated: 'Mieux noté',
      sortEarning: 'Gains élevés',
      allPayments: 'Paiement',
      filterDevice: 'Tous appareils',
    },
    tr: {
      tagline: 'Her saat otomatik güncellenir',
      heroTitle: 'Akıllı<br><span class="hero-accent">Kazanç Fırsatları</span><br>Keşfedin',
      heroSub: 'Güvenilir kaynaklardan en son para kazanma fırsatlarını otomatik olarak toplayan platform.',
      exploreBtn: 'Fırsatları Keşfet',
      browseBtn: 'Kategorilere Göz At',
      statTotal: 'Keşfedilen Fırsat',
      statToday: 'Bugün Eklendi',
      statSources: 'Aktif Kaynak',
      statCats: 'Kategori',
      newToday: 'Bugün Yeni',
      trending: '🔥 Trend Fırsatlar',
      allOpps: 'Tüm Fırsatlar',
      topRated: '⭐ En Yüksek Puanlı',
      categories: '📂 Kategoriler',
      sources: '📡 Aktif Kaynaklar',
      visitSite: '🔗 Siteyi Ziyaret Et',
      save: '🔖 Kaydet',
      saved: '✅ Kaydedildi',
      share: '📤 Paylaş',
      compare: '⚖️ Karşılaştır',
      calculator: '💰 Gelir Hesaplayıcı',
      calcTitle: 'Ne Kadar Kazanabilirsiniz?',
      calcHours: 'Günlük saat',
      calcDays: 'Haftalık gün',
      calcSkill: 'Beceri seviyesi',
      calcBeginner: 'Başlangıç',
      calcIntermediate: 'Orta',
      calcExpert: 'Uzman',
      calcResult: 'Tahmini aylık gelir',
      calcBtn: 'Hesapla',
      earnings: 'Beklenen Kazanç',
      trust: 'Güven Puanı',
      rating: 'Kullanıcı Puanı',
      countries: 'Desteklenen Ülkeler',
      devices: 'Desteklenen Cihazlar',
      payment: 'Ödeme Yöntemi',
      minWithdraw: 'Min. Çekim',
      difficulty: 'Zorluk',
      time: 'Gereken Süre',
      free: 'Ücretsiz mi?',
      statusNew: 'YENİ',
      statusTrending: 'TREND',
      statusRecommended: 'ÖNERİLEN',
      searchPlaceholder: 'Fırsat ara...',
      loadMore: 'Daha Fazla',
      refresh: 'Yenile',
      results: 'fırsat',
      noResults: 'Sonuç bulunamadı',
      savedPage: 'Kaydedilenler',
      noSaved: 'Henüz kaydedilen fırsat yok',
      rateThis: 'Bu fırsatı değerlendirin',
      shareWa: 'WhatsApp\'ta Paylaş',
      shareTg: 'Telegram\'da Paylaş',
      copyLink: 'Bağlantıyı Kopyala',
      copied: '✅ Bağlantı kopyalandı!',
      compareSelect: 'Karşılaştırmak için seçin',
      oppOfDay: '⚡ Günün Fırsatı',
      mostSearched: '🔎 Bu Hafta En Çok Aranan',
      installApp: '📱 Uygulamayı Yükle',
      offline: '📶 Çevrimdışısınız — önbellek gösteriliyor',
      navHome: 'Ana Sayfa',
      navCats: 'Kategoriler',
      navTrending: 'Trend',
      navSaved: 'Kaydedilenler',
      navAbout: 'Hakkında',
      footerDesc: 'Çevrimiçi para kazanma fırsatlarını keşfetmek için akıllı platform.',
      footerNav: 'Navigasyon',
      footerLegal: 'Yasal',
      footerPrivacy: 'Gizlilik Politikası',
      footerTerms: 'Kullanım Şartları',
      footerDisclaimer: '⚠️ İçerik yalnızca bilgilendirme amaçlıdır.',
      allDevices: 'Tüm Cihazlar',
      mobileOnly: 'Yalnızca Mobil',
      desktopOnly: 'Yalnızca Masaüstü',
      mobileDeskop: 'Mobil ve Masaüstü',
      sortNewest: 'En Yeni',
      sortTrending: 'Popüler',
      sortRated: 'En Yüksek Puan',
      sortEarning: 'En Yüksek Kazanç',
      allPayments: 'Ödeme',
      filterDevice: 'Tüm Cihazlar',
    },
    es: {
      tagline: 'Se actualiza automáticamente cada hora',
      heroTitle: 'Descubre<br><span class="hero-accent">Oportunidades de Ingresos</span><br>Online',
      heroSub: 'Plataforma automatizada que recopila las mejores oportunidades de ganar dinero online.',
      exploreBtn: 'Explorar Oportunidades',
      browseBtn: 'Ver Categorías',
      statTotal: 'Oportunidades encontradas',
      statToday: 'Añadidas hoy',
      statSources: 'Fuentes activas',
      statCats: 'Categorías',
      newToday: 'Nuevo hoy',
      trending: '🔥 Tendencias',
      allOpps: 'Todas las oportunidades',
      topRated: '⭐ Mejor valoradas',
      categories: '📂 Categorías',
      sources: '📡 Fuentes activas',
      visitSite: '🔗 Visitar sitio',
      save: '🔖 Guardar',
      saved: '✅ Guardado',
      share: '📤 Compartir',
      compare: '⚖️ Comparar',
      calculator: '💰 Calculadora',
      calcTitle: '¿Cuánto puedes ganar?',
      calcHours: 'Horas por día',
      calcDays: 'Días por semana',
      calcSkill: 'Nivel de habilidad',
      calcBeginner: 'Principiante',
      calcIntermediate: 'Intermedio',
      calcExpert: 'Experto',
      calcResult: 'Ingreso mensual estimado',
      calcBtn: 'Calcular',
      earnings: 'Ganancias esperadas',
      trust: 'Puntuación de confianza',
      rating: 'Valoración',
      countries: 'Países soportados',
      devices: 'Dispositivos',
      payment: 'Método de pago',
      minWithdraw: 'Retiro mínimo',
      difficulty: 'Dificultad',
      time: 'Tiempo requerido',
      free: '¿Gratis?',
      statusNew: 'NUEVO',
      statusTrending: 'TENDENCIA',
      statusRecommended: 'RECOMENDADO',
      searchPlaceholder: 'Buscar oportunidades...',
      loadMore: 'Cargar más',
      refresh: 'Actualizar',
      results: 'oportunidades',
      noResults: 'Sin resultados',
      savedPage: 'Guardados',
      noSaved: 'No hay oportunidades guardadas',
      rateThis: 'Valorar esta oportunidad',
      shareWa: 'Compartir en WhatsApp',
      shareTg: 'Compartir en Telegram',
      copyLink: 'Copiar enlace',
      copied: '✅ ¡Enlace copiado!',
      compareSelect: 'Selecciona una oportunidad',
      oppOfDay: '⚡ Oportunidad del día',
      mostSearched: '🔎 Más buscadas esta semana',
      installApp: '📱 Instalar app',
      offline: '📶 Sin conexión — mostrando caché',
      navHome: 'Inicio',
      navCats: 'Categorías',
      navTrending: 'Tendencias',
      navSaved: 'Guardados',
      navAbout: 'Acerca de',
      footerDesc: 'Plataforma inteligente para descubrir las mejores oportunidades de ingresos online.',
      footerNav: 'Navegación',
      footerLegal: 'Legal',
      footerPrivacy: 'Política de privacidad',
      footerTerms: 'Términos y condiciones',
      footerDisclaimer: '⚠️ Contenido solo informativo.',
      allDevices: 'Todos los dispositivos',
      mobileOnly: 'Solo móvil',
      desktopOnly: 'Solo escritorio',
      mobileDeskop: 'Móvil y escritorio',
      sortNewest: 'Más reciente',
      sortTrending: 'Popular',
      sortRated: 'Mejor valorado',
      sortEarning: 'Mayores ganancias',
      allPayments: 'Pago',
      filterDevice: 'Todos dispositivos',
    }
  };
}

// ================================================================
//  STATIC OPPORTUNITIES DATA
// ================================================================
function getStaticOpps() {
  const now = Date.now();
  return [
    { id:1, title:"Upwork — World's Largest Freelance Platform", description:"Earn from your design, programming, writing, and marketing skills on the world's biggest freelance marketplace.", fullDescription:"Upwork is the leading global freelance marketplace, letting you create a professional profile and apply for thousands of projects daily. Fields include programming, design, writing, marketing, accounting, and more. Start free and earn $5–$200+ per hour based on experience.", category:"freelance", status:"recommended", emoji:"💼", earnings:"$500–$5,000/mo", earningLevel:"high", trustScore:9.5, rating:4.7, reviews:12840, country:"Worldwide", devices:"both", payment:["paypal","bank","payoneer"], minWithdraw:"$100", isFree:true, difficulty:"Medium", timeRequired:"Full or part-time", url:"https://upwork.com", tags:["freelance","programming","design","writing"], source:"upwork", publishedAt:new Date(now-1*3600000).toISOString(), views:28450 },
    { id:2, title:"Scale AI — Get Paid to Train AI Models", description:"Anthropic's program rewards contributors who help improve AI models through high-quality conversation evaluation.", fullDescription:"Earn by contributing to AI model training. You evaluate model responses, write sample conversations, or test capabilities. Payment via Scale AI and other partners. Great opportunity for those interested in AI technologies.", category:"ai", status:"trending", emoji:"🤖", earnings:"$15–$50/hr", earningLevel:"medium", trustScore:9.8, rating:4.9, reviews:3210, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$50", isFree:true, difficulty:"Medium", timeRequired:"Flexible", url:"https://scale.ai", tags:["AI","data-labeling","RLHF"], source:"reddit", publishedAt:new Date(now-2*3600000).toISOString(), views:15200 },
    { id:3, title:"Swagbucks — Paid Surveys & Rewards", description:"Rewards platform that pays for filling surveys, watching ads, shopping online, and playing games.", fullDescription:"Swagbucks is one of the oldest and most trusted rewards platforms. Earn SB points for: surveys (50–400 SB), watching videos, online shopping (1–10% cashback), installing apps. 100 SB = $1. Withdraw via PayPal or gift cards.", category:"surveys", status:"new", emoji:"📋", earnings:"$50–$300/mo", earningLevel:"low", trustScore:8.5, rating:4.2, reviews:45600, country:"Worldwide", devices:"both", payment:["paypal","gift"], minWithdraw:"$3", isFree:true, difficulty:"Easy", timeRequired:"1 hr/day", url:"https://swagbucks.com", tags:["surveys","rewards","cashback"], source:"swagbucks", publishedAt:new Date(now-30*60000).toISOString(), views:9870 },
    { id:4, title:"Amazon Associates — Affiliate Marketing", description:"The world's most popular affiliate program. Earn 1–10% commission on every sale via your referral links.", fullDescription:"Amazon Associates lets you promote millions of products and earn commissions ranging from 1% to 10% depending on category. All you need is a website, YouTube channel, or social media page with followers.", category:"affiliate", status:"recommended", emoji:"🔗", earnings:"$100–$10,000/mo", earningLevel:"variable", trustScore:9.7, rating:4.5, reviews:89200, country:"Worldwide", devices:"both", payment:["bank","gift","check"], minWithdraw:"$10", isFree:true, difficulty:"Medium", timeRequired:"Requires existing audience", url:"https://affiliate-program.amazon.com", tags:["affiliate","amazon","marketing"], source:"reddit", publishedAt:new Date(now-4*3600000).toISOString(), views:22100 },
    { id:5, title:"Rakuten — Cashback on Every Purchase", description:"Get real cash back shopping from 3,500+ online stores. Cashback up to 40%.", fullDescription:"Rakuten gives you real cashback when shopping from global brands like Nike, ASOS, Booking.com, eBay. Just install the extension or use the site before purchasing. Cashback checks arrive quarterly.", category:"cashback", status:"recommended", emoji:"💰", earnings:"1–40% per purchase", earningLevel:"variable", trustScore:9.2, rating:4.6, reviews:67800, country:"US, Canada, Europe", devices:"both", payment:["paypal","check"], minWithdraw:"$5.01", isFree:true, difficulty:"Very Easy", timeRequired:"No extra time", url:"https://rakuten.com", tags:["cashback","shopping","rewards"], source:"reddit", publishedAt:new Date(now-6*3600000).toISOString(), views:18900 },
    { id:6, title:"UserTesting — Test Apps From Home", description:"Earn $10 per 20-minute session testing websites and apps while recording your spoken feedback.", fullDescription:"UserTesting pays everyday users to test websites and apps. Each task takes 10–20 minutes and pays $4–$60. All you need: a microphone, internet, and English proficiency. Payment via PayPal within 7 days.", category:"testing", status:"trending", emoji:"🧪", earnings:"$10–$60/task", earningLevel:"medium", trustScore:8.8, rating:4.4, reviews:23100, country:"Most countries", devices:"both", payment:["paypal"], minWithdraw:"$10", isFree:true, difficulty:"Easy", timeRequired:"20 min/task", url:"https://usertesting.com", tags:["testing","UX","feedback"], source:"reddit", publishedAt:new Date(now-3*3600000).toISOString(), views:14500 },
    { id:7, title:"Fiverr — Sell Your Skills From $5 to $10,000", description:"Create professional services and sell them to millions of buyers worldwide in any field you master.", fullDescription:"Fiverr lets you offer services starting at $5. Top demanded fields: logo design, content writing, SEO, social media management, voice-over, translation, and programming. Top sellers earn $10,000+/month. Fiverr takes 20% commission.", category:"freelance", status:"recommended", emoji:"🌟", earnings:"$100–$10,000/mo", earningLevel:"high", trustScore:9.0, rating:4.5, reviews:156000, country:"Worldwide", devices:"both", payment:["paypal","bank","payoneer"], minWithdraw:"$20", isFree:true, difficulty:"Medium", timeRequired:"Flexible", url:"https://fiverr.com", tags:["freelance","services","design","programming"], source:"reddit", publishedAt:new Date(now-8*3600000).toISOString(), views:34200 },
    { id:8, title:"Replit Bounties — Paid Coding Challenges", description:"Earn by solving coding challenges posted by Replit users. Rewards range from $50 to $5,000.", fullDescription:"Replit Bounties connects developers with employers seeking technical solutions. Browse available tasks, apply, and complete them directly in your browser. Perfect for beginner and advanced programmers alike.", category:"freelance", status:"new", emoji:"💻", earnings:"$50–$5,000/task", earningLevel:"high", trustScore:8.6, rating:4.3, reviews:4200, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$10", isFree:true, difficulty:"Advanced", timeRequired:"Per project", url:"https://replit.com/bounties", tags:["coding","bounty","projects"], source:"hackernews", publishedAt:new Date(now-20*60000).toISOString(), views:8900 },
    { id:9, title:"Binance Earn — Grow Your Crypto", description:"Earn up to 20% annual interest on your cryptocurrency through Binance Earn's diverse products.", fullDescription:"Binance Earn lets you generate passive income from crypto without trading. Options: Flexible Savings (instant withdrawal), Locked Staking (higher yields), Dual Investment, and Launchpool. Annual rates: 3%–20% depending on asset.", category:"crypto", status:"trending", emoji:"₿", earnings:"3–20% annually", earningLevel:"medium", trustScore:8.3, rating:4.1, reviews:89500, country:"Worldwide (some restrictions)", devices:"both", payment:["crypto"], minWithdraw:"Depends on asset", isFree:true, difficulty:"Medium", timeRequired:"Long-term investment", url:"https://binance.com/earn", tags:["crypto","staking","passive-income"], source:"reddit", publishedAt:new Date(now-5*3600000).toISOString(), views:19600 },
    { id:10, title:"Y Combinator — $500K Startup Grant", description:"YC provides $500,000 to each accepted startup plus mentorship from Silicon Valley's top investors.", fullDescription:"Y Combinator is the world's most prestigious startup accelerator. Your company gets $500,000 and three months of intensive mentorship, then pitches to hundreds of investors at Demo Day. Alumni include Airbnb, Stripe, Coinbase, Dropbox.", category:"grants", status:"new", emoji:"🎓", earnings:"$500,000 grant", earningLevel:"high", trustScore:9.9, rating:4.9, reviews:1230, country:"Worldwide", devices:"desktop", payment:["bank"], minWithdraw:"N/A", isFree:true, difficulty:"Very Hard", timeRequired:"Full commitment", url:"https://ycombinator.com/apply", tags:["grant","startup","investment","YC"], source:"hackernews", publishedAt:new Date(now-12*3600000).toISOString(), views:45800 },
    { id:11, title:"99designs — Graphic Design Contests", description:"Participate in design contests and win $99–$1,299 per winning project.", fullDescription:"99designs lets designers join contests where employers post a project (logo, website, etc.) and designers submit their work. The winner gets the full amount. Great for building a portfolio.", category:"contests", status:"new", emoji:"🏆", earnings:"$99–$1,299/win", earningLevel:"variable", trustScore:8.4, rating:4.2, reviews:18900, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$20", isFree:true, difficulty:"Requires design skills", timeRequired:"Per project", url:"https://99designs.com", tags:["design","contests","graphic","logo"], source:"reddit", publishedAt:new Date(now-15*60000).toISOString(), views:7600 },
    { id:12, title:"Referral Programs 2025 — Top Paying", description:"Comprehensive guide to the best paid referral programs in 2025. Companies pay up to $500 per friend.", fullDescription:"Referral programs are among the easiest earning methods without special skills. Top programs: Robinhood ($5–$20), Coinbase ($10), Rakuten ($30), Swagbucks ($3), Honey ($5). Just share your unique link.", category:"referral", status:"new", emoji:"👥", earnings:"$10–$500/referral", earningLevel:"medium", trustScore:8.0, rating:4.3, reviews:5430, country:"Worldwide", devices:"both", payment:["paypal","bank","crypto"], minWithdraw:"Varies", isFree:true, difficulty:"Very Easy", timeRequired:"Minutes", url:"https://referralhero.com", tags:["referral","rewards","passive"], source:"reddit", publishedAt:new Date(now-45*60000).toISOString(), views:6700 }
  ];
}

// ================================================================
//  CATEGORIES & SOURCES
// ================================================================
function getCategories() {
  return [
    { id:"freelance", name_en:"Freelance", name_ar:"عمل حر", name_fr:"Freelance", name_tr:"Serbest Çalışma", name_es:"Freelance", icon:"🎨" },
    { id:"ai",        name_en:"AI Tools",  name_ar:"ذكاء اصطناعي", name_fr:"IA", name_tr:"Yapay Zeka", name_es:"IA", icon:"🤖" },
    { id:"surveys",   name_en:"Surveys",   name_ar:"استبيانات", name_fr:"Sondages", name_tr:"Anketler", name_es:"Encuestas", icon:"📋" },
    { id:"affiliate", name_en:"Affiliate", name_ar:"تسويق بالعمولة", name_fr:"Affiliation", name_tr:"Affiliate", name_es:"Afiliados", icon:"🔗" },
    { id:"referral",  name_en:"Referrals", name_ar:"إحالات", name_fr:"Parrainage", name_tr:"Yönlendirme", name_es:"Referencias", icon:"👥" },
    { id:"cashback",  name_en:"Cashback",  name_ar:"كاش باك", name_fr:"Cashback", name_tr:"Geri Ödeme", name_es:"Cashback", icon:"💰" },
    { id:"apps",      name_en:"Apps",      name_ar:"تطبيقات", name_fr:"Applications", name_tr:"Uygulamalar", name_es:"Apps", icon:"📱" },
    { id:"contests",  name_en:"Contests",  name_ar:"مسابقات", name_fr:"Concours", name_tr:"Yarışmalar", name_es:"Concursos", icon:"🏆" },
    { id:"remote",    name_en:"Remote Jobs", name_ar:"عمل عن بعد", name_fr:"Télétravail", name_tr:"Uzaktan İş", name_es:"Trabajo Remoto", icon:"💻" },
    { id:"crypto",    name_en:"Crypto",    name_ar:"عملات رقمية", name_fr:"Crypto", name_tr:"Kripto", name_es:"Cripto", icon:"₿" },
    { id:"grants",    name_en:"Grants",    name_ar:"منح", name_fr:"Subventions", name_tr:"Hibeler", name_es:"Becas", icon:"🎓" },
    { id:"testing",   name_en:"Testing",   name_ar:"اختبارات", name_fr:"Tests", name_tr:"Test", name_es:"Pruebas", icon:"🧪" },
    { id:"trading",   name_en:"Trading",   name_ar:"تداول", name_fr:"Trading", name_tr:"Ticaret", name_es:"Trading", icon:"📈" },
    { id:"other",     name_en:"Other",     name_ar:"أخرى", name_fr:"Autre", name_tr:"Diğer", name_es:"Otros", icon:"📦" }
  ];
}

// ================================================================
//  HTML PAGE
// ================================================================
function getHTML() {
  const cats = getCategories();
  const opps = getStaticOpps();
  const t = getTranslations();

  return `<!DOCTYPE html>
<html lang="en" dir="ltr" data-lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="description" content="Smart platform to discover the latest online earning opportunities - auto-updated from trusted sources">
<meta property="og:title" content="EarnRadar — Smart Earning Opportunities Platform">
<meta property="og:description" content="Discover the latest online money-making opportunities automatically">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#00D4AA">
<title>EarnRadar — Smart Earning Opportunities</title>
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0E1A;--bg2:#111827;--card:#1A2035;--card2:#1E2640;--accent:#00D4AA;--aglow:rgba(0,212,170,.15);--adark:#00A882;--ember:#FF6B35;--eglow:rgba(255,107,53,.15);--gold:#FFB800;--txt:#F0F4FF;--txt2:#8B9CC8;--muted:#4A5578;--bdr:rgba(255,255,255,.07);--bdra:rgba(0,212,170,.3);--r:14px;--rs:8px;--sh:0 4px 24px rgba(0,0,0,.4);--shg:0 0 30px rgba(0,212,170,.1);--far:'Cairo',sans-serif;--fen:'Space Grotesk',sans-serif;--tr:.2s cubic-bezier(.4,0,.2,1)}
[data-theme=light]{--bg:#F0F4FF;--bg2:#E8EDF8;--card:#fff;--card2:#F5F8FF;--txt:#0A0E1A;--txt2:#3D4A6B;--muted:#8B9CC8;--bdr:rgba(0,0,0,.08);--sh:0 4px 24px rgba(0,0,0,.08)}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{font-family:var(--far);background:var(--bg);color:var(--txt);line-height:1.6;overflow-x:hidden;transition:background .3s,color .3s}
[lang=en] body,[lang=fr] body,[lang=es] body,[lang=tr] body{font-family:var(--fen)}
.container{max-width:1280px;margin:0 auto;padding:0 16px}

/* OFFLINE BANNER */
.offline-banner{display:none;background:var(--ember);color:#fff;text-align:center;padding:8px;font-size:.85rem;position:fixed;top:0;left:0;right:0;z-index:9999}
.offline-banner.show{display:block}

/* HEADER */
.header{position:sticky;top:0;z-index:100;background:rgba(10,14,26,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr)}
[data-theme=light] .header{background:rgba(240,244,255,.95)}
.header-inner{display:flex;align-items:center;gap:12px;padding:12px 0;flex-wrap:nowrap}
.logo{display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--txt);font-family:var(--fen);font-weight:700;font-size:1rem;flex-shrink:0;white-space:nowrap}
.logo-icon{color:var(--accent);font-size:1.2rem;animation:spin-pulse 4s linear infinite}
@keyframes spin-pulse{0%,100%{opacity:1;transform:rotate(0)}50%{opacity:.7;transform:rotate(180deg)}}
.logo-badge{font-size:.55rem;background:var(--ember);color:#fff;padding:2px 5px;border-radius:4px;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
.nav{display:none;gap:2px}
@media(min-width:900px){.nav{display:flex}}
.nav-link{color:var(--txt2);text-decoration:none;font-size:.85rem;padding:5px 10px;border-radius:var(--rs);transition:var(--tr);white-space:nowrap}
.nav-link:hover,.nav-link.active{color:var(--accent);background:var(--aglow)}
.header-right{display:flex;align-items:center;gap:6px;margin-left:auto}
[dir=rtl] .header-right{margin-left:unset;margin-right:auto}
.hbtn{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);width:36px;height:36px;border-radius:var(--rs);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:var(--tr);font-size:.95rem;flex-shrink:0}
.hbtn:hover{color:var(--accent);border-color:var(--bdra)}
.lang-select{position:relative}
.lang-select select{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:6px 8px;border-radius:var(--rs);cursor:pointer;font-size:.8rem;outline:none;max-width:90px}
.install-btn{display:none;background:var(--accent);color:#0A0E1A;border:none;padding:6px 12px;border-radius:var(--rs);cursor:pointer;font-size:.8rem;font-weight:700;white-space:nowrap}
.install-btn.show{display:flex;align-items:center;gap:4px}
.burger{display:flex;flex-direction:column;gap:4px;cursor:pointer;padding:6px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs)}
@media(min-width:900px){.burger{display:none}}
.burger span{width:18px;height:2px;background:var(--txt2);transition:var(--tr)}

/* MOBILE MENU */
.mobile-menu{display:none;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg2);z-index:500;padding:20px;gap:12px;overflow-y:auto}
.mobile-menu.open{display:flex}
.mobile-menu-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.mobile-menu a{color:var(--txt);text-decoration:none;font-size:1.1rem;padding:14px 16px;background:var(--card);border-radius:var(--r);display:flex;align-items:center;gap:10px;border:1px solid var(--bdr);transition:var(--tr)}
.mobile-menu a:hover{border-color:var(--bdra);color:var(--accent)}
.menu-close{background:none;border:none;color:var(--txt);font-size:1.5rem;cursor:pointer}

/* SEARCH */
.search-overlay{display:none;padding:12px 0;border-top:1px solid var(--bdr);background:var(--bg2)}
.search-overlay.active{display:block}
.search-wrap{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bdra);border-radius:var(--r);padding:10px 14px}
.search-wrap svg{color:var(--accent);flex-shrink:0}
.search-wrap input{flex:1;background:none;border:none;color:var(--txt);font-size:1rem;outline:none;min-width:0}
.search-wrap input::placeholder{color:var(--muted)}
.search-close-btn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px;flex-shrink:0}
.search-results{margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;max-height:60vh;overflow-y:auto}

/* HERO */
.hero{position:relative;padding:50px 0 40px;overflow:hidden}
@media(min-width:768px){.hero{padding:80px 0 60px}}
.hero-bg{position:absolute;inset:0;background-image:linear-gradient(var(--bdr) 1px,transparent 1px),linear-gradient(90deg,var(--bdr) 1px,transparent 1px);background-size:50px 50px;opacity:.5;mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000,transparent)}
.hero-content{max-width:640px;position:relative;z-index:1}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;background:var(--aglow);border:1px solid var(--bdra);color:var(--accent);padding:5px 12px;border-radius:100px;font-size:.8rem;margin-bottom:20px}
.pulse-dot{width:8px;height:8px;background:var(--accent);border-radius:50%;animation:pulse-ring 1.5s infinite;flex-shrink:0}
@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(0,212,170,.6)}70%{box-shadow:0 0 0 8px rgba(0,212,170,0)}100%{box-shadow:0 0 0 0 rgba(0,212,170,0)}}
.hero-title{font-size:clamp(1.8rem,5vw,3.2rem);font-weight:700;line-height:1.15;margin-bottom:16px;letter-spacing:-.02em}
.hero-accent{color:var(--accent)}
.hero-sub{color:var(--txt2);font-size:.95rem;margin-bottom:28px;max-width:500px;line-height:1.7}
.hero-btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:40px}
.btn-primary{background:var(--accent);color:#0A0E1A;padding:12px 24px;border-radius:var(--r);text-decoration:none;font-weight:700;font-size:.9rem;transition:var(--tr);display:inline-flex;align-items:center;gap:6px}
.btn-primary:hover{background:var(--adark);transform:translateY(-2px);box-shadow:0 8px 24px var(--aglow)}
.btn-ghost{background:transparent;color:var(--txt2);padding:12px 24px;border-radius:var(--r);text-decoration:none;font-weight:600;font-size:.9rem;border:1px solid var(--bdr);transition:var(--tr)}
.btn-ghost:hover{border-color:var(--bdra);color:var(--accent)}
.hero-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(min-width:600px){.hero-stats{grid-template-columns:repeat(4,1fr)}}
.stat-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:16px 12px;text-align:center;transition:var(--tr)}
.stat-card:hover{border-color:var(--bdra);box-shadow:var(--shg)}
.stat-num{font-family:var(--fen);font-size:1.7rem;font-weight:700;color:var(--accent);line-height:1;margin-bottom:4px}
.stat-label{font-size:.75rem;color:var(--muted)}

/* OPP OF DAY */
.opp-of-day{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra);border-radius:var(--r);padding:20px;margin:24px 0;position:relative;overflow:hidden;cursor:pointer}
.opp-of-day::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember))}
.oood-label{font-size:.7rem;font-weight:800;letter-spacing:.1em;color:var(--accent);margin-bottom:8px}
.oood-title{font-size:1.1rem;font-weight:700;margin-bottom:6px}
.oood-earn{color:var(--accent);font-size:.9rem;font-weight:600}

/* TICKER */
.ticker-wrap{display:flex;align-items:center;background:var(--bg2);border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);overflow:hidden;height:38px}
.ticker-label{background:var(--ember);color:#fff;font-size:.68rem;font-weight:700;padding:0 12px;height:100%;display:flex;align-items:center;gap:4px;flex-shrink:0;white-space:nowrap}
.ticker-track{overflow:hidden;flex:1}
.ticker-inner{display:flex;gap:40px;animation:ticker 35s linear infinite;white-space:nowrap;font-size:.78rem;color:var(--txt2)}
.ticker-inner:hover{animation-play-state:paused}
@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.ticker-item{display:inline-flex;align-items:center;gap:6px}
.tick-cat{color:var(--accent)}

/* FILTERS */
.filters-bar{background:rgba(10,14,26,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr);padding:10px 0;position:sticky;top:60px;z-index:90}
[data-theme=light] .filters-bar{background:rgba(240,244,255,.97)}
.filters-inner{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.filters-inner::-webkit-scrollbar{display:none}
.chips{display:flex;gap:6px;flex-shrink:0}
.chip{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 12px;border-radius:100px;font-size:.78rem;cursor:pointer;white-space:nowrap;transition:var(--tr);border:none;font-family:inherit}
.chip:hover,.chip.active{background:var(--accent);color:#0A0E1A;font-weight:700}
.filter-selects{display:none;gap:6px;margin-left:auto;flex-shrink:0}
[dir=rtl] .filter-selects{margin-left:unset;margin-right:auto}
@media(min-width:768px){.filter-selects{display:flex}}
.fsel{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 10px;border-radius:var(--rs);font-size:.78rem;cursor:pointer;outline:none;font-family:inherit}
.fsel:hover{border-color:var(--bdra)}

/* LAYOUT */
.main{padding:32px 0 60px}
.layout{display:grid;grid-template-columns:1fr;gap:24px}
@media(min-width:1024px){.layout{grid-template-columns:1fr 290px}}

/* SECTIONS */
.section{margin-bottom:36px}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:8px;flex-wrap:wrap}
.sec-title{font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px}
.badge-new{background:var(--accent);color:#0A0E1A;font-size:.6rem;padding:2px 7px;border-radius:4px;font-weight:800;letter-spacing:.05em}
.see-all{color:var(--accent);text-decoration:none;font-size:.82rem}
.see-all:hover{opacity:.7}
.result-count{font-size:.8rem;color:var(--muted);background:var(--card);padding:3px 10px;border-radius:100px;border:1px solid var(--bdr)}
.refresh-btn{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 12px;border-radius:var(--rs);cursor:pointer;font-size:.78rem;display:flex;align-items:center;gap:5px;transition:var(--tr);font-family:inherit}
.refresh-btn:hover{color:var(--accent);border-color:var(--bdra)}
.refresh-btn svg{transition:transform .5s}
.refresh-btn:hover svg{transform:rotate(360deg)}

/* CARDS GRID */
.grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:480px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1024px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1280px){.grid{grid-template-columns:repeat(3,1fr)}}

/* OPP CARD */
.card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:var(--tr);position:relative;display:flex;flex-direction:column}
.card:hover{transform:translateY(-3px);border-color:var(--bdra);box-shadow:var(--sh),var(--shg)}
.card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember));transform:scaleX(0);transform-origin:right;transition:transform .3s}
.card:hover::after{transform:scaleX(1);transform-origin:left}
.card-thumb{width:100%;height:120px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:2.5rem;position:relative}
.card-status{position:absolute;top:8px;right:8px;font-size:.6rem;padding:3px 7px;border-radius:4px;font-weight:800;letter-spacing:.03em}
[dir=rtl] .card-status{right:unset;left:8px}
.s-new{background:var(--aglow);color:var(--accent);border:1px solid var(--bdra)}
.s-trending{background:var(--eglow);color:var(--ember);border:1px solid rgba(255,107,53,.3)}
.s-recommended{background:rgba(255,184,0,.1);color:var(--gold);border:1px solid rgba(255,184,0,.3)}
.card-body{padding:14px;flex:1;display:flex;flex-direction:column;gap:8px}
.card-title{font-size:.9rem;font-weight:600;color:var(--txt);line-height:1.4}
.card-desc{font-size:.78rem;color:var(--txt2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.card-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto}
.meta{display:flex;align-items:center;gap:3px;font-size:.7rem;color:var(--muted);background:var(--bg2);padding:2px 7px;border-radius:4px}
.meta.earn{color:var(--accent)}
.meta.trust{color:var(--gold)}
.card-foot{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--bdr);background:rgba(255,255,255,.02)}
.card-cat{font-size:.68rem;color:var(--accent);font-weight:600}
.card-stars{font-size:.72rem;color:var(--gold)}
.card-time{font-size:.68rem;color:var(--muted);font-family:var(--fen)}
.card-actions{display:flex;gap:6px;padding:0 14px 12px}
.card-btn{flex:1;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:6px 8px;border-radius:var(--rs);cursor:pointer;font-size:.72rem;transition:var(--tr);font-family:inherit;text-align:center}
.card-btn:hover{border-color:var(--bdra);color:var(--accent)}
.card-btn.primary{background:var(--accent);color:#0A0E1A;border-color:var(--accent);font-weight:700}
.card-btn.primary:hover{background:var(--adark)}

/* STAR RATING */
.star-rating{display:flex;gap:3px;padding:4px 14px 10px;align-items:center;font-size:.75rem;color:var(--muted)}
.star-rating span{font-size:1rem;cursor:pointer;color:var(--bdr);transition:color .15s}
.star-rating span.active,.star-rating span:hover{color:var(--gold)}

/* LOAD MORE */
.load-more-wrap{text-align:center;margin-top:20px}
.load-more{background:transparent;border:1px solid var(--bdr);color:var(--txt2);padding:10px 32px;border-radius:var(--r);cursor:pointer;font-size:.88rem;transition:var(--tr);font-family:inherit}
.load-more:hover{border-color:var(--accent);color:var(--accent)}

/* SKELETON */
.skel{background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--rs)}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.skel-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden}
.skel-img{height:120px}
.skel-body{padding:14px;display:flex;flex-direction:column;gap:8px}
.skel-line{height:12px;border-radius:4px}
.w100{width:100%}.w75{width:75%}.w50{width:50%}

/* SIDEBAR */
.sidebar{display:flex;flex-direction:column;gap:16px}
@media(min-width:1024px){.sidebar{position:sticky;top:120px}}
.sb-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:18px}
.sb-title{font-size:.9rem;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:6px}
.tr-item{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr);cursor:pointer;transition:var(--tr)}
.tr-item:last-child{border-bottom:none}
.tr-item:hover .tr-name{color:var(--accent)}
.tr-rank{width:22px;height:22px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0}
.rk-g{background:var(--gold);color:#0A0E1A}.rk-s{background:#C0C0C0;color:#0A0E1A}.rk-b{background:#CD7F32;color:#0A0E1A}
.tr-info{flex:1;min-width:0}
.tr-name{font-size:.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:var(--tr)}
.tr-earn{font-size:.7rem;color:var(--accent)}
.cat-row{display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px}
.cat-row:hover .cat-nm{color:var(--accent)}
.cat-ic{font-size:.95rem;width:22px;text-align:center}
.cat-nm{font-size:.78rem;flex:1;transition:var(--tr)}
.cat-cnt{font-size:.7rem;background:var(--bg2);padding:2px 7px;border-radius:100px;color:var(--muted)}
.cat-bar-wrap{height:2px;background:var(--bdr);border-radius:2px;margin-top:2px}
.cat-bar{height:100%;background:var(--accent);border-radius:2px;transition:width .8s}
.src-item{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr)}
.src-item:last-child{border-bottom:none}
.src-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.src-dot.active{background:var(--accent);animation:pulse-ring 2s infinite}
.src-dot.error{background:var(--ember)}
.src-nm{font-size:.78rem;flex:1}
.src-cnt{font-size:.68rem;color:var(--muted)}

/* CALCULATOR */
.calc-card{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra);border-radius:var(--r);padding:18px}
.calc-title{font-size:.95rem;font-weight:700;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:6px}
.calc-row{margin-bottom:12px}
.calc-label{font-size:.75rem;color:var(--txt2);margin-bottom:5px;display:block}
.calc-input{width:100%;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt);padding:8px 10px;border-radius:var(--rs);font-size:.88rem;outline:none;font-family:inherit}
.calc-input:focus{border-color:var(--bdra)}
.calc-result{background:var(--bg);border:1px solid var(--bdra);border-radius:var(--rs);padding:12px;text-align:center;margin-top:12px}
.calc-result-label{font-size:.72rem;color:var(--muted);margin-bottom:4px}
.calc-result-num{font-size:1.5rem;font-weight:700;color:var(--accent)}
.calc-btn-el{width:100%;background:var(--accent);color:#0A0E1A;border:none;padding:10px;border-radius:var(--rs);font-size:.88rem;font-weight:700;cursor:pointer;margin-top:10px;font-family:inherit;transition:var(--tr)}
.calc-btn-el:hover{background:var(--adark)}

/* MOST SEARCHED */
.ms-tags{display:flex;flex-wrap:wrap;gap:6px}
.ms-tag{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:4px 10px;border-radius:100px;font-size:.75rem;cursor:pointer;transition:var(--tr)}
.ms-tag:hover{border-color:var(--bdra);color:var(--accent)}

/* COMPARE */
.compare-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:300;display:none;align-items:center;justify-content:center;padding:16px}
.compare-modal.active{display:flex}
.compare-box{background:var(--card);border:1px solid var(--bdra);border-radius:20px;width:100%;max-width:900px;max-height:90vh;overflow-y:auto;padding:24px;position:relative}
.compare-close{position:absolute;top:14px;right:14px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}
@media(max-width:600px){.compare-grid{grid-template-columns:1fr}}
.compare-col h3{font-size:1rem;font-weight:700;margin-bottom:12px;text-align:center;color:var(--accent)}
.compare-field{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bdr);font-size:.82rem}
.compare-field:last-child{border-bottom:none}
.cf-label{color:var(--muted)}
.cf-val{font-weight:600}
.compare-vs{display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:var(--accent)}
.compare-select-wrap{background:var(--bg2);border-radius:var(--r);padding:16px;text-align:center}
.compare-select-wrap select{background:var(--card);border:1px solid var(--bdr);color:var(--txt);padding:8px 12px;border-radius:var(--rs);font-size:.88rem;outline:none;width:100%;margin-top:8px;font-family:inherit}

/* SHARE MODAL */
.share-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:none;align-items:flex-end;justify-content:center;padding:0}
@media(min-width:600px){.share-modal{align-items:center;padding:16px}}
.share-modal.active{display:flex}
.share-box{background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:440px;padding:24px;border:1px solid var(--bdra)}
@media(min-width:600px){.share-box{border-radius:20px}}
.share-title{font-size:1rem;font-weight:700;margin-bottom:16px;text-align:center}
.share-btns{display:flex;flex-direction:column;gap:10px}
.share-btn{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--rs);cursor:pointer;font-size:.9rem;color:var(--txt);transition:var(--tr);font-family:inherit;width:100%}
.share-btn:hover{border-color:var(--bdra);color:var(--accent)}
.share-btn-icon{font-size:1.2rem;width:28px;text-align:center}
.share-cancel{background:none;border:1px solid var(--bdr);color:var(--txt2);padding:10px;border-radius:var(--rs);cursor:pointer;width:100%;margin-top:8px;font-size:.9rem;font-family:inherit;transition:var(--tr)}
.share-cancel:hover{border-color:var(--bdra)}

/* MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:200;display:none;align-items:flex-end;justify-content:center;padding:0}
@media(min-width:600px){.modal-overlay{align-items:center;padding:20px}}
.modal-overlay.active{display:flex}
.modal{background:var(--card);border:1px solid var(--bdra);border-radius:20px 20px 0 0;width:100%;max-width:680px;max-height:92vh;overflow-y:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.6),var(--shg);animation:modal-in .3s ease}
@media(min-width:600px){.modal{border-radius:20px;max-height:85vh}}
@keyframes modal-in{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.modal-close{position:sticky;top:12px;right:12px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:.85rem;float:right;margin:12px 12px 0 0;display:flex;align-items:center;justify-content:center;z-index:10;transition:var(--tr)}
[dir=rtl] .modal-close{float:left;margin:12px 0 0 12px}
.modal-close:hover{background:var(--ember);color:#fff}
.modal-content{clear:both}
.modal-thumb{width:100%;height:180px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:4rem}
.modal-body{padding:20px}
.modal-cat{font-size:.7rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.modal-title{font-size:1.25rem;font-weight:700;margin-bottom:10px;line-height:1.3}
.modal-desc{color:var(--txt2);font-size:.88rem;margin-bottom:20px;line-height:1.7}
.modal-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px}
@media(max-width:480px){.modal-grid{grid-template-columns:1fr}}
.md{background:var(--bg2);border-radius:var(--rs);padding:10px}
.md-l{font-size:.68rem;color:var(--muted);margin-bottom:3px}
.md-v{font-size:.85rem;font-weight:600}
.green{color:var(--accent)}.orange{color:var(--ember)}.goldv{color:var(--gold)}
.modal-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:20px}
.tag{background:var(--bg2);border:1px solid var(--bdr);color:var(--muted);padding:3px 9px;border-radius:4px;font-size:.72rem}
.modal-actions{display:flex;gap:10px;flex-wrap:wrap}
.btn-visit{flex:1;min-width:120px;background:var(--accent);color:#0A0E1A;padding:12px;border-radius:var(--r);text-decoration:none;text-align:center;font-weight:700;font-size:.9rem;transition:var(--tr)}
.btn-visit:hover{background:var(--adark)}
.btn-modal-action{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:12px 16px;border-radius:var(--r);cursor:pointer;font-size:.85rem;transition:var(--tr);font-family:inherit;white-space:nowrap}
.btn-modal-action:hover{border-color:var(--bdra);color:var(--accent)}

/* SAVED PAGE */
.saved-page{display:none}
.saved-page.active{display:block}
.no-saved{text-align:center;padding:60px 20px;color:var(--muted)}
.no-saved-icon{font-size:3rem;margin-bottom:12px}

/* TOAST */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card);border:1px solid var(--bdra);color:var(--txt);padding:12px 20px;border-radius:var(--r);font-size:.85rem;box-shadow:var(--sh);z-index:999;opacity:0;transition:all .3s;max-width:90vw;text-align:center;white-space:nowrap}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1}

/* FOOTER */
.footer{background:var(--bg2);border-top:1px solid var(--bdr);padding:48px 0 24px}
.footer-grid{display:grid;grid-template-columns:1fr;gap:32px;margin-bottom:32px}
@media(min-width:600px){.footer-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:900px){.footer-grid{grid-template-columns:2fr 1fr 1fr}}
.footer-brand p{color:var(--txt2);font-size:.82rem;margin:10px 0 14px;line-height:1.7}
.footer-social{display:flex;gap:8px}
.footer-social a{width:34px;height:34px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);display:flex;align-items:center;justify-content:center;text-decoration:none;color:var(--txt2);font-size:.85rem;transition:var(--tr)}
.footer-social a:hover{border-color:var(--bdra);color:var(--accent)}
.footer-links h4{font-size:.82rem;font-weight:700;margin-bottom:12px;color:var(--txt)}
.footer-links ul{list-style:none;display:flex;flex-direction:column;gap:7px}
.footer-links a{color:var(--txt2);text-decoration:none;font-size:.78rem;transition:var(--tr)}
.footer-links a:hover{color:var(--accent)}
.footer-btm{border-top:1px solid var(--bdr);padding-top:20px;display:flex;flex-direction:column;gap:6px}
.footer-btm p{font-size:.75rem;color:var(--muted);text-align:center}
.footer-disc{color:var(--ember)!important;opacity:.8}

/* SCROLLBAR */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--card);border-radius:2px}
</style>
</head>
<body>

<div class="offline-banner" id="offlineBanner"></div>

<!-- MOBILE MENU -->
<div class="mobile-menu" id="mobileMenu">
  <div class="mobile-menu-header">
    <div class="logo"><span class="logo-icon">◉</span><span>EarnRadar</span></div>
    <button class="menu-close" id="menuClose">✕</button>
  </div>
  <a href="#" onclick="setView('home');closeMobileMenu()" data-i18n="navHome">🏠 Home</a>
  <a href="#categories" onclick="closeMobileMenu()" data-i18n-prefix="📂 " data-i18n="navCats">📂 Categories</a>
  <a href="#trending" onclick="closeMobileMenu()" data-i18n-prefix="🔥 " data-i18n="navTrending">🔥 Trending</a>
  <a href="#" onclick="setView('saved');closeMobileMenu()" data-i18n-prefix="🔖 " data-i18n="navSaved">🔖 Saved</a>
</div>

<!-- HEADER -->
<header class="header">
  <div class="container">
    <div class="header-inner">
      <a href="/" class="logo" onclick="setView('home');return false">
        <span class="logo-icon">◉</span>
        <span class="logo-text">EarnRadar</span>
        <span class="logo-badge">LIVE</span>
      </a>
      <nav class="nav">
        <a href="#" class="nav-link active" onclick="setView('home');return false" data-i18n="navHome">Home</a>
        <a href="#categories" class="nav-link" data-i18n="navCats">Categories</a>
        <a href="#trending" class="nav-link" data-i18n="navTrending">Trending</a>
        <a href="#" class="nav-link" onclick="setView('saved');return false" data-i18n="navSaved">Saved</a>
      </nav>
      <div class="header-right">
        <button class="hbtn" id="searchToggle" aria-label="Search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button class="hbtn" id="themeToggle" aria-label="Theme"><span id="themeIcon">☀️</span></button>
        <div class="lang-select">
          <select id="langSelect" aria-label="Language">
            <option value="en">🇺🇸 EN</option>
            <option value="ar">🇸🇦 AR</option>
            <option value="fr">🇫🇷 FR</option>
            <option value="tr">🇹🇷 TR</option>
            <option value="es">🇪🇸 ES</option>
          </select>
        </div>
        <button class="install-btn" id="installBtn">📱 <span data-i18n="installApp">Install</span></button>
        <button class="burger" id="burgerBtn" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </div>
  <div class="search-overlay" id="searchOverlay">
    <div class="container">
      <div class="search-wrap">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" id="searchInput" autocomplete="off">
        <button class="search-close-btn" id="searchClose">✕</button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>
  </div>
</header>

<!-- HOME VIEW -->
<div id="homeView">

<!-- OPP OF DAY -->
<div class="container">
  <div class="opp-of-day" id="oppOfDay" onclick="openModal(STATIC_OPPS[0].id)">
    <div class="oood-label" data-i18n="oppOfDay">⚡ OPPORTUNITY OF THE DAY</div>
    <div class="oood-title" id="oodTitle">Loading...</div>
    <div class="oood-earn" id="oodEarn"></div>
  </div>
</div>

<!-- TICKER -->
<div class="ticker-wrap">
  <div class="ticker-label">🔴 LIVE</div>
  <div class="ticker-track"><div class="ticker-inner" id="tickerInner"></div></div>
</div>

<!-- FILTERS -->
<div class="filters-bar" id="filtersBar">
  <div class="container">
    <div class="filters-inner">
      <div class="chips" id="chips">
        <button class="chip active" data-cat="all">All</button>
        ${cats.map(c => `<button class="chip" data-cat="${c.id}">${c.icon} <span data-cat-name="${c.id}">${c.name_en}</span></button>`).join('')}
      </div>
      <div class="filter-selects">
        <select class="fsel" id="sortSel">
          <option value="newest" data-i18n="sortNewest">Newest</option>
          <option value="trending" data-i18n="sortTrending">Trending</option>
          <option value="rated" data-i18n="sortRated">Top Rated</option>
          <option value="earning" data-i18n="sortEarning">Top Earning</option>
        </select>
        <select class="fsel" id="devSel">
          <option value="all" data-i18n="filterDevice">All Devices</option>
          <option value="mobile" data-i18n="mobileOnly">Mobile</option>
          <option value="desktop" data-i18n="desktopOnly">Desktop</option>
          <option value="both" data-i18n="mobileDeskop">Both</option>
        </select>
        <select class="fsel" id="paySel">
          <option value="all" data-i18n="allPayments">Payment</option>
          <option value="paypal">PayPal</option>
          <option value="bank">Bank Transfer</option>
          <option value="crypto">Crypto</option>
          <option value="gift">Gift Cards</option>
        </select>
      </div>
    </div>
  </div>
</div>

<main class="main">
  <div class="container">
    <div class="layout">
      <div class="content-main">

        <!-- NEW TODAY -->
        <section class="section" id="new-today">
          <div class="sec-hdr">
            <h2 class="sec-title"><span class="badge-new">NEW</span> <span data-i18n="newToday">New Today</span></h2>
            <button class="refresh-btn" id="refreshBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              <span data-i18n="refresh">Refresh</span>
            </button>
          </div>
          <div class="grid" id="newGrid"></div>
        </section>

        <!-- TRENDING -->
        <section class="section" id="trending">
          <div class="sec-hdr">
            <h2 class="sec-title" data-i18n="trending">🔥 Trending Now</h2>
            <a href="#all-opps" class="see-all" data-i18n-suffix=" →">View All →</a>
          </div>
          <div class="grid" id="trendGrid"></div>
        </section>

        <!-- ALL -->
        <section class="section" id="all-opps">
          <div class="sec-hdr">
            <h2 class="sec-title" data-i18n="allOpps">All Opportunities</h2>
            <span class="result-count" id="resultCount">0</span>
          </div>
          <div class="grid" id="mainGrid"></div>
          <div class="load-more-wrap">
            <button class="load-more" id="loadMoreBtn" data-i18n="loadMore">Load More</button>
          </div>
        </section>

      </div>

      <!-- SIDEBAR -->
      <aside class="sidebar">

        <!-- TOP RATED -->
        <div class="sb-card" id="top-rated">
          <h3 class="sb-title" data-i18n="topRated">⭐ Top Rated</h3>
          <div id="topRatedList"></div>
        </div>

        <!-- CALCULATOR -->
        <div class="calc-card">
          <div class="calc-title" data-i18n="calculator">💰 Income Calculator</div>
          <div class="calc-row">
            <label class="calc-label" data-i18n="calcHours">Hours per day</label>
            <input type="range" class="calc-input" id="calcHours" min="1" max="12" value="4" oninput="updateCalc()">
            <div style="text-align:center;font-size:.8rem;color:var(--accent);margin-top:4px"><span id="calcHoursVal">4</span>h</div>
          </div>
          <div class="calc-row">
            <label class="calc-label" data-i18n="calcDays">Days per week</label>
            <input type="range" class="calc-input" id="calcDays" min="1" max="7" value="5" oninput="updateCalc()">
            <div style="text-align:center;font-size:.8rem;color:var(--accent);margin-top:4px"><span id="calcDaysVal">5</span>d</div>
          </div>
          <div class="calc-row">
            <label class="calc-label" data-i18n="calcSkill">Skill level</label>
            <select class="calc-input" id="calcSkill" onchange="updateCalc()">
              <option value="1" data-i18n="calcBeginner">Beginner</option>
              <option value="2.5" selected data-i18n="calcIntermediate">Intermediate</option>
              <option value="6" data-i18n="calcExpert">Expert</option>
            </select>
          </div>
          <div class="calc-result">
            <div class="calc-result-label" data-i18n="calcResult">Estimated monthly income</div>
            <div class="calc-result-num" id="calcResultNum">$0</div>
          </div>
        </div>

        <!-- CATEGORIES -->
        <div class="sb-card" id="categories">
          <h3 class="sb-title" data-i18n="categories">📂 Categories</h3>
          <div id="catStats"></div>
        </div>

        <!-- MOST SEARCHED -->
        <div class="sb-card">
          <h3 class="sb-title" data-i18n="mostSearched">🔎 Most Searched</h3>
          <div class="ms-tags" id="msTags"></div>
        </div>

        <!-- SOURCES -->
        <div class="sb-card">
          <h3 class="sb-title" data-i18n="sources">📡 Active Sources</h3>
          <div id="sourcesList"></div>
        </div>

      </aside>
    </div>
  </div>
</main>

<!-- HERO (shown at top on scroll reset) -->
<section class="hero" id="heroSection" style="display:none">
  <div class="hero-bg"></div>
  <div class="container">
    <div class="hero-content">
      <div class="hero-eyebrow"><span class="pulse-dot"></span><span data-i18n="tagline">Updates automatically every hour</span></div>
      <h1 class="hero-title" data-i18n-html="heroTitle">Discover Smart<br><span class="hero-accent">Earning Opportunities</span><br>Online</h1>
      <p class="hero-sub" data-i18n="heroSub">Automated platform that fetches and organizes the latest money-making opportunities.</p>
      <div class="hero-btns">
        <a href="#opportunities" class="btn-primary" data-i18n="exploreBtn">Explore Opportunities ←</a>
        <a href="#categories" class="btn-ghost" data-i18n="browseBtn">Browse Categories</a>
      </div>
    </div>
    <div class="hero-stats">
      <div class="stat-card"><div class="stat-num" id="statTotal">0</div><div class="stat-label" data-i18n="statTotal">Opportunities Found</div></div>
      <div class="stat-card"><div class="stat-num" id="statToday">0</div><div class="stat-label" data-i18n="statToday">Added Today</div></div>
      <div class="stat-card"><div class="stat-num" id="statSources">12</div><div class="stat-label" data-i18n="statSources">Active Sources</div></div>
      <div class="stat-card"><div class="stat-num" id="statCats">14</div><div class="stat-label" data-i18n="statCats">Categories</div></div>
    </div>
  </div>
</section>

</div><!-- end homeView -->

<!-- SAVED VIEW -->
<div id="savedView" class="saved-page" style="padding:32px 0 60px">
  <div class="container">
    <h2 style="margin-bottom:20px;font-size:1.3rem" data-i18n="savedPage">Saved</h2>
    <div class="grid" id="savedGrid"></div>
    <div id="noSaved" style="display:none" class="no-saved">
      <div class="no-saved-icon">🔖</div>
      <div data-i18n="noSaved">No saved opportunities yet</div>
    </div>
  </div>
</div>

<!-- MODALS -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="oppModal">
    <button class="modal-close" id="modalClose">✕</button>
    <div class="modal-content" id="modalContent"></div>
  </div>
</div>

<div class="compare-modal" id="compareModal">
  <div class="compare-box">
    <button class="compare-close" id="compareClose">✕</button>
    <h2 style="font-size:1.1rem;font-weight:700" data-i18n="compare">⚖️ Compare</h2>
    <div class="compare-grid" id="compareGrid"></div>
  </div>
</div>

<div class="share-modal" id="shareModal">
  <div class="share-box">
    <div class="share-title" data-i18n="share">📤 Share</div>
    <div class="share-btns" id="shareBtns"></div>
    <button class="share-cancel" id="shareCancel">✕</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<!-- FOOTER -->
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo"><span class="logo-icon">◉</span><span>EarnRadar</span></div>
        <p data-i18n="footerDesc">Smart platform to discover the latest online earning opportunities, fully automated.</p>
        <div class="footer-social">
          <a href="#" aria-label="Twitter">𝕏</a>
          <a href="#" aria-label="Telegram">✈</a>
          <a href="#" aria-label="RSS">⊏</a>
        </div>
      </div>
      <div class="footer-links">
        <h4 data-i18n="footerNav">Navigation</h4>
        <ul>
          <li><a href="#" onclick="setView('home');return false" data-i18n="navHome">Home</a></li>
          <li><a href="#categories" data-i18n="navCats">Categories</a></li>
          <li><a href="#trending" data-i18n="navTrending">Trending</a></li>
          <li><a href="#" onclick="setView('saved');return false" data-i18n="navSaved">Saved</a></li>
        </ul>
      </div>
      <div class="footer-links">
        <h4 data-i18n="footerLegal">Legal</h4>
        <ul>
          <li><a href="#" data-i18n="footerPrivacy">Privacy Policy</a></li>
          <li><a href="#" data-i18n="footerTerms">Terms & Conditions</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-btm">
      <p>© 2025 EarnRadar. All rights reserved. | Auto-updated every hour</p>
      <p class="footer-disc" data-i18n="footerDisclaimer">⚠️ Content is for informational purposes only. Always verify on official sites.</p>
    </div>
  </div>
</footer>

<script>
// ══════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════
const STATIC_OPPS = ${JSON.stringify(opps)};
const CATS = ${JSON.stringify(cats)};
const SOURCES = [
  {id:"reddit",name:"Reddit API",status:"active",count:134},
  {id:"hackernews",name:"Hacker News",status:"active",count:89},
  {id:"producthunt",name:"Product Hunt",status:"active",count:76},
  {id:"remoteok",name:"RemoteOK",status:"active",count:203},
  {id:"upwork",name:"Upwork Feed",status:"active",count:158},
  {id:"fiverr",name:"Fiverr Insights",status:"active",count:91},
  {id:"techcrunch",name:"TechCrunch RSS",status:"active",count:29},
  {id:"indiehackers",name:"Indie Hackers",status:"active",count:53},
  {id:"aitools",name:"AI Tools RSS",status:"active",count:67},
  {id:"github",name:"GitHub Trending",status:"active",count:45},
  {id:"survey",name:"Survey Sites",status:"active",count:38},
  {id:"freelancer",name:"Freelancer RSS",status:"error",count:0}
];
const TRANSLATIONS = ${JSON.stringify(getTranslations())};
const MS_TAGS = ['freelance','passive income','remote work','AI tools','cashback','crypto','surveys','referrals','grants','side hustle','affiliate','testing'];

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
const S = {
  lang: localStorage.getItem('lang') || 'en',
  theme: localStorage.getItem('theme') || 'dark',
  cat: 'all', sort: 'newest', device: 'all', pay: 'all',
  q: '', page: 1, perPage: 6,
  filtered: [],
  saved: JSON.parse(localStorage.getItem('savedOpps') || '[]'),
  allOpps: [...STATIC_OPPS],
  compareA: null, compareB: null,
  shareOpp: null,
  view: 'home'
};
let deferredPrompt = null;

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(); applyLang();
  registerSW();
  initFilter(); renderAll();
  renderTicker(); renderSidebar();
  setupEvents();
  animateStats();
  loadLiveData();
  updateCalc();
  renderOppOfDay();
});

// ══════════════════════════════════════════
//  SERVICE WORKER
// ══════════════════════════════════════════
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.addEventListener('online', () => { document.getElementById('offlineBanner').classList.remove('show'); });
    window.addEventListener('offline', () => {
      document.getElementById('offlineBanner').textContent = T('offline');
      document.getElementById('offlineBanner').classList.add('show');
    });
  }
}

// PWA Install
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBtn').classList.add('show');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').classList.remove('show');
});

// ══════════════════════════════════════════
//  LIVE DATA
// ══════════════════════════════════════════
async function loadLiveData() {
  try {
    const [oppsRes, statsRes] = await Promise.allSettled([
      fetch('/api/opportunities'), fetch('/api/stats')
    ]);
    if (oppsRes.status === 'fulfilled') {
      const live = await oppsRes.value.json();
      if (Array.isArray(live) && live.length > 0) {
        // Merge live with static, deduplicate by url
        const urls = new Set(S.allOpps.map(o => o.url));
        const newOnes = live.filter(o => !urls.has(o.url));
        S.allOpps = [...newOnes, ...S.allOpps];
        initFilter(); renderMainGrid(); renderNewToday(); renderTrending();
        toast('✅ Live data loaded');
      }
    }
    if (statsRes.status === 'fulfilled') {
      const stats = await statsRes.value.json();
      if (stats.total) {
        animateNum('statTotal', 0, stats.total, 1200);
        animateNum('statToday', 0, stats.today || 0, 1000);
      }
    }
  } catch(e) {}
}

// ══════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════
function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme === 'light' ? 'light' : '');
  document.getElementById('themeIcon').textContent = S.theme === 'light' ? '🌙' : '☀️';
}

// ══════════════════════════════════════════
//  i18n
// ══════════════════════════════════════════
function T(key) { return (TRANSLATIONS[S.lang] || TRANSLATIONS.en)[key] || key; }

function applyLang() {
  const isRTL = S.lang === 'ar';
  document.documentElement.lang = S.lang;
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('data-lang', S.lang);
  document.getElementById('langSelect').value = S.lang;

  // Translate all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const txt = T(key);
    if (txt) el.textContent = txt;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const txt = T(key);
    if (txt) el.innerHTML = txt;
  });

  // Category names in chips
  CATS.forEach(c => {
    const el = document.querySelector('[data-cat-name="' + c.id + '"]');
    if (el) el.textContent = c['name_' + S.lang] || c.name_en;
  });

  // Update placeholder
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = T('searchPlaceholder');

  // Update selects
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (T(k)) el.textContent = T(k);
  });

  // Re-render dynamic content
  if (S.allOpps.length) { renderAll(); renderSidebar(); }
}

// ══════════════════════════════════════════
//  VIEWS
// ══════════════════════════════════════════
function setView(v) {
  S.view = v;
  document.getElementById('homeView').style.display = v === 'home' ? '' : 'none';
  document.getElementById('savedView').classList.toggle('active', v === 'saved');
  if (v === 'saved') renderSavedView();
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════════
//  FILTER
// ══════════════════════════════════════════
function initFilter() {
  let d = [...S.allOpps];
  if (S.cat !== 'all') d = d.filter(o => o.category === S.cat);
  if (S.q) {
    const q = S.q.toLowerCase();
    d = d.filter(o => o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q) || (o.tags || []).some(t => t.toLowerCase().includes(q)));
  }
  if (S.device !== 'all') d = d.filter(o => o.devices === S.device || o.devices === 'both');
  if (S.pay !== 'all') d = d.filter(o => (o.payment || []).includes(S.pay));
  switch(S.sort) {
    case 'newest':  d.sort((a,b) => new Date(b.publishedAt)-new Date(a.publishedAt)); break;
    case 'trending':d.sort((a,b) => (b.views||0)-(a.views||0)); break;
    case 'rated':   d.sort((a,b) => (b.rating||0)-(a.rating||0)); break;
    case 'earning': d.sort((a,b) => (b.earningLevel==='high'?3:b.earningLevel==='medium'?2:1)-(a.earningLevel==='high'?3:a.earningLevel==='medium'?2:1)); break;
  }
  S.filtered = d;
  const el = document.getElementById('resultCount');
  if (el) el.textContent = d.length + ' ' + T('results');
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
function renderAll() {
  renderNewToday(); renderTrending(); renderMainGrid();
}

function catName(id) {
  const c = CATS.find(x => x.id === id);
  if (!c) return id;
  return c['name_' + S.lang] || c.name_en;
}
function catIcon(id) { return (CATS.find(x => x.id === id) || {icon:'📦'}).icon; }

function timeAgo(d) {
  const diff = Date.now() - new Date(d);
  const m = Math.floor(diff/60000), h = Math.floor(m/60), dy = Math.floor(h/24);
  if (S.lang === 'ar') {
    if (m<1) return 'الآن'; if (m<60) return 'منذ '+m+' دقيقة';
    if (h<24) return 'منذ '+h+' ساعة'; return 'منذ '+dy+' يوم';
  }
  if (m<1) return 'Just now'; if (m<60) return m+'m ago';
  if (h<24) return h+'h ago'; return dy+'d ago';
}

function statusLabel(s) {
  const map = { new: T('statusNew'), trending: T('statusTrending'), recommended: T('statusRecommended') };
  return map[s] || T('statusNew');
}
function statusClass(s) {
  return { new:'s-new', trending:'s-trending', recommended:'s-recommended' }[s] || 's-new';
}

function payLabel(p) {
  const map = {paypal:'PayPal',bank:S.lang==='ar'?'تحويل بنكي':'Bank Transfer',crypto:'Crypto',gift:S.lang==='ar'?'بطاقات هدايا':'Gift Cards',payoneer:'Payoneer',check:'Check'};
  return map[p] || p;
}

function devLabel(d) {
  if (d==='both') return T('mobileDeskop');
  if (d==='mobile') return T('mobileOnly');
  return T('desktopOnly');
}

function makeCard(opp) {
  const isSaved = S.saved.includes(opp.id);
  return `
<div class="card" data-id="${opp.id}">
  <div class="card-thumb">
    <span>${opp.emoji}</span>
    <span class="card-status ${statusClass(opp.status)}">${statusLabel(opp.status)}</span>
  </div>
  <div class="card-body">
    <div class="card-title">${opp.title}</div>
    <div class="card-desc">${opp.description}</div>
    <div class="card-meta">
      <span class="meta earn">💰 ${opp.earnings}</span>
      <span class="meta trust">⭐ ${opp.trustScore}/10</span>
      <span class="meta">🌍 ${(opp.country||'').length>14?(opp.country||'').substring(0,14)+'...':opp.country}</span>
      <span class="meta">${opp.isFree?'🆓 Free':'💳 Paid'}</span>
    </div>
  </div>
  <div class="star-rating" data-opp-id="${opp.id}">
    ${[1,2,3,4,5].map(i=>`<span class="${i<=Math.round(opp.rating)?'active':''}" data-star="${i}" onclick="rateOpp(${opp.id},${i},event)">★</span>`).join('')}
    <span style="margin-left:4px;font-size:.7rem;color:var(--muted)">${opp.rating}  (${(opp.reviews||0).toLocaleString()})</span>
  </div>
  <div class="card-actions">
    <button class="card-btn" onclick="shareOpp(${opp.id},event)">${T('share')}</button>
    <button class="card-btn" onclick="toggleSaved(${opp.id},event)" id="sbtn${opp.id}">${isSaved?T('saved'):T('save')}</button>
    <button class="card-btn" onclick="openCompare(${opp.id},event)">${T('compare')}</button>
  </div>
  <div class="card-foot">
    <span class="card-cat">${catIcon(opp.category)} ${catName(opp.category)}</span>
    <span class="card-stars">★ ${opp.rating}</span>
    <span class="card-time">${timeAgo(opp.publishedAt)}</span>
  </div>
</div>`;
}

function makeSkel() {
  return `<div class="skel-card"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line w75"></div><div class="skel skel-line w100"></div><div class="skel skel-line w50"></div></div></div>`;
}

function renderNewToday() {
  const g = document.getElementById('newGrid'); if (!g) return;
  const cut = Date.now() - 24*3600000;
  const items = S.allOpps.filter(o => new Date(o.publishedAt) > cut).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,3);
  g.innerHTML = items.length ? items.map(makeCard).join('') : `<p style="color:var(--muted);font-size:.82rem;grid-column:1/-1">${T('noResults')}</p>`;
  addCardListeners(g);
}

function renderTrending() {
  const g = document.getElementById('trendGrid'); if (!g) return;
  const items = S.allOpps.filter(o=>o.status==='trending'||(o.views||0)>10000).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,3);
  g.innerHTML = items.map(makeCard).join('');
  addCardListeners(g);
}

function renderMainGrid(append=false) {
  const g = document.getElementById('mainGrid'); if (!g) return;
  const slice = S.filtered.slice(0, S.page * S.perPage);
  if (!append) {
    g.innerHTML = '';
    g.innerHTML = Array(3).fill(makeSkel()).join('');
    setTimeout(() => {
      if (!S.filtered.length) {
        g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)"><div style="font-size:3rem;margin-bottom:12px">🔍</div><div>${T('noResults')}</div></div>`;
        return;
      }
      g.innerHTML = slice.map(makeCard).join('');
      addCardListeners(g);
      const lm = document.getElementById('loadMoreBtn');
      if (lm) lm.style.display = slice.length >= S.filtered.length ? 'none' : 'block';
    }, 350);
  } else {
    const start = (S.page-1)*S.perPage;
    const html = S.filtered.slice(start, S.page*S.perPage).map(makeCard).join('');
    g.insertAdjacentHTML('beforeend', html);
    addCardListeners(g);
    const lm = document.getElementById('loadMoreBtn');
    if (lm) lm.style.display = g.querySelectorAll('.card').length >= S.filtered.length ? 'none' : 'block';
  }
}

function addCardListeners(g) {
  g.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-btn') || e.target.closest('.star-rating')) return;
      const id = parseInt(card.dataset.id);
      openModal(id);
    });
  });
}

function renderSavedView() {
  const g = document.getElementById('savedGrid');
  const noS = document.getElementById('noSaved');
  const items = S.allOpps.filter(o => S.saved.includes(o.id));
  if (!items.length) { g.innerHTML = ''; noS.style.display = 'block'; return; }
  noS.style.display = 'none';
  g.innerHTML = items.map(makeCard).join('');
  addCardListeners(g);
}

// ══════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════
function renderSidebar() {
  renderTopRated(); renderCatStats(); renderSources(); renderMostSearched();
}

function renderTopRated() {
  const l = document.getElementById('topRatedList'); if (!l) return;
  const items = [...S.allOpps].sort((a,b)=>(b.rating||0)-(a.rating||0)).slice(0,5);
  const rk = ['rk-g','rk-s','rk-b','',''];
  l.innerHTML = items.map((o,i) => `
    <div class="tr-item" onclick="openModal(${o.id})">
      <div class="tr-rank ${rk[i]}">${i+1}</div>
      <div class="tr-info">
        <div class="tr-name">${o.title}</div>
        <div class="tr-earn">${o.earnings}</div>
      </div>
      <span style="font-size:.72rem;color:var(--gold)">★${o.rating}</span>
    </div>`).join('');
}

function renderCatStats() {
  const c = document.getElementById('catStats'); if (!c) return;
  const counts = {};
  S.allOpps.forEach(o => { counts[o.category] = (counts[o.category]||0)+1; });
  const max = Math.max(...Object.values(counts), 1);
  c.innerHTML = CATS.slice(0,8).map(cat => `
    <div class="cat-row" onclick="filterByCat('${cat.id}')">
      <span class="cat-ic">${cat.icon}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between">
          <span class="cat-nm">${cat['name_'+S.lang]||cat.name_en}</span>
          <span class="cat-cnt">${counts[cat.id]||0}</span>
        </div>
        <div class="cat-bar-wrap"><div class="cat-bar" style="width:${((counts[cat.id]||0)/max*100)}%"></div></div>
      </div>
    </div>`).join('');
}

function renderSources() {
  const l = document.getElementById('sourcesList'); if (!l) return;
  l.innerHTML = SOURCES.slice(0,8).map(s => `
    <div class="src-item">
      <div class="src-dot ${s.status}"></div>
      <span class="src-nm">${s.name}</span>
      <span class="src-cnt">${s.count}</span>
    </div>`).join('');
}

function renderMostSearched() {
  const el = document.getElementById('msTags'); if (!el) return;
  el.innerHTML = MS_TAGS.map(t => `<span class="ms-tag" onclick="quickSearch('${t}')">${t}</span>`).join('');
}

function renderTicker() {
  const inner = document.getElementById('tickerInner'); if (!inner) return;
  const items = S.allOpps.slice(0,8);
  const html = items.map(o => `<span class="ticker-item"><span class="tick-cat">${catIcon(o.category)}</span> ${o.title} — ${o.earnings}</span>`).join('');
  inner.innerHTML = html + html;
}

function renderOppOfDay() {
  const opp = [...S.allOpps].sort((a,b)=>(b.views||0)-(a.views||0))[0];
  if (!opp) return;
  document.getElementById('oodTitle').textContent = opp.emoji + ' ' + opp.title;
  document.getElementById('oodEarn').textContent = '💰 ' + opp.earnings;
  document.getElementById('oppOfDay').onclick = () => openModal(opp.id);
  document.querySelector('.oood-label').textContent = T('oppOfDay');
}

// ══════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════
function openModal(id) {
  const opp = S.allOpps.find(o => o.id === id); if (!opp) return;
  const isSaved = S.saved.includes(id);
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-thumb">${opp.emoji}</div>
    <div class="modal-body">
      <div class="modal-cat">${catIcon(opp.category)} ${catName(opp.category)}</div>
      <h2 class="modal-title">${opp.title}</h2>
      <p class="modal-desc">${opp.fullDescription || opp.description}</p>
      <div class="modal-grid">
        <div class="md"><div class="md-l">${T('earnings')}</div><div class="md-v green">${opp.earnings}</div></div>
        <div class="md"><div class="md-l">${T('trust')}</div><div class="md-v goldv">${opp.trustScore}/10</div></div>
        <div class="md"><div class="md-l">${T('rating')}</div><div class="md-v">★${opp.rating} (${(opp.reviews||0).toLocaleString()})</div></div>
        <div class="md"><div class="md-l">${T('countries')}</div><div class="md-v">${opp.country}</div></div>
        <div class="md"><div class="md-l">${T('devices')}</div><div class="md-v">${devLabel(opp.devices)}</div></div>
        <div class="md"><div class="md-l">${T('payment')}</div><div class="md-v">${(opp.payment||[]).map(payLabel).join(', ')}</div></div>
        <div class="md"><div class="md-l">${T('minWithdraw')}</div><div class="md-v orange">${opp.minWithdraw}</div></div>
        <div class="md"><div class="md-l">${T('time')}</div><div class="md-v">${opp.timeRequired}</div></div>
        <div class="md"><div class="md-l">${T('difficulty')}</div><div class="md-v">${opp.difficulty}</div></div>
        <div class="md"><div class="md-l">${T('free')}</div><div class="md-v green">${opp.isFree?(S.lang==='ar'?'نعم، مجانية':'Yes, Free'):(S.lang==='ar'?'مدفوعة':'Paid')
