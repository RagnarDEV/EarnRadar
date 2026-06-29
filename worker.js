// ================================================================
//  EarnRadar — Cloudflare Worker v3.0
//  Fix: No nested template literals — HTML uses string concat
//  Client JS served at /app.js as separate route
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

    // API Routes
    if (path === '/api/opportunities') return handleOpps(env, cors);
    if (path === '/api/stats')         return handleStats(env, cors);
    if (path === '/api/refresh') {
      ctx.waitUntil(fetchSources(env));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    if (path === '/api/rate' && request.method === 'POST') {
      return handleRate(request, env, cors);
    }

    // PWA
    if (path === '/manifest.json') {
      return new Response(JSON.stringify({
        name: 'EarnRadar', short_name: 'EarnRadar',
        start_url: '/', display: 'standalone',
        background_color: '#0A0E1A', theme_color: '#00D4AA',
        icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }]
      }), { headers: { 'Content-Type': 'application/manifest+json' } });
    }

    // Service Worker
    if (path === '/sw.js') {
      return new Response(getSW(), {
        headers: { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' }
      });
    }

    // Client JS — served separately to avoid nested template literal issues
    if (path === '/app.js') {
      return new Response(getAppJS(), {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // HTML Page
    return new Response(getHTML(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchSources(env));
  }
};

// ================================================================
//  API HANDLERS
// ================================================================
async function handleOpps(env, cors) {
  try {
    if (env.EARN_KV) {
      const c = await env.EARN_KV.get('opportunities');
      if (c) return new Response(c, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  } catch(e) {}
  return new Response('[]', { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleStats(env, cors) {
  let s = { total: 143, today: 12, sources: 12, categories: 14, lastUpdate: new Date().toISOString() };
  try {
    if (env.EARN_KV) {
      const d = await env.EARN_KV.get('stats');
      if (d) s = JSON.parse(d);
    }
  } catch(e) {}
  return new Response(JSON.stringify(s), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleRate(request, env, cors) {
  try {
    const { id, rating } = await request.json();
    if (env.EARN_KV) {
      const key = 'rating_' + id;
      const ex = await env.EARN_KV.get(key);
      const data = ex ? JSON.parse(ex) : { total: 0, count: 0 };
      data.total += rating; data.count += 1;
      await env.EARN_KV.put(key, JSON.stringify(data));
      return new Response(JSON.stringify({ avg: (data.total / data.count).toFixed(1) }), { headers: cors });
    }
  } catch(e) {}
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}

// ================================================================
//  LIVE DATA FETCHING (Cron every hour)
// ================================================================
async function fetchSources(env) {
  if (!env.EARN_KV) return;
  const results = [];
  try { results.push(...await fetchHN()); } catch(e) {}
  try { results.push(...await fetchReddit()); } catch(e) {}
  try { results.push(...await fetchRemoteOK()); } catch(e) {}
  try { results.push(...await fetchPH()); } catch(e) {}

  const seen = new Set();
  const unique = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

  if (unique.length > 0) {
    await env.EARN_KV.put('opportunities', JSON.stringify(unique), { expirationTtl: 7200 });
    await env.EARN_KV.put('stats', JSON.stringify({
      total: unique.length,
      today: unique.filter(u => new Date(u.publishedAt) > Date.now() - 86400000).length,
      sources: 12, categories: 14, lastUpdate: new Date().toISOString()
    }));
  }
}

async function fetchHN() {
  const kw = ['earn','money','income','freelance','remote','passive','side hustle','grant','bounty','startup'];
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json();
  const stories = await Promise.allSettled(
    ids.slice(0, 30).map(id => fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json').then(r => r.json()))
  );
  return stories.filter(s => s.status === 'fulfilled' && s.value && s.value.url)
    .map(s => s.value)
    .filter(s => kw.some(k => (s.title || '').toLowerCase().includes(k)))
    .map(s => ({
      id: 'hn_' + s.id, title: s.title,
      description: 'From Hacker News — ' + s.score + ' points',
      fullDescription: s.title + '\n\nDiscussed on Hacker News with ' + s.score + ' points.',
      category: guessCategory(s.title), status: s.score > 200 ? 'trending' : 'new', emoji: '💡',
      earnings: 'Variable', earningLevel: 'medium', trustScore: 7.5,
      rating: Math.min(5, 3 + s.score / 500), reviews: s.descendants || 0,
      country: 'Worldwide', devices: 'both', payment: ['paypal','bank'],
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
      const res = await fetch('https://www.reddit.com/r/' + sub.name + '/hot.json?limit=6', {
        headers: { 'User-Agent': 'EarnRadar/3.0' }
      });
      const data = await res.json();
      const posts = (data.data && data.data.children ? data.data.children : []).filter(p => p.data.score > 30);
      posts.forEach(p => {
        results.push({
          id: 'reddit_' + p.data.id, title: p.data.title,
          description: (p.data.selftext || p.data.title).substring(0, 200),
          fullDescription: p.data.selftext || p.data.title,
          category: sub.cat, status: p.data.score > 300 ? 'trending' : 'new', emoji: '🌐',
          earnings: 'Variable', earningLevel: 'medium', trustScore: 7.0,
          rating: Math.min(5, 3.5 + p.data.upvote_ratio), reviews: p.data.num_comments,
          country: 'Worldwide', devices: 'both', payment: ['paypal'],
          minWithdraw: 'Varies', isFree: true, difficulty: 'Medium', timeRequired: 'Varies',
          url: 'https://reddit.com' + p.data.permalink,
          tags: [sub.name, 'reddit'], source: 'reddit',
          publishedAt: new Date(p.data.created_utc * 1000).toISOString(), views: p.data.score
        });
      });
    } catch(e) {}
  }
  return results;
}

async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', { headers: { 'User-Agent': 'EarnRadar/3.0' } });
  const jobs = await res.json();
  return jobs.slice(1, 12).filter(j => j.position).map(j => ({
    id: 'rok_' + j.id, title: j.position + ' @ ' + j.company,
    description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
    fullDescription: (j.description || '').replace(/<[^>]+>/g, ''),
    category: 'remote', status: 'new', emoji: '💻',
    earnings: j.salary_min ? '$' + j.salary_min.toLocaleString() + '+/yr' : 'Competitive',
    earningLevel: j.salary_min > 100000 ? 'high' : 'medium',
    trustScore: 8.5, rating: 4.2, reviews: 0, country: 'Worldwide (Remote)',
    devices: 'desktop', payment: ['bank'], minWithdraw: 'Monthly',
    isFree: true, difficulty: 'Medium', timeRequired: 'Full-time',
    url: j.url, tags: (j.tags || []).slice(0, 4), source: 'remoteok',
    publishedAt: j.date || new Date().toISOString(), views: 0
  }));
}

async function fetchPH() {
  const res = await fetch('https://www.producthunt.com/feed', { headers: { 'User-Agent': 'EarnRadar/3.0' } });
  const text = await res.text();
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(text)) !== null && items.length < 6) {
    const item = match[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(item) || [])[1] || '';
    const link  = (/<link>(.*?)<\/link>/.exec(item) || [])[1] || '';
    const desc  = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(item) || [])[1];
    const clean = desc ? desc.replace(/<[^>]+>/g, '').substring(0, 200) : title;
    const pub   = (/<pubDate>(.*?)<\/pubDate>/.exec(item) || [])[1] || '';
    if (title && link) {
      items.push({
        id: 'ph_' + Math.random().toString(36).substr(2, 8), title,
        description: clean, fullDescription: clean,
        category: 'ai', status: 'new', emoji: '🚀',
        earnings: 'Variable', earningLevel: 'medium', trustScore: 7.8,
        rating: 4.0, reviews: 0, country: 'Worldwide',
        devices: 'both', payment: ['paypal','bank'], minWithdraw: 'Varies',
        isFree: true, difficulty: 'Medium', timeRequired: 'Varies',
        url: link, tags: ['product-hunt', 'startup', 'ai'], source: 'producthunt',
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(), views: 0
      });
    }
  }
  return items;
}

function guessCategory(t) {
  t = (t || '').toLowerCase();
  if (/ai|gpt|llm|machine learning/.test(t)) return 'ai';
  if (/freelance|upwork|fiverr/.test(t)) return 'freelance';
  if (/remote|job|hire/.test(t)) return 'remote';
  if (/crypto|bitcoin|ethereum/.test(t)) return 'crypto';
  if (/survey|feedback/.test(t)) return 'surveys';
  if (/grant|funding/.test(t)) return 'grants';
  if (/affiliate|referral/.test(t)) return 'affiliate';
  return 'other';
}

function extractTags(title) {
  const stop = ['the','a','an','and','or','for','to','in','of','is','are','how','why','what'];
  return (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')
    .filter(w => w.length > 3 && !stop.includes(w)).slice(0, 5);
}

// ================================================================
//  SERVICE WORKER
// ================================================================
function getSW() {
  return "const CACHE='earnradar-v3';\n" +
    "self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.add('/')));self.skipWaiting();});\n" +
    "self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});\n" +
    "self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(fetch(e.request).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return res;}).catch(()=>caches.match(e.request)));});\n";
}

// ================================================================
//  HTML — uses string concatenation ONLY (no template literals)
//  This avoids ALL nested backtick issues
// ================================================================
function getHTML() {
  const cats = getCategories();

  const chipHTML = cats.map(function(c) {
    return '<button class="chip" data-cat="' + c.id + '">' + c.icon + ' <span class="cn" data-id="' + c.id + '">' + c.en + '</span></button>';
  }).join('');

  const css = getCSS();

  return '<!DOCTYPE html>\n' +
'<html lang="en" dir="ltr">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">\n' +
'<meta name="description" content="Smart platform to discover online earning opportunities - auto-updated">\n' +
'<meta property="og:title" content="EarnRadar">\n' +
'<meta name="theme-color" content="#00D4AA">\n' +
'<title>EarnRadar — Smart Earning Opportunities</title>\n' +
'<link rel="manifest" href="/manifest.json">\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">\n' +
'<style>' + css + '</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="offlineBanner" class="offline-banner"></div>\n' +

'<div id="mobileMenu" class="mobile-menu">\n' +
'  <div class="mm-head"><div class="logo"><b style="color:#00D4AA">&#9711;</b> EarnRadar</div><button id="menuClose" class="mm-close">&#10005;</button></div>\n' +
'  <a href="#" id="mm-home">&#127968; <span class="i18n" data-k="navHome">Home</span></a>\n' +
'  <a href="#categories" id="mm-cats">&#128194; <span class="i18n" data-k="navCats">Categories</span></a>\n' +
'  <a href="#trending" id="mm-trend">&#128293; <span class="i18n" data-k="navTrending">Trending</span></a>\n' +
'  <a href="#" id="mm-saved">&#128278; <span class="i18n" data-k="navSaved">Saved</span></a>\n' +
'</div>\n' +

'<header class="hdr">\n' +
'  <div class="container">\n' +
'    <div class="hdr-inner">\n' +
'      <a href="/" class="logo" id="logoBtn">&#9711; EarnRadar <span class="badge">LIVE</span></a>\n' +
'      <nav class="nav">\n' +
'        <a href="#" class="nl active" id="nav-home"><span class="i18n" data-k="navHome">Home</span></a>\n' +
'        <a href="#categories" class="nl"><span class="i18n" data-k="navCats">Categories</span></a>\n' +
'        <a href="#trending" class="nl"><span class="i18n" data-k="navTrending">Trending</span></a>\n' +
'        <a href="#" class="nl" id="nav-saved"><span class="i18n" data-k="navSaved">Saved</span></a>\n' +
'      </nav>\n' +
'      <div class="hdr-right">\n' +
'        <button class="hbtn" id="searchToggle">&#128269;</button>\n' +
'        <button class="hbtn" id="themeBtn">&#9728;&#65039;</button>\n' +
'        <select id="langSel" class="lang-sel">\n' +
'          <option value="en">&#127482;&#127480; EN</option>\n' +
'          <option value="ar">&#127462;&#127479; AR</option>\n' +
'          <option value="fr">&#127467;&#127479; FR</option>\n' +
'          <option value="tr">&#127481;&#127479; TR</option>\n' +
'          <option value="es">&#127466;&#127480; ES</option>\n' +
'        </select>\n' +
'        <button id="installBtn" class="install-btn" style="display:none">&#128241;</button>\n' +
'        <button id="burgerBtn" class="burger"><span></span><span></span><span></span></button>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div id="searchBar" class="search-bar" style="display:none">\n' +
'    <div class="container">\n' +
'      <div class="search-wrap">&#128269; <input id="searchInput" type="text" placeholder="Search..." autocomplete="off"> <button id="searchClose">&#10005;</button></div>\n' +
'      <div id="searchResults" class="search-results"></div>\n' +
'    </div>\n' +
'  </div>\n' +
'</header>\n' +

'<div id="homeView">\n' +
'  <div class="container">\n' +
'    <div id="oppOfDay" class="ood" style="cursor:pointer">\n' +
'      <div class="ood-lbl i18n" data-k="oppOfDay">&#9889; OPPORTUNITY OF THE DAY</div>\n' +
'      <div id="oodTitle" class="ood-title">Loading...</div>\n' +
'      <div id="oodEarn" class="ood-earn"></div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="ticker-wrap"><div class="ticker-lbl">&#128308; LIVE</div><div class="ticker-track"><div id="ticker" class="ticker"></div></div></div>\n' +
'  <div class="filters-bar">\n' +
'    <div class="container">\n' +
'      <div class="filters-inner">\n' +
'        <div class="chips" id="chips"><button class="chip active" data-cat="all"><span class="i18n" data-k="catAll">All</span></button>' + chipHTML + '</div>\n' +
'        <div class="fsel-wrap">\n' +
'          <select class="fsel" id="sortSel"><option value="newest" class="i18n" data-k="sortNewest">Newest</option><option value="trending">Trending</option><option value="rated">Top Rated</option><option value="earning">Top Earning</option></select>\n' +
'          <select class="fsel" id="devSel"><option value="all">All Devices</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option><option value="both">Both</option></select>\n' +
'          <select class="fsel" id="paySel"><option value="all">Payment</option><option value="paypal">PayPal</option><option value="bank">Bank</option><option value="crypto">Crypto</option><option value="gift">Gift Cards</option></select>\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <main class="main">\n' +
'    <div class="container">\n' +
'      <div class="layout">\n' +
'        <div>\n' +
'          <section class="section">\n' +
'            <div class="sec-hdr"><h2 class="sec-title"><span class="badge-new">NEW</span> <span class="i18n" data-k="newToday">New Today</span></h2><button id="refreshBtn" class="refresh-btn">&#8635; <span class="i18n" data-k="refresh">Refresh</span></button></div>\n' +
'            <div class="grid" id="newGrid"></div>\n' +
'          </section>\n' +
'          <section class="section" id="trending">\n' +
'            <div class="sec-hdr"><h2 class="sec-title"><span class="i18n" data-k="trending">Trending</span></h2><a href="#all-opps" class="see-all">View All &#8594;</a></div>\n' +
'            <div class="grid" id="trendGrid"></div>\n' +
'          </section>\n' +
'          <section class="section" id="all-opps">\n' +
'            <div class="sec-hdr"><h2 class="sec-title i18n" data-k="allOpps">All Opportunities</h2><span id="resultCount" class="result-count">0</span></div>\n' +
'            <div class="grid" id="mainGrid"></div>\n' +
'            <div style="text-align:center;margin-top:18px"><button id="loadMoreBtn" class="load-more i18n" data-k="loadMore">Load More</button></div>\n' +
'          </section>\n' +
'        </div>\n' +
'        <aside class="sidebar">\n' +
'          <div class="sb-card"><h3 class="sb-title i18n" data-k="topRated">&#11088; Top Rated</h3><div id="topRatedList"></div></div>\n' +
'          <div class="sb-card calc-card">\n' +
'            <div class="sb-title i18n" data-k="calculator">&#128176; Income Calculator</div>\n' +
'            <div class="calc-row"><label class="calc-lbl i18n" data-k="calcHours">Hours/day</label><input type="range" id="calcH" min="1" max="12" value="4" oninput="updateCalc()"><div class="calc-val"><span id="calcHv">4</span>h</div></div>\n' +
'            <div class="calc-row"><label class="calc-lbl i18n" data-k="calcDays">Days/week</label><input type="range" id="calcD" min="1" max="7" value="5" oninput="updateCalc()"><div class="calc-val"><span id="calcDv">5</span>d</div></div>\n' +
'            <div class="calc-row"><label class="calc-lbl i18n" data-k="calcSkill">Skill level</label><select id="calcS" onchange="updateCalc()" class="fsel" style="width:100%"><option value="1">Beginner</option><option value="2.5" selected>Intermediate</option><option value="6">Expert</option></select></div>\n' +
'            <div class="calc-result"><div class="calc-res-lbl i18n" data-k="calcResult">Monthly estimate</div><div id="calcNum" class="calc-num">$0</div></div>\n' +
'          </div>\n' +
'          <div class="sb-card" id="categories"><h3 class="sb-title i18n" data-k="categories">&#128194; Categories</h3><div id="catStats"></div></div>\n' +
'          <div class="sb-card"><h3 class="sb-title i18n" data-k="mostSearched">&#128269; Most Searched</h3><div id="msTags" class="ms-tags"></div></div>\n' +
'          <div class="sb-card"><h3 class="sb-title i18n" data-k="sources">&#128225; Active Sources</h3><div id="sourcesList"></div></div>\n' +
'        </aside>\n' +
'      </div>\n' +
'    </div>\n' +
'  </main>\n' +
'</div>\n' +

'<div id="savedView" style="display:none;padding:32px 0 60px">\n' +
'  <div class="container">\n' +
'    <h2 style="margin-bottom:20px;font-size:1.2rem" class="i18n" data-k="savedPage">Saved</h2>\n' +
'    <div class="grid" id="savedGrid"></div>\n' +
'    <div id="noSaved" style="display:none;text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:3rem">&#128278;</div><div class="i18n" data-k="noSaved">No saved opportunities yet</div></div>\n' +
'  </div>\n' +
'</div>\n' +

'<div id="modalOverlay" class="modal-overlay"><div id="oppModal" class="modal"><button id="modalClose" class="modal-close">&#10005;</button><div id="modalContent"></div></div></div>\n' +
'<div id="compareModal" class="compare-modal"><div class="compare-box"><button id="compareClose" class="compare-close">&#10005;</button><h2 style="font-size:1rem;font-weight:700" class="i18n" data-k="compare">&#9878;&#65039; Compare</h2><div id="compareGrid" class="compare-grid"></div></div></div>\n' +
'<div id="shareModal" class="share-modal"><div class="share-box"><div class="share-title i18n" data-k="share">&#128228; Share</div><div id="shareBtns"></div><button id="shareCancel" class="share-cancel">&#10005;</button></div></div>\n' +
'<div id="toast" class="toast"></div>\n' +

'<footer class="footer">\n' +
'  <div class="container">\n' +
'    <div class="footer-grid">\n' +
'      <div><div class="logo">&#9711; EarnRadar</div><p class="i18n" data-k="footerDesc" style="color:var(--txt2);font-size:.8rem;margin:10px 0 14px;line-height:1.7">Smart platform for online earning opportunities.</p><div style="display:flex;gap:8px"><a class="fsoc" href="#">&#120143;</a><a class="fsoc" href="#">&#9992;</a></div></div>\n' +
'      <div><h4 class="i18n" data-k="footerNav" style="font-size:.82rem;font-weight:700;margin-bottom:10px">Navigation</h4><ul style="list-style:none;display:flex;flex-direction:column;gap:6px"><li><a href="#" class="flink i18n" data-k="navHome">Home</a></li><li><a href="#categories" class="flink i18n" data-k="navCats">Categories</a></li><li><a href="#trending" class="flink i18n" data-k="navTrending">Trending</a></li></ul></div>\n' +
'      <div><h4 class="i18n" data-k="footerLegal" style="font-size:.82rem;font-weight:700;margin-bottom:10px">Legal</h4><ul style="list-style:none;display:flex;flex-direction:column;gap:6px"><li><a href="#" class="flink i18n" data-k="footerPrivacy">Privacy Policy</a></li><li><a href="#" class="flink i18n" data-k="footerTerms">Terms</a></li></ul></div>\n' +
'    </div>\n' +
'    <div style="border-top:1px solid var(--bdr);padding-top:18px;margin-top:28px;text-align:center">\n' +
'      <p style="font-size:.73rem;color:var(--muted)">&#169; 2025 EarnRadar. Auto-updated every hour.</p>\n' +
'      <p class="i18n" data-k="footerDisclaimer" style="font-size:.72rem;color:var(--ember);opacity:.8;margin-top:5px">&#9888;&#65039; Content is for informational purposes only.</p>\n' +
'    </div>\n' +
'  </div>\n' +
'</footer>\n' +
'<script src="/app.js"></script>\n' +
'</body></html>';
}

// ================================================================
//  CSS
// ================================================================
function getCSS() {
  return ':root{--bg:#0A0E1A;--bg2:#111827;--card:#1A2035;--card2:#1E2640;--accent:#00D4AA;--aglow:rgba(0,212,170,.15);--adark:#00A882;--ember:#FF6B35;--gold:#FFB800;--txt:#F0F4FF;--txt2:#8B9CC8;--muted:#4A5578;--bdr:rgba(255,255,255,.07);--bdra:rgba(0,212,170,.3);--r:14px;--rs:8px;--sh:0 4px 24px rgba(0,0,0,.4);--shg:0 0 30px rgba(0,212,170,.1);--far:\'Cairo\',sans-serif;--fen:\'Space Grotesk\',sans-serif;--tr:.2s cubic-bezier(.4,0,.2,1)}' +
'[data-theme=light]{--bg:#F0F4FF;--bg2:#E8EDF8;--card:#fff;--card2:#F5F8FF;--txt:#0A0E1A;--txt2:#3D4A6B;--muted:#8B9CC8;--bdr:rgba(0,0,0,.08);--sh:0 4px 24px rgba(0,0,0,.08)}' +
'*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}' +
'body{font-family:var(--far);background:var(--bg);color:var(--txt);line-height:1.6;overflow-x:hidden;transition:background .3s,color .3s}' +
'[lang=en] body,[lang=fr] body,[lang=tr] body,[lang=es] body{font-family:var(--fen)}' +
'.container{max-width:1280px;margin:0 auto;padding:0 16px}' +
'.offline-banner{display:none;background:var(--ember);color:#fff;text-align:center;padding:8px;font-size:.85rem;position:fixed;top:0;left:0;right:0;z-index:9999}.offline-banner.show{display:block}' +
'.hdr{position:sticky;top:0;z-index:100;background:rgba(10,14,26,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr)}' +
'[data-theme=light] .hdr{background:rgba(240,244,255,.95)}' +
'.hdr-inner{display:flex;align-items:center;gap:10px;padding:11px 0;min-height:56px}' +
'.logo{font-family:var(--fen);font-weight:700;font-size:1rem;color:var(--txt);text-decoration:none;flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:5px}' +
'.logo b{color:var(--accent);animation:spin-pulse 4s linear infinite;font-size:1.2rem}' +
'@keyframes spin-pulse{0%,100%{opacity:1}50%{opacity:.6}}' +
'.badge{font-size:.55rem;background:var(--ember);color:#fff;padding:2px 5px;border-radius:4px;animation:blink 1.5s infinite}' +
'@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}' +
'.nav{display:none;gap:2px}@media(min-width:900px){.nav{display:flex}}' +
'.nl{color:var(--txt2);text-decoration:none;font-size:.85rem;padding:5px 10px;border-radius:var(--rs);transition:var(--tr)}' +
'.nl:hover,.nl.active{color:var(--accent);background:var(--aglow)}' +
'.hdr-right{display:flex;align-items:center;gap:6px;margin-left:auto}[dir=rtl] .hdr-right{margin-left:unset;margin-right:auto}' +
'.hbtn{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);width:36px;height:36px;border-radius:var(--rs);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;transition:var(--tr)}.hbtn:hover{color:var(--accent);border-color:var(--bdra)}' +
'.lang-sel{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:6px 6px;border-radius:var(--rs);cursor:pointer;font-size:.78rem;outline:none;max-width:78px}' +
'.install-btn{background:var(--accent);color:#0A0E1A;border:none;padding:6px 10px;border-radius:var(--rs);cursor:pointer;font-size:.85rem;font-weight:700}' +
'.burger{display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);cursor:pointer}' +
'@media(min-width:900px){.burger{display:none}}.burger span{width:18px;height:2px;background:var(--txt2);display:block}' +
'.mobile-menu{display:none;flex-direction:column;position:fixed;inset:0;background:var(--bg2);z-index:500;padding:20px;gap:10px;overflow-y:auto}' +
'.mobile-menu.open{display:flex}.mm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}' +
'.mm-close{background:none;border:none;color:var(--txt);font-size:1.5rem;cursor:pointer}' +
'.mobile-menu a{color:var(--txt);text-decoration:none;font-size:1.05rem;padding:13px 15px;background:var(--card);border-radius:var(--r);border:1px solid var(--bdr);transition:var(--tr);display:block}' +
'.mobile-menu a:hover{border-color:var(--bdra);color:var(--accent)}' +
'.search-bar{padding:10px 0;border-top:1px solid var(--bdr);background:var(--bg2)}' +
'.search-wrap{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bdra);border-radius:var(--r);padding:10px 14px;color:var(--muted)}' +
'.search-wrap input{flex:1;background:none;border:none;color:var(--txt);font-size:1rem;outline:none;min-width:0;font-family:inherit}' +
'.search-wrap input::placeholder{color:var(--muted)}' +
'.search-wrap button{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem}' +
'.search-results{margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:55vh;overflow-y:auto}' +
'.ood{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra);border-radius:var(--r);padding:18px 20px;margin:18px 0;position:relative;overflow:hidden}' +
'.ood::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember))}' +
'.ood-lbl{font-size:.68rem;font-weight:800;letter-spacing:.1em;color:var(--accent);margin-bottom:6px}' +
'.ood-title{font-size:1.05rem;font-weight:700;margin-bottom:4px}.ood-earn{color:var(--accent);font-size:.88rem;font-weight:600}' +
'.ticker-wrap{display:flex;align-items:center;background:var(--bg2);border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);overflow:hidden;height:36px}' +
'.ticker-lbl{background:var(--ember);color:#fff;font-size:.68rem;font-weight:700;padding:0 10px;height:100%;display:flex;align-items:center;flex-shrink:0;gap:4px;white-space:nowrap}' +
'.ticker-track{overflow:hidden;flex:1}.ticker{display:flex;gap:40px;animation:ticker 35s linear infinite;white-space:nowrap;font-size:.78rem;color:var(--txt2)}' +
'.ticker:hover{animation-play-state:paused}@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}' +
'.ticker-item{display:inline-flex;align-items:center;gap:6px}.tc{color:var(--accent)}' +
'.filters-bar{background:rgba(10,14,26,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr);padding:9px 0;position:sticky;top:56px;z-index:90}' +
'[data-theme=light] .filters-bar{background:rgba(240,244,255,.97)}' +
'.filters-inner{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.filters-inner::-webkit-scrollbar{display:none}' +
'.chips{display:flex;gap:5px;flex-shrink:0}' +
'.chip{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 11px;border-radius:100px;font-size:.76rem;cursor:pointer;white-space:nowrap;transition:var(--tr);font-family:inherit}' +
'.chip:hover,.chip.active{background:var(--accent);color:#0A0E1A;font-weight:700;border-color:var(--accent)}' +
'.fsel-wrap{display:none;gap:5px;margin-left:auto;flex-shrink:0}[dir=rtl] .fsel-wrap{margin-left:unset;margin-right:auto}@media(min-width:768px){.fsel-wrap{display:flex}}' +
'.fsel{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 8px;border-radius:var(--rs);font-size:.76rem;cursor:pointer;outline:none;font-family:inherit}.fsel:hover{border-color:var(--bdra)}' +
'.main{padding:26px 0 60px}.layout{display:grid;grid-template-columns:1fr;gap:20px}@media(min-width:1024px){.layout{grid-template-columns:1fr 285px}}' +
'.section{margin-bottom:30px}.sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;gap:8px;flex-wrap:wrap}' +
'.sec-title{font-size:1.05rem;font-weight:700;display:flex;align-items:center;gap:8px}' +
'.badge-new{background:var(--accent);color:#0A0E1A;font-size:.6rem;padding:2px 7px;border-radius:4px;font-weight:800}' +
'.see-all{color:var(--accent);text-decoration:none;font-size:.82rem}.result-count{font-size:.78rem;color:var(--muted);background:var(--card);padding:3px 9px;border-radius:100px;border:1px solid var(--bdr)}' +
'.refresh-btn{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 11px;border-radius:var(--rs);cursor:pointer;font-size:.76rem;display:flex;align-items:center;gap:5px;transition:var(--tr);font-family:inherit}.refresh-btn:hover{color:var(--accent);border-color:var(--bdra)}' +
'.grid{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:480px){.grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:1280px){.grid{grid-template-columns:repeat(3,1fr)}}' +
'.card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:var(--tr);position:relative;display:flex;flex-direction:column}' +
'.card:hover{transform:translateY(-3px);border-color:var(--bdra);box-shadow:var(--sh),var(--shg)}' +
'.card::after{content:"";position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember));transform:scaleX(0);transform-origin:right;transition:transform .3s}' +
'.card:hover::after{transform:scaleX(1);transform-origin:left}' +
'.card-thumb{width:100%;height:110px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:2.5rem;position:relative}' +
'.card-st{position:absolute;top:8px;right:8px;font-size:.6rem;padding:2px 7px;border-radius:4px;font-weight:800}[dir=rtl] .card-st{right:unset;left:8px}' +
'.s-new{background:var(--aglow);color:var(--accent);border:1px solid var(--bdra)}.s-trending{background:rgba(255,107,53,.15);color:var(--ember);border:1px solid rgba(255,107,53,.3)}.s-recommended{background:rgba(255,184,0,.1);color:var(--gold);border:1px solid rgba(255,184,0,.3)}' +
'.card-body{padding:12px;flex:1;display:flex;flex-direction:column;gap:7px}' +
'.card-title{font-size:.88rem;font-weight:600;color:var(--txt);line-height:1.4}' +
'.card-desc{font-size:.76rem;color:var(--txt2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}' +
'.card-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:auto}' +
'.meta{font-size:.68rem;color:var(--muted);background:var(--bg2);padding:2px 6px;border-radius:4px}.meta.earn{color:var(--accent)}.meta.trust{color:var(--gold)}' +
'.stars{display:flex;gap:2px;padding:4px 12px 6px;align-items:center;font-size:.72rem;color:var(--muted)}' +
'.stars span{font-size:.95rem;cursor:pointer;color:var(--bdr);transition:color .15s}' +
'.stars span.on,.stars span:hover{color:var(--gold)}' +
'.card-btns{display:flex;gap:4px;padding:0 12px 10px}' +
'.cbtn{flex:1;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:5px 3px;border-radius:var(--rs);cursor:pointer;font-size:.67rem;transition:var(--tr);font-family:inherit;text-align:center;white-space:nowrap}.cbtn:hover{border-color:var(--bdra);color:var(--accent)}' +
'.card-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--bdr);background:rgba(255,255,255,.015)}' +
'.card-cat{font-size:.66rem;color:var(--accent);font-weight:600}.card-stars{font-size:.7rem;color:var(--gold)}.card-time{font-size:.66rem;color:var(--muted)}' +
'.load-more{background:transparent;border:1px solid var(--bdr);color:var(--txt2);padding:10px 30px;border-radius:var(--r);cursor:pointer;font-size:.86rem;transition:var(--tr);font-family:inherit}.load-more:hover{border-color:var(--accent);color:var(--accent)}' +
'.skel{background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--rs)}@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}' +
'.skel-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden}.skel-img{height:110px}.skel-body{padding:12px;display:flex;flex-direction:column;gap:8px}.skel-line{height:12px;border-radius:4px}.w100{width:100%}.w75{width:75%}.w50{width:50%}' +
'.sidebar{display:flex;flex-direction:column;gap:13px}@media(min-width:1024px){.sidebar{position:sticky;top:108px}}' +
'.sb-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:15px}.sb-title{font-size:.88rem;font-weight:700;margin-bottom:12px}' +
'.tr-item{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr);cursor:pointer;transition:var(--tr)}.tr-item:last-child{border-bottom:none}.tr-item:hover .tr-name{color:var(--accent)}' +
'.tr-rank{width:22px;height:22px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0}.rk-g{background:var(--gold);color:#0A0E1A}.rk-s{background:#C0C0C0;color:#0A0E1A}.rk-b{background:#CD7F32;color:#0A0E1A}' +
'.tr-info{flex:1;min-width:0}.tr-name{font-size:.76rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:var(--tr)}.tr-earn{font-size:.68rem;color:var(--accent)}' +
'.cat-row{display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:7px}.cat-row:hover .cat-nm{color:var(--accent)}' +
'.cat-ic{font-size:.9rem;width:20px;text-align:center}.cat-nm{font-size:.76rem;flex:1;transition:var(--tr)}.cat-cnt{font-size:.68rem;background:var(--bg2);padding:2px 6px;border-radius:100px;color:var(--muted)}' +
'.cat-bar-wrap{height:2px;background:var(--bdr);border-radius:2px;margin-top:2px}.cat-bar{height:100%;background:var(--accent);border-radius:2px;transition:width .8s}' +
'.src-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)}.src-item:last-child{border-bottom:none}' +
'.src-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.src-dot.active{background:var(--accent)}.src-dot.error{background:var(--ember)}' +
'.src-nm{font-size:.76rem;flex:1}.src-cnt{font-size:.66rem;color:var(--muted)}' +
'.calc-card{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra)}.calc-row{margin-bottom:9px}.calc-lbl{font-size:.72rem;color:var(--txt2);margin-bottom:4px;display:block}' +
'.calc-val{text-align:center;font-size:.78rem;color:var(--accent);margin-top:3px}.calc-result{background:var(--bg);border:1px solid var(--bdra);border-radius:var(--rs);padding:10px;text-align:center;margin-top:10px}' +
'.calc-res-lbl{font-size:.68rem;color:var(--muted);margin-bottom:3px}.calc-num{font-size:1.4rem;font-weight:700;color:var(--accent)}' +
'.ms-tags{display:flex;flex-wrap:wrap;gap:5px}.ms-tag{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:3px 9px;border-radius:100px;font-size:.72rem;cursor:pointer;transition:var(--tr)}.ms-tag:hover{border-color:var(--bdra);color:var(--accent)}' +
'.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:200;display:none;align-items:flex-end;justify-content:center}@media(min-width:600px){.modal-overlay{align-items:center;padding:20px}}' +
'.modal-overlay.active{display:flex}' +
'.modal{background:var(--card);border:1px solid var(--bdra);border-radius:20px 20px 0 0;width:100%;max-width:680px;max-height:92vh;overflow-y:auto;position:relative;animation:modal-in .3s ease}@media(min-width:600px){.modal{border-radius:20px;max-height:85vh}}' +
'@keyframes modal-in{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}' +
'.modal-close{position:sticky;top:12px;right:12px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:.85rem;float:right;margin:12px 12px 0 0;display:flex;align-items:center;justify-content:center;z-index:10;transition:var(--tr)}[dir=rtl] .modal-close{float:left;margin:12px 0 0 12px}.modal-close:hover{background:var(--ember);color:#fff}' +
'.modal-thumb{width:100%;height:160px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:3.5rem;clear:both}' +
'.modal-body{padding:18px}.modal-cat{font-size:.68rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px}' +
'.modal-title{font-size:1.2rem;font-weight:700;margin-bottom:9px;line-height:1.3}.modal-desc{color:var(--txt2);font-size:.86rem;margin-bottom:18px;line-height:1.7}' +
'.modal-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:18px}@media(max-width:480px){.modal-grid{grid-template-columns:1fr}}' +
'.md{background:var(--bg2);border-radius:var(--rs);padding:9px}.md-l{font-size:.66rem;color:var(--muted);margin-bottom:3px}.md-v{font-size:.82rem;font-weight:600}.green{color:var(--accent)}.orange{color:var(--ember)}.goldv{color:var(--gold)}' +
'.modal-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:18px}.tag{background:var(--bg2);border:1px solid var(--bdr);color:var(--muted);padding:2px 8px;border-radius:4px;font-size:.7rem}' +
'.modal-actions{display:flex;gap:8px;flex-wrap:wrap}' +
'.btn-visit{flex:1;min-width:110px;background:var(--accent);color:#0A0E1A;padding:11px;border-radius:var(--r);text-decoration:none;text-align:center;font-weight:700;font-size:.88rem;transition:var(--tr)}.btn-visit:hover{background:var(--adark)}' +
'.btn-ma{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:11px 13px;border-radius:var(--r);cursor:pointer;font-size:.82rem;transition:var(--tr);font-family:inherit;white-space:nowrap}.btn-ma:hover{border-color:var(--bdra);color:var(--accent)}' +
'.compare-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:300;display:none;align-items:center;justify-content:center;padding:16px}.compare-modal.active{display:flex}' +
'.compare-box{background:var(--card);border:1px solid var(--bdra);border-radius:20px;width:100%;max-width:860px;max-height:90vh;overflow-y:auto;padding:20px;position:relative}' +
'.compare-close{position:absolute;top:14px;right:14px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
'.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}@media(max-width:600px){.compare-grid{grid-template-columns:1fr}}' +
'.compare-col h3{font-size:.92rem;font-weight:700;margin-bottom:10px;text-align:center;color:var(--accent)}' +
'.cmp-field{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bdr);font-size:.79rem}.cmp-field:last-child{border-bottom:none}.cmp-l{color:var(--muted)}.cmp-v{font-weight:600}' +
'.share-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:none;align-items:flex-end;justify-content:center}.share-modal.active{display:flex}@media(min-width:600px){.share-modal{align-items:center;padding:16px}}' +
'.share-box{background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:420px;padding:20px;border:1px solid var(--bdra)}@media(min-width:600px){.share-box{border-radius:20px}}' +
'.share-title{font-size:.95rem;font-weight:700;margin-bottom:13px;text-align:center}' +
'.share-btn{display:flex;align-items:center;gap:11px;padding:11px 14px;background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--rs);cursor:pointer;font-size:.87rem;color:var(--txt);transition:var(--tr);font-family:inherit;width:100%;margin-bottom:8px}.share-btn:hover{border-color:var(--bdra);color:var(--accent)}' +
'.share-cancel{background:none;border:1px solid var(--bdr);color:var(--txt2);padding:9px;border-radius:var(--rs);cursor:pointer;width:100%;margin-top:4px;font-size:.87rem;font-family:inherit;transition:var(--tr)}.share-cancel:hover{border-color:var(--bdra)}' +
'.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card);border:1px solid var(--bdra);color:var(--txt);padding:11px 18px;border-radius:var(--r);font-size:.83rem;box-shadow:var(--sh);z-index:999;opacity:0;transition:all .3s;max-width:90vw;text-align:center;white-space:nowrap;pointer-events:none}' +
'.toast.show{transform:translateX(-50%) translateY(0);opacity:1}' +
'.footer{background:var(--bg2);border-top:1px solid var(--bdr);padding:40px 0 20px}' +
'.footer-grid{display:grid;grid-template-columns:1fr;gap:26px;margin-bottom:26px}@media(min-width:600px){.footer-grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:900px){.footer-grid{grid-template-columns:2fr 1fr 1fr}}' +
'.fsoc{width:32px;height:32px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--txt2);font-size:.82rem;transition:var(--tr);margin-right:6px}.fsoc:hover{border-color:var(--bdra);color:var(--accent)}' +
'.flink{color:var(--txt2);text-decoration:none;font-size:.76rem;transition:var(--tr)}.flink:hover{color:var(--accent)}' +
'::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--card);border-radius:2px}';
}

// ================================================================
//  CATEGORIES
// ================================================================
function getCategories() {
  return [
    { id:'freelance', en:'Freelance',   ar:'\u0639\u0645\u0644 \u062d\u0631',       fr:'Freelance',    tr:'Serbest \u00c7al\u0131\u015fma', es:'Freelance',   icon:'\uD83C\uDFA8' },
    { id:'ai',        en:'AI Tools',    ar:'\u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064a', fr:'IA',        tr:'Yapay Zeka',  es:'IA',          icon:'\uD83E\uDD16' },
    { id:'surveys',   en:'Surveys',     ar:'\u0627\u0633\u062a\u0628\u064a\u0627\u0646\u0627\u062a',  fr:'Sondages',   tr:'Anketler',    es:'Encuestas',   icon:'\uD83D\uDCCB' },
    { id:'affiliate', en:'Affiliate',   ar:'\u0639\u0645\u0648\u0644\u0629',          fr:'Affiliation', tr:'Affiliate',   es:'Afiliados',   icon:'\uD83D\uDD17' },
    { id:'referral',  en:'Referrals',   ar:'\u0625\u062d\u0627\u0644\u0627\u062a',    fr:'Parrainage',  tr:'Y\u00f6nlendirme', es:'Referencias', icon:'\uD83D\uDC65' },
    { id:'cashback',  en:'Cashback',    ar:'\u0643\u0627\u0634 \u0628\u0627\u0643',   fr:'Cashback',    tr:'Geri \u00d6deme', es:'Cashback',    icon:'\uD83D\uDCB0' },
    { id:'apps',      en:'Apps',        ar:'\u062a\u0637\u0628\u064a\u0642\u0627\u062a', fr:'Apps',    tr:'Uygulamalar', es:'Apps',         icon:'\uD83D\uDCF1' },
    { id:'contests',  en:'Contests',    ar:'\u0645\u0633\u0627\u0628\u0642\u0627\u062a', fr:'Concours', tr:'Yar\u0131\u015fmalar', es:'Concursos', icon:'\uD83C\uDFC6' },
    { id:'remote',    en:'Remote Jobs', ar:'\u0639\u0645\u0644 \u0639\u0646 \u0628\u0639\u062f', fr:'T\u00e9l\u00e9travail', tr:'Uzaktan \u0130\u015f', es:'Trabajo Remoto', icon:'\uD83D\uDCBB' },
    { id:'crypto',    en:'Crypto',      ar:'\u0639\u0645\u0644\u0627\u062a \u0631\u0642\u0645\u064a\u0629', fr:'Crypto', tr:'Kripto', es:'Cripto',     icon:'\u20bf' },
    { id:'grants',    en:'Grants',      ar:'\u0645\u0646\u062d',                     fr:'Subventions', tr:'Hibeler',     es:'Becas',        icon:'\uD83C\uDF93' },
    { id:'testing',   en:'Testing',     ar:'\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a', fr:'Tests', tr:'Test',   es:'Pruebas',      icon:'\uD83E\uDDEA' },
    { id:'trading',   en:'Trading',     ar:'\u062a\u062f\u0627\u0648\u0644',          fr:'Trading',     tr:'Ticaret',     es:'Trading',      icon:'\uD83D\uDCC8' },
    { id:'other',     en:'Other',       ar:'\u0623\u062e\u0631\u0649',                fr:'Autre',       tr:'Di\u011fer',   es:'Otros',        icon:'\uD83D\uDCE6' }
  ];
}

// ================================================================
//  CLIENT JS — returned as plain string (NO template literals)
//  Data is injected via JSON.stringify at request time
// ================================================================
function getAppJS() {
  const opps  = JSON.stringify(getStaticOpps());
  const cats  = JSON.stringify(getCategories());
  const trans = JSON.stringify(getTranslations());
  const src   = JSON.stringify([
    {id:'reddit',name:'Reddit API',status:'active',count:134},
    {id:'hackernews',name:'Hacker News',status:'active',count:89},
    {id:'producthunt',name:'Product Hunt',status:'active',count:76},
    {id:'remoteok',name:'RemoteOK',status:'active',count:203},
    {id:'upwork',name:'Upwork Feed',status:'active',count:158},
    {id:'fiverr',name:'Fiverr Insights',status:'active',count:91},
    {id:'techcrunch',name:'TechCrunch RSS',status:'active',count:29},
    {id:'indiehackers',name:'Indie Hackers',status:'active',count:53},
    {id:'aitools',name:'AI Tools RSS',status:'active',count:67},
    {id:'github',name:'GitHub Trending',status:'active',count:45},
    {id:'surveys',name:'Survey Sites',status:'active',count:38},
    {id:'freelancer',name:'Freelancer RSS',status:'error',count:0}
  ]);
  const msTags = JSON.stringify(['freelance','passive income','remote work','AI tools','cashback','crypto','surveys','referrals','grants','side hustle','affiliate','testing']);

  return 'var OPPS=' + opps + ';\n' +
'var CATS=' + cats + ';\n' +
'var TR=' + trans + ';\n' +
'var SOURCES=' + src + ';\n' +
'var MS_TAGS=' + msTags + ';\n' +
'var S={lang:localStorage.getItem("lang")||"en",theme:localStorage.getItem("theme")||"dark",cat:"all",sort:"newest",device:"all",pay:"all",q:"",page:1,per:6,filtered:[],saved:JSON.parse(localStorage.getItem("savedOpps")||"[]"),opps:[...OPPS],cmpA:null,cmpB:null};\n' +
'var deferredInstall=null;\n' +
'document.addEventListener("DOMContentLoaded",function(){\n' +
'  applyTheme();applyLang();registerSW();\n' +
'  initFilter();renderAll();renderTicker();renderSidebar();\n' +
'  setupEvents();animateStats();loadLive();updateCalc();renderOOD();\n' +
'});\n' +
'function registerSW(){\n' +
'  if(!("serviceWorker" in navigator))return;\n' +
'  navigator.serviceWorker.register("/sw.js").catch(function(){});\n' +
'  window.addEventListener("online",function(){document.getElementById("offlineBanner").classList.remove("show");});\n' +
'  window.addEventListener("offline",function(){var b=document.getElementById("offlineBanner");b.textContent=T("offline");b.classList.add("show");});\n' +
'}\n' +
'window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();deferredInstall=e;document.getElementById("installBtn").style.display="flex";});\n' +
'document.getElementById("installBtn").addEventListener("click",function(){if(!deferredInstall)return;deferredInstall.prompt();deferredInstall.userChoice.then(function(){deferredInstall=null;document.getElementById("installBtn").style.display="none";});});\n' +
'async function loadLive(){\n' +
'  try{\n' +
'    var r=await fetch("/api/opportunities");\n' +
'    var live=await r.json();\n' +
'    if(Array.isArray(live)&&live.length>0){\n' +
'      var urls=new Set(S.opps.map(function(o){return o.url;}));\n' +
'      var newOnes=live.filter(function(o){return !urls.has(o.url);});\n' +
'      S.opps=newOnes.concat(S.opps);\n' +
'      initFilter();renderAll();\n' +
'      toast("Live data loaded");\n' +
'    }\n' +
'  }catch(e){}\n' +
'  try{\n' +
'    var rs=await fetch("/api/stats");\n' +
'    var stats=await rs.json();\n' +
'    if(stats.total){animN("statTotal",0,stats.total,1200);animN("statToday",0,stats.today||0,1000);}\n' +
'  }catch(e){}\n' +
'}\n' +
'function T(k){return(TR[S.lang]||TR.en)[k]||k;}\n' +
'function applyTheme(){\n' +
'  document.documentElement.setAttribute("data-theme",S.theme==="light"?"light":"");\n' +
'  document.getElementById("themeBtn").textContent=S.theme==="light"?"\uD83C\uDF19":"\u2600\uFE0F";\n' +
'}\n' +
'function applyLang(){\n' +
'  var rtl=S.lang==="ar";\n' +
'  document.documentElement.lang=S.lang;\n' +
'  document.documentElement.dir=rtl?"rtl":"ltr";\n' +
'  document.getElementById("langSel").value=S.lang;\n' +
'  document.querySelectorAll(".i18n[data-k]").forEach(function(el){\n' +
'    var k=el.getAttribute("data-k");\n' +
'    var t=T(k);\n' +
'    if(t)el.textContent=t;\n' +
'  });\n' +
'  CATS.forEach(function(c){\n' +
'    var el=document.querySelector(".cn[data-id="+JSON.stringify(c.id)+"]");\n' +
'    if(el)el.textContent=c[S.lang]||c.en;\n' +
'  });\n' +
'  var si=document.getElementById("searchInput");\n' +
'  if(si)si.placeholder=T("searchPlaceholder");\n' +
'  if(S.opps.length){renderAll();renderSidebar();}\n' +
'}\n' +
'function setView(v){\n' +
'  document.getElementById("homeView").style.display=v==="home"?"":"none";\n' +
'  document.getElementById("savedView").style.display=v==="saved"?"":"none";\n' +
'  if(v==="saved")renderSavedView();\n' +
'  window.scrollTo(0,0);\n' +
'}\n' +
'function initFilter(){\n' +
'  var d=S.opps.slice();\n' +
'  if(S.cat!=="all")d=d.filter(function(o){return o.category===S.cat;});\n' +
'  if(S.q){var q=S.q.toLowerCase();d=d.filter(function(o){return o.title.toLowerCase().includes(q)||(o.description||"").toLowerCase().includes(q)||(o.tags||[]).some(function(t){return t.toLowerCase().includes(q);});});}\n' +
'  if(S.device!=="all")d=d.filter(function(o){return o.devices===S.device||o.devices==="both";});\n' +
'  if(S.pay!=="all")d=d.filter(function(o){return(o.payment||[]).includes(S.pay);});\n' +
'  if(S.sort==="newest")d.sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);});\n' +
'  else if(S.sort==="trending")d.sort(function(a,b){return(b.views||0)-(a.views||0);});\n' +
'  else if(S.sort==="rated")d.sort(function(a,b){return(b.rating||0)-(a.rating||0);});\n' +
'  else if(S.sort==="earning")d.sort(function(a,b){return(b.earningLevel==="high"?3:b.earningLevel==="medium"?2:1)-(a.earningLevel==="high"?3:a.earningLevel==="medium"?2:1);});\n' +
'  S.filtered=d;\n' +
'  var el=document.getElementById("resultCount");\n' +
'  if(el)el.textContent=d.length+" "+T("results");\n' +
'}\n' +
'function catName(id){var c=CATS.find(function(x){return x.id===id;});return c?(c[S.lang]||c.en):id;}\n' +
'function catIcon(id){var c=CATS.find(function(x){return x.id===id;});return c?c.icon:"\uD83D\uDCE6";}\n' +
'function timeAgo(d){\n' +
'  var diff=Date.now()-new Date(d),m=Math.floor(diff/60000),h=Math.floor(m/60),dy=Math.floor(h/24);\n' +
'  if(S.lang==="ar"){if(m<1)return"\u0627\u0644\u0622\u0646";if(m<60)return"\u0645\u0646\u0630 "+m+" \u062f\u0642\u064a\u0642\u0629";if(h<24)return"\u0645\u0646\u0630 "+h+" \u0633\u0627\u0639\u0629";return"\u0645\u0646\u0630 "+dy+" \u064a\u0648\u0645";}\n' +
'  if(m<1)return"Just now";if(m<60)return m+"m ago";if(h<24)return h+"h ago";return dy+"d ago";\n' +
'}\n' +
'function sClass(s){return{new:"s-new",trending:"s-trending",recommended:"s-recommended"}[s]||"s-new";}\n' +
'function sLabel(s){return T({new:"statusNew",trending:"statusTrending",recommended:"statusRecommended"}[s]||"statusNew");}\n' +
'function payLabel(p){var m={paypal:"PayPal",bank:"Bank Transfer",crypto:"Crypto",gift:"Gift Cards",payoneer:"Payoneer",check:"Check"};return m[p]||p;}\n' +
'function devLabel(d){if(d==="both")return T("mobileDeskop");if(d==="mobile")return T("mobileOnly");return T("desktopOnly");}\n' +
'function makeCard(o){\n' +
'  var saved=S.saved.includes(o.id);\n' +
'  var stars="";\n' +
'  for(var i=1;i<=5;i++)stars+=\'<span class="\'+(i<=Math.round(o.rating||0)?"on":"")+\'" data-star="\'+i+\'" onclick="rateOpp(\\\''+o.id+'\\\',\'+i+\',event)">\u2605</span>\';\n' +
'  var cn=o.country||"";if(cn.length>14)cn=cn.substring(0,14)+"...";\n' +
'  return \'<div class="card" data-id="\'+o.id+\'">\'+\n' +
'    \'<div class="card-thumb"><span>\'+o.emoji+\'</span><span class="card-st \'+sClass(o.status)+\'">\'+sLabel(o.status)+\'</span></div>\'+\n' +
'    \'<div class="card-body"><div class="card-title">\'+o.title+\'</div><div class="card-desc">\'+o.description+\'</div>\'+\n' +
'    \'<div class="card-meta"><span class="meta earn">\u{1F4B0} \'+o.earnings+\'</span><span class="meta trust">\u2B50 \'+o.trustScore+\'/10</span><span class="meta">\u{1F30D} \'+cn+\'</span><span class="meta">\'+( o.isFree?"Free":"Paid")+\'</span></div></div>\'+\n' +
'    \'<div class="stars" data-oid="\'+o.id+\'">\'+stars+\'<span style="margin-left:4px;font-size:.68rem;color:var(--muted)">\'+( o.rating||0)+\' (\'+((o.reviews||0).toLocaleString())+\')</span></div>\'+\n' +
'    \'<div class="card-btns">\'+\n' +
'    \'<button class="cbtn" onclick="shareOpp(\\\''+o.id+'\\\',event)">\'+T("share")+\'</button>\'+\n' +
'    \'<button class="cbtn" id="sbtn\'+o.id+\'" onclick="toggleSaved(\\\''+o.id+'\\\',event)">\'+( saved?T("saved"):T("save"))+\'</button>\'+\n' +
'    \'<button class="cbtn" onclick="openCmp(\\\''+o.id+'\\\',event)">\'+T("compare")+\'</button></div>\'+\n' +
'    \'<div class="card-foot"><span class="card-cat">\'+catIcon(o.category)+\' \'+catName(o.category)+\'</span><span class="card-stars">\u2605 \'+( o.rating||0)+\'</span><span class="card-time">\'+timeAgo(o.publishedAt)+\'</span></div></div>\';\n' +
'}\n' +
'function skel(){return \'<div class="skel-card"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line w75"></div><div class="skel skel-line w100"></div><div class="skel skel-line w50"></div></div></div>\';}\n' +
'function renderAll(){renderNew();renderTrend();renderMain();}\n' +
'function renderNew(){\n' +
'  var g=document.getElementById("newGrid");if(!g)return;\n' +
'  var cut=Date.now()-86400000;\n' +
'  var items=S.opps.filter(function(o){return new Date(o.publishedAt)>cut;}).sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);}).slice(0,3);\n' +
'  g.innerHTML=items.length?items.map(makeCard).join(""):"<p style=\'color:var(--muted);font-size:.82rem;grid-column:1/-1\'>"+T("noResults")+"</p>";\n' +
'  addListeners(g);\n' +
'}\n' +
'function renderTrend(){\n' +
'  var g=document.getElementById("trendGrid");if(!g)return;\n' +
'  var items=S.opps.filter(function(o){return o.status==="trending"||(o.views||0)>10000;}).sort(function(a,b){return(b.views||0)-(a.views||0);}).slice(0,3);\n' +
'  g.innerHTML=items.map(makeCard).join("");\n' +
'  addListeners(g);\n' +
'}\n' +
'function renderMain(append){\n' +
'  var g=document.getElementById("mainGrid");if(!g)return;\n' +
'  if(!append){\n' +
'    g.innerHTML=skel()+skel()+skel();\n' +
'    setTimeout(function(){\n' +
'      if(!S.filtered.length){g.innerHTML="<div style=\'grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)\'><div style=\'font-size:3rem;margin-bottom:12px\'>\uD83D\uDD0D</div><div>"+T("noResults")+"</div></div>";return;}\n' +
'      g.innerHTML=S.filtered.slice(0,S.page*S.per).map(makeCard).join("");\n' +
'      addListeners(g);\n' +
'      var lm=document.getElementById("loadMoreBtn");\n' +
'      if(lm)lm.style.display=S.filtered.slice(0,S.page*S.per).length>=S.filtered.length?"none":"block";\n' +
'    },350);\n' +
'  }else{\n' +
'    var start=(S.page-1)*S.per;\n' +
'    var html=S.filtered.slice(start,S.page*S.per).map(makeCard).join("");\n' +
'    g.insertAdjacentHTML("beforeend",html);\n' +
'    addListeners(g);\n' +
'    var lm2=document.getElementById("loadMoreBtn");\n' +
'    if(lm2)lm2.style.display=g.querySelectorAll(".card").length>=S.filtered.length?"none":"block";\n' +
'  }\n' +
'}\n' +
'function addListeners(g){\n' +
'  g.querySelectorAll(".card").forEach(function(card){\n' +
'    card.addEventListener("click",function(e){\n' +
'      if(e.target.closest(".card-btns")||e.target.closest(".stars"))return;\n' +
'      openModal(card.dataset.id);\n' +
'    });\n' +
'  });\n' +
'}\n' +
'function renderSavedView(){\n' +
'  var g=document.getElementById("savedGrid"),ns=document.getElementById("noSaved");\n' +
'  var items=S.opps.filter(function(o){return S.saved.some(function(x){return x == o.id;});});\n' +
'  if(!items.length){if(g)g.innerHTML="";if(ns)ns.style.display="block";return;}\n' +
'  if(ns)ns.style.display="none";\n' +
'  if(g){g.innerHTML=items.map(makeCard).join("");addListeners(g);}\n' +
'}\n' +
'function renderSidebar(){renderTopRated();renderCats();renderSrcs();renderMS();}\n' +
'function renderTopRated(){\n' +
'  var l=document.getElementById("topRatedList");if(!l)return;\n' +
'  var items=S.opps.slice().sort(function(a,b){return(b.rating||0)-(a.rating||0);}).slice(0,5);\n' +
'  var rk=["rk-g","rk-s","rk-b","",""];\n' +
'  l.innerHTML=items.map(function(o,i){return \'<div class="tr-item" onclick="openModal(\\\''+o.id+'\\\')">\'+\'<div class="tr-rank \'+rk[i]+\'">\'+( i+1)+\'</div><div class="tr-info"><div class="tr-name">\'+o.title+\'</div><div class="tr-earn">\'+o.earnings+\'</div></div><span style="font-size:.7rem;color:var(--gold)">\u2605\'+( o.rating||0)+\'</span></div>\';}).join("");\n' +
'}\n' +
'function renderCats(){\n' +
'  var c=document.getElementById("catStats");if(!c)return;\n' +
'  var counts={};\n' +
'  S.opps.forEach(function(o){counts[o.category]=(counts[o.category]||0)+1;});\n' +
'  var max=Math.max.apply(null,Object.values(counts).concat([1]));\n' +
'  c.innerHTML=CATS.slice(0,8).map(function(cat){return \'<div class="cat-row" onclick="filterCat(\\\'\'+cat.id+\'\\\')"><span class="cat-ic">\'+cat.icon+\'</span><div style="flex:1"><div style="display:flex;justify-content:space-between"><span class="cat-nm">\'+( cat[S.lang]||cat.en)+\'</span><span class="cat-cnt">\'+( counts[cat.id]||0)+\'</span></div><div class="cat-bar-wrap"><div class="cat-bar" style="width:\'+( ((counts[cat.id]||0)/max*100))+\'%"></div></div></div></div>\';}).join("");\n' +
'}\n' +
'function renderSrcs(){\n' +
'  var l=document.getElementById("sourcesList");if(!l)return;\n' +
'  l.innerHTML=SOURCES.slice(0,8).map(function(s){return \'<div class="src-item"><div class="src-dot \'+s.status+\'"></div><span class="src-nm">\'+s.name+\'</span><span class="src-cnt">\'+s.count+\'</span></div>\';}).join("");\n' +
'}\n' +
'function renderMS(){\n' +
'  var el=document.getElementById("msTags");if(!el)return;\n' +
'  el.innerHTML=MS_TAGS.map(function(t){return \'<span class="ms-tag" onclick="quickSearch(\\\'\'+t+\'\\\')">\'+t+\'</span>\';}).join("");\n' +
'}\n' +
'function renderTicker(){\n' +
'  var inner=document.getElementById("ticker");if(!inner)return;\n' +
'  var html=S.opps.slice(0,8).map(function(o){return \'<span class="ticker-item"><span class="tc">\'+catIcon(o.category)+\'</span> \'+o.title+\' \u2014 \'+o.earnings+\'</span>\';}).join("");\n' +
'  inner.innerHTML=html+html;\n' +
'}\n' +
'function renderOOD(){\n' +
'  var opp=S.opps.slice().sort(function(a,b){return(b.views||0)-(a.views||0);})[0];\n' +
'  if(!opp)return;\n' +
'  var t=document.getElementById("oodTitle"),e=document.getElementById("oodEarn"),l=document.querySelector(".ood-lbl");\n' +
'  if(t)t.textContent=opp.emoji+" "+opp.title;\n' +
'  if(e)e.textContent="\u{1F4B0} "+opp.earnings;\n' +
'  if(l)l.textContent=T("oppOfDay");\n' +
'  document.getElementById("oppOfDay").onclick=function(){openModal(opp.id);};\n' +
'}\n' +
'function openModal(id){\n' +
'  var o=S.opps.find(function(x){return x.id == id;});if(!o)return;\n' +
'  var saved=S.saved.some(function(x){return x == id;});\n' +
'  var pay=(o.payment||[]).map(payLabel).join(", ");\n' +
'  var tags=(o.tags||[]).map(function(t){return \'<span class="tag">#\'+t+\'</span>\';}).join("");\n' +
'  document.getElementById("modalContent").innerHTML=\n' +
'    \'<div class="modal-thumb">\'+o.emoji+\'</div>\'+\n' +
'    \'<div class="modal-body">\'+\n' +
'    \'<div class="modal-cat">\'+catIcon(o.category)+\' \'+catName(o.category)+\'</div>\'+\n' +
'    \'<h2 class="modal-title">\'+o.title+\'</h2>\'+\n' +
'    \'<p class="modal-desc">\'+( o.fullDescription||o.description)+\'</p>\'+\n' +
'    \'<div class="modal-grid">\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("earnings")+\'</div><div class="md-v green">\'+o.earnings+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("trust")+\'</div><div class="md-v goldv">\'+o.trustScore+\'/10</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("rating")+\'</div><div class="md-v">\u2605\'+( o.rating||0)+\' (\'+((o.reviews||0).toLocaleString())+\')</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("countries")+\'</div><div class="md-v">\'+o.country+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("devices")+\'</div><div class="md-v">\'+devLabel(o.devices)+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("payment")+\'</div><div class="md-v">\'+pay+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("minWithdraw")+\'</div><div class="md-v orange">\'+o.minWithdraw+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("time")+\'</div><div class="md-v">\'+o.timeRequired+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("difficulty")+\'</div><div class="md-v">\'+o.difficulty+\'</div></div>\'+\n' +
'      \'<div class="md"><div class="md-l">\'+T("free")+\'</div><div class="md-v green">\'+( o.isFree?"Yes, Free":"Paid")+\'</div></div>\'+\n' +
'    \'</div>\'+\n' +
'    \'<div class="modal-tags">\'+tags+\'</div>\'+\n' +
'    \'<div class="modal-actions">\'+\n' +
'      \'<a href="\'+o.url+\'" target="_blank" rel="noopener noreferrer" class="btn-visit">\'+T("visitSite")+\'</a>\'+\n' +
'      \'<button class="btn-ma" id="msbtn\'+id+\'" onclick="toggleSaved(\\\''+id+'\\\',event)">\'+( saved?T("saved"):T("save"))+\'</button>\'+\n' +
'      \'<button class="btn-ma" onclick="shareOpp(\\\''+id+'\\\',event)">\'+T("share")+\'</button>\'+\n' +
'      \'<button class="btn-ma" onclick="openCmp(\\\''+id+'\\\',event)">\'+T("compare")+\'</button>\'+\n' +
'    \'</div></div>\';\n' +
'  document.getElementById("modalOverlay").classList.add("active");\n' +
'  document.body.style.overflow="hidden";\n' +
'}\n' +
'function closeModal(){document.getElementById("modalOverlay").classList.remove("active");document.body.style.overflow="";}\n' +
'function toggleSaved(id,e){\n' +
'  if(e)e.stopPropagation();\n' +
'  var idx=S.saved.findIndex(function(x){return x == id;});\n' +
'  if(idx>-1){S.saved.splice(idx,1);toast(S.lang==="ar"?"\u062a\u0645 \u0627\u0644\u0625\u0632\u0627\u0644\u0629":"Removed from saved");}\n' +
'  else{S.saved.push(id);toast(S.lang==="ar"?"\u2705 \u062a\u0645 \u0627\u0644\u062d\u0641\u0638!":"\u2705 Saved!");}\n' +
'  localStorage.setItem("savedOpps",JSON.stringify(S.saved));\n' +
'  ["sbtn","msbtn"].forEach(function(p){var btn=document.getElementById(p+id);if(btn)btn.textContent=S.saved.some(function(x){return x == id;})?T("saved"):T("save");});\n' +
'}\n' +
'function shareOpp(id,e){\n' +
'  if(e)e.stopPropagation();\n' +
'  var o=S.opps.find(function(x){return x.id == id;});if(!o)return;\n' +
'  var txt=encodeURIComponent(o.title+" \u2014 "+o.earnings+"\\n"+o.url);\n' +
'  document.getElementById("shareBtns").innerHTML=\n' +
'    \'<button class="share-btn" onclick="window.open(\\\'https://wa.me/?text=\'+txt+\'\\\',\\\'_blank\\\')"><span>\uD83D\uDCAC</span>\'+T("shareWa")+\'</button>\'+\n' +
'    \'<button class="share-btn" onclick="window.open(\\\'https://t.me/share/url?url=\'+encodeURIComponent(o.url)+\'&text=\'+encodeURIComponent(o.title)+\'\\\',\\\'_blank\\\')"><span>\u2708</span>\'+T("shareTg")+\'</button>\'+\n' +
'    \'<button class="share-btn" onclick="copyLink(\\\''+o.url+\'\\\')"><span>\uD83D\uDD17</span>\'+T("copyLink")+\'</button>\';\n' +
'  document.getElementById("shareModal").classList.add("active");\n' +
'}\n' +
'function copyLink(url){\n' +
'  navigator.clipboard.writeText(url).then(function(){\n' +
'    toast(T("copied"));\n' +
'    document.getElementById("shareModal").classList.remove("active");\n' +
'  });\n' +
'}\n' +
'function openCmp(id,e){\n' +
'  if(e)e.stopPropagation();\n' +
'  if(!S.cmpA){S.cmpA=id;toast(T("compareSelect"));return;}\n' +
'  if(S.cmpA == id){S.cmpA=null;return;}\n' +
'  S.cmpB=id;renderCmp();\n' +
'}\n' +
'function renderCmp(){\n' +
'  var a=S.opps.find(function(o){return o.id == S.cmpA;}),b=S.opps.find(function(o){return o.id == S.cmpB;});\n' +
'  if(!a||!b)return;\n' +
'  var fields=[[T("earnings"),a.earnings,b.earnings],[T("trust"),a.trustScore+"/10",b.trustScore+"/10"],[T("rating"),"\u2605"+(a.rating||0),"\u2605"+(b.rating||0)],[T("countries"),a.country,b.country],[T("devices"),devLabel(a.devices),devLabel(b.devices)],[T("minWithdraw"),a.minWithdraw,b.minWithdraw],[T("difficulty"),a.difficulty,b.difficulty],[T("free"),a.isFree?"\u2705":"\u274C",b.isFree?"\u2705":"\u274C"]];\n' +
'  document.getElementById("compareGrid").innerHTML=\n' +
'    \'<div class="compare-col"><h3>\'+a.emoji+" "+a.title.substring(0,26)+"...</h3>"+fields.map(function(f){return \'<div class="cmp-field"><span class="cmp-l">\'+f[0]+\'</span><span class="cmp-v">\'+f[1]+\'</span></div>\';}).join("")+"</div>"+\n' +
'    \'<div class="compare-col"><h3>\'+b.emoji+" "+b.title.substring(0,26)+"...</h3>"+fields.map(function(f){return \'<div class="cmp-field"><span class="cmp-l">\'+f[0]+\'</span><span class="cmp-v">\'+f[2]+\'</span></div>\';}).join("")+"</div>";\n' +
'  document.getElementById("compareModal").classList.add("active");\n' +
'  S.cmpA=null;S.cmpB=null;\n' +
'}\n' +
'function updateCalc(){\n' +
'  var h=parseFloat(document.getElementById("calcH").value);\n' +
'  var d=parseFloat(document.getElementById("calcD").value);\n' +
'  var sk=parseFloat(document.getElementById("calcS").value);\n' +
'  var hv=document.getElementById("calcHv"),dv=document.getElementById("calcDv");\n' +
'  if(hv)hv.textContent=h;if(dv)dv.textContent=d;\n' +
'  var monthly=Math.round(h*d*4.3*sk);\n' +
'  var el=document.getElementById("calcNum");\n' +
'  if(el)el.textContent="$"+monthly.toLocaleString();\n' +
'}\n' +
'function rateOpp(id,star,e){\n' +
'  e.stopPropagation();\n' +
'  document.querySelectorAll(\'[data-oid="\'+id+\'"] [data-star]\').forEach(function(s){s.classList.toggle("on",parseInt(s.dataset.star)<=star);});\n' +
'  fetch("/api/rate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id,rating:star})}).then(function(){toast("\u2605 "+star+" \u2014 Thanks!");}).catch(function(){toast("\u2605 "+star);});\n' +
'}\n' +
'function animateStats(){\n' +
'  var total=S.opps.length,today=S.opps.filter(function(o){return new Date(o.publishedAt)>Date.now()-86400000;}).length;\n' +
'  animN("statTotal",0,total*8+47,1500);\n' +
'  animN("statToday",0,today+3,1200);\n' +
'}\n' +
'function animN(id,from,to,dur){\n' +
'  var el=document.getElementById(id);if(!el)return;\n' +
'  var step=(to-from)/(dur/16),cur=from;\n' +
'  var t=setInterval(function(){cur=Math.min(cur+step,to);el.textContent=Math.floor(cur);if(cur>=to)clearInterval(t);},16);\n' +
'}\n' +
'var searchTimer;\n' +
'document.getElementById("searchInput").addEventListener("input",function(e){\n' +
'  clearTimeout(searchTimer);\n' +
'  searchTimer=setTimeout(function(){\n' +
'    var q=e.target.value.trim();\n' +
'    var r=document.getElementById("searchResults");\n' +
'    if(!q){r.innerHTML="";return;}\n' +
'    var matches=S.opps.filter(function(o){return o.title.toLowerCase().includes(q.toLowerCase())||(o.description||"").toLowerCase().includes(q.toLowerCase())||(o.tags||[]).some(function(t){return t.toLowerCase().includes(q.toLowerCase());});}).slice(0,6);\n' +
'    if(!matches.length){r.innerHTML="<div style=\'color:var(--muted);text-align:center;padding:14px\'>"+T("noResults")+"</div>";return;}\n' +
'    r.innerHTML=matches.map(function(o){return \'<div onclick="openModal(\\\''+o.id+'\\\');closeSearch()" style="background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);padding:10px;cursor:pointer" onmouseover="this.style.borderColor=\\\'var(--bdra)\\\'" onmouseout="this.style.borderColor=\\\'var(--bdr)\\\'"><div style="font-size:.82rem;font-weight:600;margin-bottom:3px">\'+o.emoji+" "+o.title+"</div><div style=\'font-size:.7rem;color:var(--muted)\'>"+o.description.substring(0,70)+"...</div></div>";}).join("");\n' +
'  },300);\n' +
'});\n' +
'function closeSearch(){\n' +
'  document.getElementById("searchBar").style.display="none";\n' +
'  document.getElementById("searchInput").value="";\n' +
'  document.getElementById("searchResults").innerHTML="";\n' +
'}\n' +
'function quickSearch(term){S.q=term;S.page=1;initFilter();renderMain();document.getElementById("all-opps").scrollIntoView({behavior:"smooth"});}\n' +
'function filterCat(id){\n' +
'  S.cat=id;S.page=1;\n' +
'  document.querySelectorAll(".chip").forEach(function(c){c.classList.toggle("active",c.dataset.cat===id);});\n' +
'  initFilter();renderMain();\n' +
'  document.getElementById("all-opps").scrollIntoView({behavior:"smooth"});\n' +
'}\n' +
'function setupEvents(){\n' +
'  document.getElementById("themeBtn").addEventListener("click",function(){\n' +
'    S.theme=S.theme==="dark"?"light":"dark";\n' +
'    localStorage.setItem("theme",S.theme);applyTheme();\n' +
'  });\n' +
'  document.getElementById("langSel").addEventListener("change",function(e){\n' +
'    S.lang=e.target.value;\n' +
'    localStorage.setItem("lang",S.lang);\n' +
'    applyLang();renderTicker();renderOOD();renderSidebar();\n' +
'    var msgs={en:"\uD83C\uDDFA\uD83C\uDDF8 English",ar:"\uD83C\uDDF8\uD83C\uDDE6 \u0639\u0631\u0628\u064A",fr:"\uD83C\uDDEB\uD83C\uDDF7 Fran\u00E7ais",tr:"\uD83C\uDDF9\uD83C\uDDF7 T\u00FCrk\u00E7e",es:"\uD83C\uDDEA\uD83C\uDDF8 Espa\u00F1ol"};\n' +
'    toast(msgs[S.lang]||"Language changed");\n' +
'  });\n' +
'  document.getElementById("searchToggle").addEventListener("click",function(){\n' +
'    var sb=document.getElementById("searchBar");\n' +
'    sb.style.display=sb.style.display==="none"||!sb.style.display?"block":"none";\n' +
'    if(sb.style.display==="block")setTimeout(function(){document.getElementById("searchInput").focus();},100);\n' +
'  });\n' +
'  document.getElementById("searchClose").addEventListener("click",closeSearch);\n' +
'  document.getElementById("modalClose").addEventListener("click",closeModal);\n' +
'  document.getElementById("modalOverlay").addEventListener("click",function(e){if(e.target===document.getElementById("modalOverlay"))closeModal();});\n' +
'  document.getElementById("compareClose").addEventListener("click",function(){document.getElementById("compareModal").classList.remove("active");S.cmpA=null;});\n' +
'  document.getElementById("shareCancel").addEventListener("click",function(){document.getElementById("shareModal").classList.remove("active");});\n' +
'  document.getElementById("shareModal").addEventListener("click",function(e){if(e.target===document.getElementById("shareModal"))document.getElementById("shareModal").classList.remove("active");});\n' +
'  document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeModal();closeSearch();document.getElementById("compareModal").classList.remove("active");document.getElementById("shareModal").classList.remove("active");}});\n' +
'  document.getElementById("chips").addEventListener("click",function(e){\n' +
'    var chip=e.target.closest(".chip");if(!chip)return;\n' +
'    document.querySelectorAll(".chip").forEach(function(c){c.classList.remove("active");});\n' +
'    chip.classList.add("active");\n' +
'    S.cat=chip.dataset.cat;S.page=1;initFilter();renderMain();\n' +
'  });\n' +
'  document.getElementById("sortSel").addEventListener("change",function(e){S.sort=e.target.value;S.page=1;initFilter();renderMain();});\n' +
'  document.getElementById("devSel").addEventListener("change",function(e){S.device=e.target.value;S.page=1;initFilter();renderMain();});\n' +
'  document.getElementById("paySel").addEventListener("change",function(e){S.pay=e.target.value;S.page=1;initFilter();renderMain();});\n' +
'  document.getElementById("loadMoreBtn").addEventListener("click",function(){S.page++;renderMain(true);});\n' +
'  document.getElementById("refreshBtn").addEventListener("click",async function(){\n' +
'    var btn=document.getElementById("refreshBtn");btn.disabled=true;\n' +
'    try{await fetch("/api/refresh");await loadLive();toast("\u2705 "+(S.lang==="ar"?"\u062a\u0645 \u0627\u0644\u062a\u062d\u062f\u064a\u062b":"Updated!"));}catch(e){toast("\u26A0\uFE0F Failed");}\n' +
'    btn.disabled=false;\n' +
'  });\n' +
'  document.getElementById("burgerBtn").addEventListener("click",function(){document.getElementById("mobileMenu").classList.add("open");});\n' +
'  document.getElementById("menuClose").addEventListener("click",closeMM);\n' +
'  document.getElementById("mm-home").addEventListener("click",function(e){e.preventDefault();setView("home");closeMM();});\n' +
'  document.getElementById("mm-saved").addEventListener("click",function(e){e.preventDefault();setView("saved");closeMM();});\n' +
'  document.getElementById("mm-cats").addEventListener("click",closeMM);\n' +
'  document.getElementById("mm-trend").addEventListener("click",closeMM);\n' +
'  document.getElementById("nav-home").addEventListener("click",function(e){e.preventDefault();setView("home");});\n' +
'  document.getElementById("nav-saved").addEventListener("click",function(e){e.preventDefault();setView("saved");});\n' +
'  document.getElementById("logoBtn").addEventListener("click",function(e){e.preventDefault();setView("home");});\n' +
'  setInterval(function(){\n' +
'    var dot=document.querySelector(".ood::before");\n' +
'  },8000);\n' +
'  setInterval(renderTicker,5*60*1000);\n' +
'}\n' +
'function closeMM(){document.getElementById("mobileMenu").classList.remove("open");}\n' +
'var toastTimer;\n' +
'function toast(msg,dur){\n' +
'  var el=document.getElementById("toast");\n' +
'  el.innerHTML=msg;el.classList.add("show");\n' +
'  clearTimeout(toastTimer);\n' +
'  toastTimer=setTimeout(function(){el.classList.remove("show");},dur||3000);\n' +
'}\n';
}

// ================================================================
//  STATIC DATA
// ================================================================
function getStaticOpps() {
  const now = Date.now();
  return [
    { id:1, title:"Upwork — World's Largest Freelance Platform", description:"Earn from design, programming, writing, and marketing skills on the world's biggest freelance marketplace.", fullDescription:"Upwork is the leading global freelance marketplace, letting you create a professional profile and apply for thousands of projects daily. Fields include programming, design, writing, marketing, and more. Start free and earn $5–$200+/hr.", category:"freelance", status:"recommended", emoji:"💼", earnings:"$500–$5,000/mo", earningLevel:"high", trustScore:9.5, rating:4.7, reviews:12840, country:"Worldwide", devices:"both", payment:["paypal","bank","payoneer"], minWithdraw:"$100", isFree:true, difficulty:"Medium", timeRequired:"Full or part-time", url:"https://upwork.com", tags:["freelance","programming","design","writing"], source:"upwork", publishedAt:new Date(now-1*3600000).toISOString(), views:28450 },
    { id:2, title:"Scale AI — Get Paid to Train AI Models", description:"Get paid to evaluate AI responses and improve machine learning models through high-quality feedback.", fullDescription:"Earn by contributing to AI model training. You evaluate model responses, write sample conversations, or test capabilities. Payment via Scale AI and partners. Great for those interested in AI technologies.", category:"ai", status:"trending", emoji:"🤖", earnings:"$15–$50/hr", earningLevel:"medium", trustScore:9.8, rating:4.9, reviews:3210, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$50", isFree:true, difficulty:"Medium", timeRequired:"Flexible", url:"https://scale.ai", tags:["AI","data-labeling","RLHF"], source:"reddit", publishedAt:new Date(now-2*3600000).toISOString(), views:15200 },
    { id:3, title:"Swagbucks — Paid Surveys & Rewards", description:"Earn rewards for filling surveys, watching ads, shopping online, and playing games. Trusted since 2008.", fullDescription:"Swagbucks is one of the oldest and most trusted rewards platforms. Earn SB points for surveys (50–400 SB), watching videos, online shopping (1–10% cashback), and installing apps. 100 SB = $1. Withdraw via PayPal or gift cards.", category:"surveys", status:"new", emoji:"📋", earnings:"$50–$300/mo", earningLevel:"low", trustScore:8.5, rating:4.2, reviews:45600, country:"Worldwide", devices:"both", payment:["paypal","gift"], minWithdraw:"$3", isFree:true, difficulty:"Easy", timeRequired:"1 hr/day", url:"https://swagbucks.com", tags:["surveys","rewards","cashback"], source:"swagbucks", publishedAt:new Date(now-30*60000).toISOString(), views:9870 },
    { id:4, title:"Amazon Associates — #1 Affiliate Program", description:"Earn 1–10% commission on every Amazon sale through your referral links. World's most popular affiliate program.", fullDescription:"Amazon Associates lets you promote millions of products and earn commissions from 1% to 10% depending on category. You need a website, YouTube channel, or social media page with followers.", category:"affiliate", status:"recommended", emoji:"🔗", earnings:"$100–$10,000/mo", earningLevel:"variable", trustScore:9.7, rating:4.5, reviews:89200, country:"Worldwide", devices:"both", payment:["bank","gift","check"], minWithdraw:"$10", isFree:true, difficulty:"Medium", timeRequired:"Requires existing audience", url:"https://affiliate-program.amazon.com", tags:["affiliate","amazon","marketing"], source:"reddit", publishedAt:new Date(now-4*3600000).toISOString(), views:22100 },
    { id:5, title:"Rakuten — Cashback on Every Purchase", description:"Get real cash back when shopping from 3,500+ online stores. Cashback rates up to 40% on popular brands.", fullDescription:"Rakuten gives you real cashback when shopping from global brands like Nike, ASOS, Booking.com, and eBay. Just install the browser extension or use the site before purchasing. Cashback checks arrive quarterly.", category:"cashback", status:"recommended", emoji:"💰", earnings:"1–40% per purchase", earningLevel:"variable", trustScore:9.2, rating:4.6, reviews:67800, country:"US, Canada, Europe", devices:"both", payment:["paypal","check"], minWithdraw:"$5.01", isFree:true, difficulty:"Very Easy", timeRequired:"No extra time", url:"https://rakuten.com", tags:["cashback","shopping","rewards"], source:"reddit", publishedAt:new Date(now-6*3600000).toISOString(), views:18900 },
    { id:6, title:"UserTesting — Test Apps From Home", description:"Earn $10 per 20-minute session testing websites and apps while recording your spoken feedback.", fullDescription:"UserTesting pays everyday users to test websites and apps. Each task takes 10–20 minutes and pays $4–$60. You need a microphone, internet connection, and English proficiency. Payment via PayPal within 7 days.", category:"testing", status:"trending", emoji:"🧪", earnings:"$10–$60/task", earningLevel:"medium", trustScore:8.8, rating:4.4, reviews:23100, country:"Most countries", devices:"both", payment:["paypal"], minWithdraw:"$10", isFree:true, difficulty:"Easy", timeRequired:"20 min/task", url:"https://usertesting.com", tags:["testing","UX","feedback"], source:"reddit", publishedAt:new Date(now-3*3600000).toISOString(), views:14500 },
    { id:7, title:"Fiverr — Sell Your Skills Globally", description:"Create professional service gigs and sell them to millions of buyers worldwide starting from $5.", fullDescription:"Fiverr lets you offer services starting at $5. Top demanded fields: logo design, content writing, SEO, social media management, voice-over, translation, and programming. Top sellers earn $10,000+/month. Fiverr takes 20% commission.", category:"freelance", status:"recommended", emoji:"🌟", earnings:"$100–$10,000/mo", earningLevel:"high", trustScore:9.0, rating:4.5, reviews:156000, country:"Worldwide", devices:"both", payment:["paypal","bank","payoneer"], minWithdraw:"$20", isFree:true, difficulty:"Medium", timeRequired:"Flexible", url:"https://fiverr.com", tags:["freelance","services","design","programming"], source:"reddit", publishedAt:new Date(now-8*3600000).toISOString(), views:34200 },
    { id:8, title:"Replit Bounties — Paid Coding Challenges", description:"Earn by solving coding challenges posted by Replit users. Rewards range from $50 to $5,000.", fullDescription:"Replit Bounties connects developers with employers seeking technical solutions. Browse available tasks, apply, and complete them directly in your browser. Perfect for beginner and advanced programmers alike.", category:"freelance", status:"new", emoji:"💻", earnings:"$50–$5,000/task", earningLevel:"high", trustScore:8.6, rating:4.3, reviews:4200, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$10", isFree:true, difficulty:"Advanced", timeRequired:"Per project", url:"https://replit.com/bounties", tags:["coding","bounty","projects"], source:"hackernews", publishedAt:new Date(now-20*60000).toISOString(), views:8900 },
    { id:9, title:"Binance Earn — Grow Your Crypto", description:"Earn up to 20% annual interest on your cryptocurrency through Binance Earn's diverse products.", fullDescription:"Binance Earn lets you generate passive income from crypto without trading. Options: Flexible Savings, Locked Staking, Dual Investment, and Launchpool. Annual rates: 3%–20% depending on asset.", category:"crypto", status:"trending", emoji:"₿", earnings:"3–20% annually", earningLevel:"medium", trustScore:8.3, rating:4.1, reviews:89500, country:"Worldwide (some restrictions)", devices:"both", payment:["crypto"], minWithdraw:"Depends on asset", isFree:true, difficulty:"Medium", timeRequired:"Long-term investment", url:"https://binance.com/earn", tags:["crypto","staking","passive-income"], source:"reddit", publishedAt:new Date(now-5*3600000).toISOString(), views:19600 },
    { id:10, title:"Y Combinator — $500K Startup Grant", description:"YC provides $500,000 to each accepted startup plus world-class mentorship from Silicon Valley's top investors.", fullDescription:"Y Combinator is the world's most prestigious startup accelerator. Your company gets $500,000 and three months of intensive mentorship, then pitches to hundreds of investors at Demo Day. Alumni include Airbnb, Stripe, Coinbase, Dropbox.", category:"grants", status:"new", emoji:"🎓", earnings:"$500,000 grant", earningLevel:"high", trustScore:9.9, rating:4.9, reviews:1230, country:"Worldwide", devices:"desktop", payment:["bank"], minWithdraw:"N/A", isFree:true, difficulty:"Very Hard", timeRequired:"Full commitment", url:"https://ycombinator.com/apply", tags:["grant","startup","investment","YC"], source:"hackernews", publishedAt:new Date(now-12*3600000).toISOString(), views:45800 },
    { id:11, title:"99designs — Graphic Design Contests", description:"Participate in design contests and win $99–$1,299 per winning project submitted to clients.", fullDescription:"99designs lets designers join contests where employers post a project (logo, website, etc.) and designers submit their work. The winner gets the full amount. Great for building your portfolio.", category:"contests", status:"new", emoji:"🏆", earnings:"$99–$1,299/win", earningLevel:"variable", trustScore:8.4, rating:4.2, reviews:18900, country:"Worldwide", devices:"desktop", payment:["paypal","bank"], minWithdraw:"$20", isFree:true, difficulty:"Requires design skills", timeRequired:"Per project", url:"https://99designs.com", tags:["design","contests","graphic","logo"], source:"reddit", publishedAt:new Date(now-15*60000).toISOString(), views:7600 },
    { id:12, title:"Top Referral Programs 2025 — Earn Per Friend", description:"Guide to the best paid referral programs in 2025. Companies pay up to $500 per referred friend.", fullDescription:"Referral programs are among the easiest earning methods. Top programs: Robinhood ($5–$20), Coinbase ($10), Rakuten ($30), Swagbucks ($3), Honey ($5). Just share your unique referral link with friends and family.", category:"referral", status:"new", emoji:"👥", earnings:"$10–$500/referral", earningLevel:"medium", trustScore:8.0, rating:4.3, reviews:5430, country:"Worldwide", devices:"both", payment:["paypal","bank","crypto"], minWithdraw:"Varies", isFree:true, difficulty:"Very Easy", timeRequired:"Minutes", url:"https://referralhero.com", tags:["referral","rewards","passive"], source:"reddit", publishedAt:new Date(now-45*60000).toISOString(), views:6700 }
  ];
}

// ================================================================
//  TRANSLATIONS
// ================================================================
function getTranslations() {
  return {
    en: {
      tagline:'Updates automatically every hour',
      oppOfDay:'⚡ OPPORTUNITY OF THE DAY',
      newToday:'New Today', trending:'🔥 Trending Now', allOpps:'All Opportunities',
      topRated:'⭐ Top Rated', categories:'📂 Categories', sources:'📡 Active Sources',
      visitSite:'🔗 Visit Official Site', save:'🔖 Save', saved:'✅ Saved',
      share:'📤 Share', compare:'⚖️ Compare', calculator:'💰 Income Calculator',
      calcHours:'Hours per day', calcDays:'Days per week', calcSkill:'Skill level',
      calcResult:'Estimated monthly income',
      earnings:'Expected Earnings', trust:'Trust Score', rating:'User Rating',
      countries:'Supported Countries', devices:'Supported Devices', payment:'Payment Method',
      minWithdraw:'Min Withdrawal', difficulty:'Difficulty', time:'Time Required', free:'Free?',
      statusNew:'NEW', statusTrending:'TRENDING', statusRecommended:'TOP PICK',
      searchPlaceholder:'Search opportunities...', loadMore:'Load More', refresh:'Refresh',
      results:'opportunities', noResults:'No results found',
      savedPage:'Saved', noSaved:'No saved opportunities yet',
      shareWa:'Share on WhatsApp', shareTg:'Share on Telegram',
      copyLink:'Copy Link', copied:'✅ Link copied!',
      compareSelect:'Select another opportunity to compare',
      mostSearched:'🔎 Most Searched', installApp:'📱 Install App',
      offline:'📶 You are offline — showing cached data',
      navHome:'Home', navCats:'Categories', navTrending:'Trending', navSaved:'Saved', navAbout:'About',
      footerDesc:'Smart platform to discover the latest online earning opportunities.',
      footerNav:'Navigation', footerLegal:'Legal',
      footerPrivacy:'Privacy Policy', footerTerms:'Terms & Conditions',
      footerDisclaimer:'⚠️ Content is for informational purposes only. Always verify on official sites.',
      mobileOnly:'Mobile Only', desktopOnly:'Desktop Only', mobileDeskop:'Mobile & Desktop',
      sortNewest:'Newest', sortTrending:'Most Popular', sortRated:'Highest Rated', sortEarning:'Highest Earning',
      catAll:'All'
    },
    ar: {
      tagline:'يتحدث تلقائياً كل ساعة',
      oppOfDay:'⚡ فرصة اليوم',
      newToday:'جديد اليوم', trending:'🔥 الفرص الرائجة', allOpps:'جميع الفرص',
      topRated:'⭐ الأعلى تقييماً', categories:'📂 التصنيفات', sources:'📡 المصادر النشطة',
      visitSite:'🔗 زيارة الموقع الرسمي', save:'🔖 حفظ', saved:'✅ محفوظ',
      share:'📤 مشاركة', compare:'⚖️ مقارنة', calculator:'💰 حاسبة الدخل',
      calcHours:'ساعات يومياً', calcDays:'أيام أسبوعياً', calcSkill:'مستوى المهارة',
      calcResult:'الدخل الشهري المقدر',
      earnings:'الأرباح المتوقعة', trust:'مستوى الموثوقية', rating:'تقييم المستخدمين',
      countries:'الدول المدعومة', devices:'الأجهزة المدعومة', payment:'طريقة الدفع',
      minWithdraw:'الحد الأدنى للسحب', difficulty:'مستوى الصعوبة', time:'الوقت المطلوب', free:'هل هي مجانية؟',
      statusNew:'جديد', statusTrending:'رائج', statusRecommended:'موصى به',
      searchPlaceholder:'ابحث عن فرصة...', loadMore:'تحميل المزيد', refresh:'تحديث',
      results:'فرصة', noResults:'لا توجد نتائج',
      savedPage:'المحفوظات', noSaved:'لا توجد فرص محفوظة بعد',
      shareWa:'مشاركة على واتساب', shareTg:'مشاركة على تيليجرام',
      copyLink:'نسخ الرابط', copied:'✅ تم نسخ الرابط!',
      compareSelect:'اختر فرصة أخرى للمقارنة',
      mostSearched:'🔎 الأكثر بحثاً', installApp:'📱 تثبيت التطبيق',
      offline:'📶 أنت غير متصل — يتم عرض بيانات مخزنة',
      navHome:'الرئيسية', navCats:'التصنيفات', navTrending:'الرائج', navSaved:'المحفوظات', navAbout:'من نحن',
      footerDesc:'منصة ذكية لاكتشاف أحدث فرص كسب المال عبر الإنترنت.',
      footerNav:'التنقل', footerLegal:'قانوني',
      footerPrivacy:'سياسة الخصوصية', footerTerms:'الشروط والأحكام',
      footerDisclaimer:'⚠️ المحتوى للأغراض المعلوماتية فقط. تحقق دائماً من المواقع الرسمية.',
      mobileOnly:'موبايل فقط', desktopOnly:'كمبيوتر فقط', mobileDeskop:'موبايل وكمبيوتر',
      sortNewest:'الأحدث', sortTrending:'الأكثر رواجاً', sortRated:'الأعلى تقييماً', sortEarning:'الأعلى دخلاً',
      catAll:'الكل'
    },
    fr: {
      tagline:'Mise à jour automatique chaque heure',
      oppOfDay:'⚡ Opportunité du jour',
      newToday:'Nouveau aujourd\'hui', trending:'🔥 Tendances', allOpps:'Toutes les opportunités',
      topRated:'⭐ Mieux notées', categories:'📂 Catégories', sources:'📡 Sources actives',
      visitSite:'🔗 Visiter le site', save:'🔖 Sauvegarder', saved:'✅ Sauvegardé',
      share:'📤 Partager', compare:'⚖️ Comparer', calculator:'💰 Calculateur de revenus',
      calcHours:'Heures/jour', calcDays:'Jours/semaine', calcSkill:'Niveau de compétence',
      calcResult:'Revenu mensuel estimé',
      earnings:'Gains prévus', trust:'Score de confiance', rating:'Note utilisateurs',
      countries:'Pays supportés', devices:'Appareils', payment:'Méthode de paiement',
      minWithdraw:'Retrait minimum', difficulty:'Difficulté', time:'Temps requis', free:'Gratuit?',
      statusNew:'NOUVEAU', statusTrending:'TENDANCE', statusRecommended:'TOP',
      searchPlaceholder:'Rechercher...', loadMore:'Charger plus', refresh:'Actualiser',
      results:'opportunités', noResults:'Aucun résultat',
      savedPage:'Sauvegardés', noSaved:'Aucune opportunité sauvegardée',
      shareWa:'Partager sur WhatsApp', shareTg:'Partager sur Telegram',
      copyLink:'Copier le lien', copied:'✅ Lien copié!',
      compareSelect:'Sélectionnez une opportunité',
      mostSearched:'🔎 Plus recherchées', installApp:'📱 Installer',
      offline:'📶 Hors ligne — données en cache',
      navHome:'Accueil', navCats:'Catégories', navTrending:'Tendances', navSaved:'Sauvegardés', navAbout:'À propos',
      footerDesc:'Plateforme intelligente pour découvrir les meilleures opportunités de revenus en ligne.',
      footerNav:'Navigation', footerLegal:'Légal',
      footerPrivacy:'Politique de confidentialité', footerTerms:'Conditions d\'utilisation',
      footerDisclaimer:'⚠️ Contenu à titre informatif uniquement.',
      mobileOnly:'Mobile seulement', desktopOnly:'Bureau seulement', mobileDeskop:'Mobile et Bureau',
      sortNewest:'Plus récent', sortTrending:'Populaire', sortRated:'Mieux noté', sortEarning:'Gains élevés',
      catAll:'Tout'
    },
    tr: {
      tagline:'Her saat otomatik güncellenir',
      oppOfDay:'⚡ Günün Fırsatı',
      newToday:'Bugün Yeni', trending:'🔥 Trend Fırsatlar', allOpps:'Tüm Fırsatlar',
      topRated:'⭐ En Yüksek Puanlı', categories:'📂 Kategoriler', sources:'📡 Aktif Kaynaklar',
      visitSite:'🔗 Siteyi Ziyaret Et', save:'🔖 Kaydet', saved:'✅ Kaydedildi',
      share:'📤 Paylaş', compare:'⚖️ Karşılaştır', calculator:'💰 Gelir Hesaplayıcı',
      calcHours:'Günlük saat', calcDays:'Haftalık gün', calcSkill:'Beceri seviyesi',
      calcResult:'Tahmini aylık gelir',
      earnings:'Beklenen Kazanç', trust:'Güven Puanı', rating:'Kullanıcı Puanı',
      countries:'Desteklenen Ülkeler', devices:'Cihazlar', payment:'Ödeme Yöntemi',
      minWithdraw:'Min. Çekim', difficulty:'Zorluk', time:'Gereken Süre', free:'Ücretsiz mi?',
      statusNew:'YENİ', statusTrending:'TREND', statusRecommended:'ÖNERİLEN',
      searchPlaceholder:'Fırsat ara...', loadMore:'Daha Fazla', refresh:'Yenile',
      results:'fırsat', noResults:'Sonuç bulunamadı',
      savedPage:'Kaydedilenler', noSaved:'Henüz kaydedilen fırsat yok',
      shareWa:'WhatsApp\'ta Paylaş', shareTg:'Telegram\'da Paylaş',
      copyLink:'Bağlantıyı Kopyala', copied:'✅ Kopyalandı!',
      compareSelect:'Karşılaştırmak için seçin',
      mostSearched:'🔎 En Çok Aranan', installApp:'📱 Yükle',
      offline:'📶 Çevrimdışısınız',
      navHome:'Ana Sayfa', navCats:'Kategoriler', navTrending:'Trend', navSaved:'Kaydedilenler', navAbout:'Hakkında',
      footerDesc:'Çevrimiçi kazanç fırsatlarını keşfetmek için akıllı platform.',
      footerNav:'Navigasyon', footerLegal:'Yasal',
      footerPrivacy:'Gizlilik Politikası', footerTerms:'Kullanım Şartları',
      footerDisclaimer:'⚠️ İçerik yalnızca bilgilendirme amaçlıdır.',
      mobileOnly:'Yalnızca Mobil', desktopOnly:'Yalnızca Masaüstü', mobileDeskop:'Mobil ve Masaüstü',
      sortNewest:'En Yeni', sortTrending:'Popüler', sortRated:'En Yüksek Puan', sortEarning:'En Yüksek Kazanç',
      catAll:'Tümü'
    },
    es: {
      tagline:'Se actualiza automáticamente cada hora',
      oppOfDay:'⚡ Oportunidad del día',
      newToday:'Nuevo hoy', trending:'🔥 Tendencias', allOpps:'Todas las oportunidades',
      topRated:'⭐ Mejor valoradas', categories:'📂 Categorías', sources:'📡 Fuentes activas',
      visitSite:'🔗 Visitar sitio', save:'🔖 Guardar', saved:'✅ Guardado',
      share:'📤 Compartir', compare:'⚖️ Comparar', calculator:'💰 Calculadora',
      calcHours:'Horas/día', calcDays:'Días/semana', calcSkill:'Nivel de habilidad',
      calcResult:'Ingreso mensual estimado',
      earnings:'Ganancias esperadas', trust:'Puntuación de confianza', rating:'Valoración',
      countries:'Países soportados', devices:'Dispositivos', payment:'Método de pago',
      minWithdraw:'Retiro mínimo', difficulty:'Dificultad', time:'Tiempo requerido', free:'¿Gratis?',
      statusNew:'NUEVO', statusTrending:'TENDENCIA', statusRecommended:'RECOMENDADO',
      searchPlaceholder:'Buscar oportunidades...', loadMore:'Cargar más', refresh:'Actualizar',
      results:'oportunidades', noResults:'Sin resultados',
      savedPage:'Guardados', noSaved:'No hay oportunidades guardadas',
      shareWa:'Compartir en WhatsApp', shareTg:'Compartir en Telegram',
      copyLink:'Copiar enlace', copied:'✅ ¡Enlace copiado!',
      compareSelect:'Selecciona una oportunidad',
      mostSearched:'🔎 Más buscadas', installApp:'📱 Instalar',
      offline:'📶 Sin conexión — mostrando caché',
      navHome:'Inicio', navCats:'Categorías', navTrending:'Tendencias', navSaved:'Guardados', navAbout:'Acerca de',
      footerDesc:'Plataforma inteligente para descubrir oportunidades de ingresos en línea.',
      footerNav:'Navegación', footerLegal:'Legal',
      footerPrivacy:'Política de privacidad', footerTerms:'Términos y condiciones',
      footerDisclaimer:'⚠️ Contenido solo informativo.',
      mobileOnly:'Solo móvil', desktopOnly:'Solo escritorio', mobileDeskop:'Móvil y escritorio',
      sortNewest:'Más reciente', sortTrending:'Popular', sortRated:'Mejor valorado', sortEarning:'Mayores ganancias',
      catAll:'Todo'
    }
  };
}
