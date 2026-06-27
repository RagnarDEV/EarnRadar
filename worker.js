// worker.js — EarnRadar Cloudflare Worker
// Fetches opportunities from free APIs and automatically serves frontend assets
// Deploy: Automating via GitHub Actions / Wrangler

// استيراد ملفات الواجهة تلقائياً أثناء عملية البناء والرفع
import htmlContent from './index.html';
import cssContent from './style.css';
import jsContent from './app.js';

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

    // ==========================================
    // AUTOMATIC FRONTEND ROUTING
    // ==========================================
    
    // عرض الصفحة الرئيسية تلقائياً
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // عرض ملف الـ CSS تلقائياً
    if (url.pathname === '/style.css') {
      return new Response(cssContent, {
        headers: { 'Content-Type': 'text/css; charset=utf-8' }
      });
    }

    // عرض ملف الـ JS تلقائياً
    if (url.pathname === '/app.js') {
      return new Response(jsContent, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
      });
    }

    // ==========================================
    // BACKEND API ROUTES
    // ==========================================
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

  // Scheduled task — runs every hour via cron
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDataFetch(env));
  }
};

/* ==========================================
   SCHEDULED FETCH
========================================== */
async function runDataFetch(env) {
  console.log('[EarnRadar] Starting hourly data fetch...');
  const results = [];

  // 1. Hacker News — top stories related to earning/money
  try {
    const hn = await fetchHackerNews();
    results.push(...hn);
  } catch(e) { console.error('HN fetch failed:', e.message); }

  // 2. Reddit r/beermoney, r/passive_income, r/slavelabour
  try {
    const reddit = await fetchReddit();
    results.push(...reddit);
  } catch(e) { console.error('Reddit fetch failed:', e.message); }

  // 3. RemoteOK RSS
  try {
    const remote = await fetchRemoteOK();
    results.push(...remote);
  } catch(e) { console.error('RemoteOK fetch failed:', e.message); }

  // 4. Product Hunt (new AI tools that pay)
  try {
    const ph = await fetchProductHunt();
    results.push(...ph);
  } catch(e) { console.error('PH fetch failed:', e.message); }

  // Deduplicate by URL
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Save to KV
  await env.EARN_KV.put('opportunities', JSON.stringify(unique), {
    expirationTtl: 7200 // 2 hours
  });

  await env.EARN_KV.put('last_updated', new Date().toISOString());
  await env.EARN_KV.put('stats', JSON.stringify({
    total: unique.length,
    lastFetch: new Date().toISOString(),
    sources: ['hackernews', 'reddit', 'remoteok', 'producthunt']
  }));

  console.log(`[EarnRadar] Saved ${unique.length} opportunities`);
}

/* ==========================================
   HACKER NEWS FETCH
========================================== */
async function fetchHackerNews() {
  const keywords = ['earn', 'money', 'income', 'freelance', 'remote', 'side hustle', 'passive'];
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json();

  const stories = await Promise.allSettled(
    ids.slice(0, 30).map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
    )
  );

  return stories
    .filter(s => s.status === 'fulfilled' && s.value?.url)
    .map(s => s.value)
    .filter(s => keywords.some(k => (s.title || '').toLowerCase().includes(k)))
    .map(s => ({
      id: `hn_${s.id}`,
      title: s.title,
      description: `مقال من Hacker News — ${s.score} نقطة | ${s.descendants || 0} تعليق`,
      fullDescription: s.title,
      category: 'other',
      status: 'new',
      emoji: '💡',
      earnings: 'متفاوت',
      earningLevel: 'medium',
      trustScore: 7.5,
      rating: (s.score / 100).toFixed(1) > 5 ? 5 : (s.score / 100).toFixed(1),
      reviews: s.descendants || 0,
      country: 'عالمي',
      devices: 'both',
      payment: ['paypal', 'bank'],
      minWithdraw: 'متفاوت',
      isFree: true,
      difficulty: 'متوسط',
      timeRequired: 'متفاوت',
      url: s.url,
      tags: ['hacker-news', 'online-income'],
      source: 'hackernews',
      publishedAt: new Date(s.time * 1000).toISOString(),
      views: s.score || 0
    }));
}

/* ==========================================
   REDDIT FETCH
========================================== */
async function fetchReddit() {
  const subs = ['beermoney', 'passive_income', 'WorkOnline'];
  const results = [];

  for (const sub of subs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { 'User-Agent': 'EarnRadar/1.0' }
      });
      const data = await res.json();
      const posts = data.data?.children || [];

      results.push(...posts
        .filter(p => p.data.score > 50)
        .map(p => ({
          id: `reddit_${p.data.id}`,
          title: p.data.title,
          description: (p.data.selftext || p.data.title).substring(0, 200),
          fullDescription: p.data.selftext || p.data.title,
          category: sub === 'passive_income' ? 'other' : 'freelance',
          status: p.data.score > 500 ? 'trending' : 'new',
          emoji: '🌐',
          earnings: 'متفاوت',
          earningLevel: 'medium',
          trustScore: Math.min(9, 6 + p.data.score / 1000),
          rating: Math.min(5, 3.5 + p.data.upvote_ratio),
          reviews: p.data.num_comments,
          country: 'عالمي',
          devices: 'both',
          payment: ['paypal'],
          minWithdraw: 'متفاوت',
          isFree: true,
          difficulty: 'متفاوت',
          timeRequired: 'متفاوت',
          url: `https://reddit.com${p.data.permalink}`,
          tags: ['reddit', sub, 'online-income'],
          source: 'reddit',
          publishedAt: new Date(p.data.created_utc * 1000).toISOString(),
          views: p.data.score
        }))
      );
    } catch(e) { /* skip this sub */ }
  }

  return results;
}

/* ==========================================
   REMOTEOK FETCH
========================================== */
async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'EarnRadar/1.0' }
  });
  const jobs = await res.json();

  return jobs.slice(1, 20) // skip first meta object
    .filter(j => j.position)
    .map(j => ({
      id: `rok_${j.id}`,
      title: `${j.position} — ${j.company}`,
      description: (j.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
      fullDescription: (j.description || '').replace(/<[^>]+>/g, ''),
      category: 'remote',
      status: 'new',
      emoji: '💻',
      earnings: j.salary_min ? `$${j.salary_min} - $${j.salary_max}/سنة` : 'متفاوت',
      earningLevel: j.salary_min > 100000 ? 'high' : j.salary_min > 50000 ? 'medium' : 'low',
      trustScore: 8.5,
      rating: 4.2,
      reviews: 0,
      country: 'عالمي (عن بعد)',
      devices: 'desktop',
      payment: ['bank'],
      minWithdraw: 'شهري',
      isFree: true,
      difficulty: j.position.toLowerCase().includes('senior') ? 'متقدم' : 'متوسط',
      timeRequired: 'دوام كامل',
      url: j.url,
      tags: (j.tags || []).slice(0, 5),
      source: 'remoteok',
      publishedAt: j.date || new Date().toISOString(),
      views: 0
    }));
}

/* ==========================================
   PRODUCT HUNT FETCH
========================================== */
async function fetchProductHunt() {
  const res = await fetch('https://www.producthunt.com/feed', {
    headers: { 'User-Agent': 'EarnRadar/1.0' }
  });
  const text = await res.text();

  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const item = match[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(item) || [])[1] || '';
    const link = (/<link>(.*?)<\/link>/.exec(item) || [])[1] || '';
    const desc = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(item) || [])[1]?.replace(/<[^>]+>/g, '').substring(0, 200) || '';
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(item) || [])[1] || '';

    if (title && link) {
      // تم استبدال الـ Buffer المتعارض ليعتمد على جزء الرابط المميز كـ ID فريد ومتوافق
      const cleanSlug = link.split('/').pop() || Math.random().toString(36).substring(2, 7);

      items.push({
        id: `ph_${cleanSlug}`,
        title,
        description: desc || title,
        fullDescription: desc || title,
        category: 'ai',
        status: 'new',
        emoji: '🚀',
        earnings: 'متفاوت',
        earningLevel: 'medium',
        trustScore: 7.8,
        rating: 4.0,
        reviews: 0,
        country: 'عالمي',
        devices: 'both',
        payment: ['paypal', 'bank'],
        minWithdraw: 'متفاوت',
        isFree: true,
        difficulty: 'متفاوت',
        timeRequired: 'متفاوت',
        url: link,
        tags: ['product-hunt', 'startup', 'ai'],
        source: 'producthunt',
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        views: 0
      });
    }
  }

  return items.slice(0, 10);
}

/* ==========================================
   API HANDLERS
========================================== */
async function handleOpportunities(request, env, headers) {
  try {
    const cached = await env.EARN_KV.get('opportunities');
    if (cached) {
      return new Response(cached, { headers });
    }
    await runDataFetch(env);
    const fresh = await env.EARN_KV.get('opportunities');
    return new Response(fresh || '[]', { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

async function handleTrending(env, headers) {
  try {
    const cached = await env.EARN_KV.get('opportunities');
    const opps = JSON.parse(cached || '[]');
    const trending = opps.filter(o => o.status === 'trending' || o.views > 10000).slice(0, 10);
    return new Response(JSON.stringify(trending), { headers });
  } catch(e) {
    return new Response(JSON.stringify([]), { headers });
  }
}

async function handleStats(env, headers) {
  try {
    const stats = await env.EARN_KV.get('stats');
    return new Response(stats || '{}', { headers });
  } catch(e) {
    return new Response('{}', { headers });
  }
}
