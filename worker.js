// EarnRadar — Cloudflare Worker v4
// Target: earnradar.manasa.workers.dev

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
    if (path === '/api/opportunities') return handleOpps(env, cors);
    if (path === '/api/stats') return handleStats(env, cors);
    if (path === '/api/rate' && request.method === 'POST') return handleRate(request, env, cors);
    if (path === '/api/refresh') {
      ctx.waitUntil(fetchSources(env));
      return new Response(JSON.stringify({ok:true}), { headers: cors });
    }
    if (path === '/manifest.json') {
      return new Response(JSON.stringify({
        name:'EarnRadar',short_name:'EarnRadar',start_url:'/',display:'standalone',
        background_color:'#0A0E1A',theme_color:'#00D4AA',
        icons:[{src:'/icon.png',sizes:'192x192',type:'image/png'}]
      }), { headers: {'Content-Type':'application/manifest+json'} });
    }
    if (path === '/sw.js') {
      return new Response(SW_CONTENT, {
        headers: {'Content-Type':'application/javascript','Service-Worker-Allowed':'/'}
      });
    }
    if (path === '/app.js') {
      return new Response(APP_CONTENT, {
        headers: {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=300'}
      });
    }
    return new Response(HTML_CONTENT, {
      headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60','X-Frame-Options':'DENY'}
    });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchSources(env));
  }
};

const HTML_CONTENT = "<!DOCTYPE html>\n<html lang=\"en\" dir=\"ltr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1\">\n<meta name=\"description\" content=\"Smart platform to discover online earning opportunities - auto-updated from trusted sources\">\n<meta name=\"theme-color\" content=\"#00D4AA\">\n<title>EarnRadar - Smart Earning Opportunities</title>\n<link rel=\"manifest\" href=\"/manifest.json\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link href=\"https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Cairo:wght@400;600;700&display=swap\" rel=\"stylesheet\">\n<style>:root{--bg:#0A0E1A;--bg2:#111827;--card:#1A2035;--card2:#1E2640;--accent:#00D4AA;--aglow:rgba(0,212,170,.15);--adark:#00A882;--ember:#FF6B35;--gold:#FFB800;--txt:#F0F4FF;--txt2:#8B9CC8;--muted:#4A5578;--bdr:rgba(255,255,255,.07);--bdra:rgba(0,212,170,.3);--r:14px;--rs:8px;--sh:0 4px 24px rgba(0,0,0,.4);--shg:0 0 30px rgba(0,212,170,.1);--fa:'Cairo',sans-serif;--fe:'Space Grotesk',sans-serif;--tr:.2s cubic-bezier(.4,0,.2,1)}[data-theme=light]{--bg:#F0F4FF;--bg2:#E8EDF8;--card:#fff;--card2:#F5F8FF;--txt:#0A0E1A;--txt2:#3D4A6B;--muted:#8B9CC8;--bdr:rgba(0,0,0,.08);--sh:0 4px 24px rgba(0,0,0,.08)}*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:var(--fa);background:var(--bg);color:var(--txt);line-height:1.6;overflow-x:hidden;transition:background .3s,color .3s}[lang=en] body,[lang=fr] body,[lang=tr] body,[lang=es] body{font-family:var(--fe)}.container{max-width:1280px;margin:0 auto;padding:0 16px}.ob{display:none;background:var(--ember);color:#fff;text-align:center;padding:8px;font-size:.85rem;position:fixed;top:0;left:0;right:0;z-index:9999}.ob.show{display:block}.hdr{position:sticky;top:0;z-index:100;background:rgba(10,14,26,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr)}[data-theme=light] .hdr{background:rgba(240,244,255,.95)}.hi{display:flex;align-items:center;gap:10px;padding:11px 0;min-height:56px}.logo{font-family:var(--fe);font-weight:700;font-size:1rem;color:var(--txt);text-decoration:none;flex-shrink:0;white-space:nowrap}.logo b{color:var(--accent)}.badge{font-size:.55rem;background:var(--ember);color:#fff;padding:2px 5px;border-radius:4px;animation:blink 1.5s infinite;margin-left:4px}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}.nav{display:none;gap:2px}@media(min-width:900px){.nav{display:flex}}.nl{color:var(--txt2);text-decoration:none;font-size:.85rem;padding:5px 10px;border-radius:var(--rs);transition:var(--tr)}.nl:hover,.nl.active{color:var(--accent);background:var(--aglow)}.hr{display:flex;align-items:center;gap:6px;margin-left:auto}[dir=rtl] .hr{margin-left:unset;margin-right:auto}.hbtn{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);width:36px;height:36px;border-radius:var(--rs);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;transition:var(--tr)}.hbtn:hover{color:var(--accent);border-color:var(--bdra)}.lsel{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:6px 5px;border-radius:var(--rs);cursor:pointer;font-size:.76rem;outline:none;max-width:76px}.ibtn{background:var(--accent);color:#0A0E1A;border:none;padding:6px 10px;border-radius:var(--rs);cursor:pointer;font-size:.85rem;font-weight:700;display:none}.ibtn.show{display:flex;align-items:center;gap:4px}.burger{display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);cursor:pointer}@media(min-width:900px){.burger{display:none}}.burger span{width:18px;height:2px;background:var(--txt2);display:block}.mm{display:none;flex-direction:column;position:fixed;inset:0;background:var(--bg2);z-index:500;padding:20px;gap:10px;overflow-y:auto}.mm.open{display:flex}.mmh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.mmc{background:none;border:none;color:var(--txt);font-size:1.5rem;cursor:pointer}.mm a{color:var(--txt);text-decoration:none;font-size:1.05rem;padding:13px 15px;background:var(--card);border-radius:var(--r);border:1px solid var(--bdr);transition:var(--tr);display:block}.mm a:hover{border-color:var(--bdra);color:var(--accent)}.sb{padding:10px 0;border-top:1px solid var(--bdr);background:var(--bg2)}.sbw{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--bdra);border-radius:var(--r);padding:10px 14px;color:var(--muted)}.sbw input{flex:1;background:none;border:none;color:var(--txt);font-size:1rem;outline:none;min-width:0;font-family:inherit}.sbw input::placeholder{color:var(--muted)}.sbw button{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem}.sres{margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:55vh;overflow-y:auto}.ood{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra);border-radius:var(--r);padding:18px 20px;margin:18px 0;position:relative;overflow:hidden;cursor:pointer}.ood::before{content:\"\";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember))}.oodl{font-size:.68rem;font-weight:800;letter-spacing:.1em;color:var(--accent);margin-bottom:6px}.oodt{font-size:1.05rem;font-weight:700;margin-bottom:4px}.oode{color:var(--accent);font-size:.88rem;font-weight:600}.tw{display:flex;align-items:center;background:var(--bg2);border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);overflow:hidden;height:36px}.tl{background:var(--ember);color:#fff;font-size:.68rem;font-weight:700;padding:0 10px;height:100%;display:flex;align-items:center;flex-shrink:0;white-space:nowrap}.tt{overflow:hidden;flex:1}.ti{display:flex;gap:40px;animation:ticker 35s linear infinite;white-space:nowrap;font-size:.78rem;color:var(--txt2)}.ti:hover{animation-play-state:paused}@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}.tic{display:inline-flex;align-items:center;gap:6px}.tc{color:var(--accent)}.fb{background:rgba(10,14,26,.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr);padding:9px 0;position:sticky;top:56px;z-index:90}[data-theme=light] .fb{background:rgba(240,244,255,.97)}.fi{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.fi::-webkit-scrollbar{display:none}.chips{display:flex;gap:5px;flex-shrink:0}.chip{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 11px;border-radius:100px;font-size:.76rem;cursor:pointer;white-space:nowrap;transition:var(--tr);font-family:inherit}.chip:hover,.chip.active{background:var(--accent);color:#0A0E1A;font-weight:700;border-color:var(--accent)}.fw{display:none;gap:5px;margin-left:auto;flex-shrink:0}[dir=rtl] .fw{margin-left:unset;margin-right:auto}@media(min-width:768px){.fw{display:flex}}.fsel{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 8px;border-radius:var(--rs);font-size:.76rem;cursor:pointer;outline:none;font-family:inherit}.fsel:hover{border-color:var(--bdra)}.main{padding:26px 0 60px}.layout{display:grid;grid-template-columns:1fr;gap:20px}@media(min-width:1024px){.layout{grid-template-columns:1fr 285px}}.sec{margin-bottom:30px}.sech{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;gap:8px;flex-wrap:wrap}.sect{font-size:1.05rem;font-weight:700;display:flex;align-items:center;gap:8px}.bn{background:var(--accent);color:#0A0E1A;font-size:.6rem;padding:2px 7px;border-radius:4px;font-weight:800}.sa{color:var(--accent);text-decoration:none;font-size:.82rem}.rc{font-size:.78rem;color:var(--muted);background:var(--card);padding:3px 9px;border-radius:100px;border:1px solid var(--bdr)}.rb{background:var(--card);border:1px solid var(--bdr);color:var(--txt2);padding:5px 11px;border-radius:var(--rs);cursor:pointer;font-size:.76rem;display:flex;align-items:center;gap:5px;transition:var(--tr);font-family:inherit}.rb:hover{color:var(--accent);border-color:var(--bdra)}.grid{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:480px){.grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:1280px){.grid{grid-template-columns:repeat(3,1fr)}}.card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:var(--tr);position:relative;display:flex;flex-direction:column}.card:hover{transform:translateY(-3px);border-color:var(--bdra);box-shadow:var(--sh),var(--shg)}.card::after{content:\"\";position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--ember));transform:scaleX(0);transform-origin:right;transition:transform .3s}.card:hover::after{transform:scaleX(1);transform-origin:left}.ct{width:100%;height:110px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:2.5rem;position:relative}.cs{position:absolute;top:8px;right:8px;font-size:.6rem;padding:2px 7px;border-radius:4px;font-weight:800}[dir=rtl] .cs{right:unset;left:8px}.sn{background:var(--aglow);color:var(--accent);border:1px solid var(--bdra)}.st{background:rgba(255,107,53,.15);color:var(--ember);border:1px solid rgba(255,107,53,.3)}.sr2{background:rgba(255,184,0,.1);color:var(--gold);border:1px solid rgba(255,184,0,.3)}.cb{padding:12px;flex:1;display:flex;flex-direction:column;gap:7px}.ct2{font-size:.88rem;font-weight:600;color:var(--txt);line-height:1.4}.cd{font-size:.76rem;color:var(--txt2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}.cm{display:flex;flex-wrap:wrap;gap:4px;margin-top:auto}.me{font-size:.68rem;color:var(--muted);background:var(--bg2);padding:2px 6px;border-radius:4px}.earn{color:var(--accent)}.trust{color:var(--gold)}.stars{display:flex;gap:2px;padding:4px 12px 6px;align-items:center;font-size:.72rem;color:var(--muted)}.stars span{font-size:.95rem;cursor:pointer;color:var(--bdr);transition:color .15s}.stars span.on,.stars span:hover{color:var(--gold)}.cbtns{display:flex;gap:4px;padding:0 12px 10px}.cbtn{flex:1;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:5px 3px;border-radius:var(--rs);cursor:pointer;font-size:.67rem;transition:var(--tr);font-family:inherit;text-align:center;white-space:nowrap}.cbtn:hover{border-color:var(--bdra);color:var(--accent)}.cf{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--bdr);background:rgba(255,255,255,.015)}.ccat{font-size:.66rem;color:var(--accent);font-weight:600}.cst{font-size:.7rem;color:var(--gold)}.ctm{font-size:.66rem;color:var(--muted)}.lm{background:transparent;border:1px solid var(--bdr);color:var(--txt2);padding:10px 30px;border-radius:var(--r);cursor:pointer;font-size:.86rem;transition:var(--tr);font-family:inherit}.lm:hover{border-color:var(--accent);color:var(--accent)}.sk{background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:var(--rs)}@keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}.skc{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden}.ski{height:110px}.skb{padding:12px;display:flex;flex-direction:column;gap:8px}.skl{height:12px;border-radius:4px}.w100{width:100%}.w75{width:75%}.w50{width:50%}.sidebar{display:flex;flex-direction:column;gap:13px}@media(min-width:1024px){.sidebar{position:sticky;top:108px}}.sbc{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:15px}.sbt{font-size:.88rem;font-weight:700;margin-bottom:12px}.tri{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bdr);cursor:pointer;transition:var(--tr)}.tri:last-child{border-bottom:none}.tri:hover .trn{color:var(--accent)}.trr{width:22px;height:22px;background:var(--bg2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0}.rkg{background:var(--gold);color:#0A0E1A}.rks{background:#C0C0C0;color:#0A0E1A}.rkb{background:#CD7F32;color:#0A0E1A}.tri-i{flex:1;min-width:0}.trn{font-size:.76rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:var(--tr)}.tre{font-size:.68rem;color:var(--accent)}.catr{display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:7px}.catr:hover .catnm{color:var(--accent)}.cati{font-size:.9rem;width:20px;text-align:center}.catnm{font-size:.76rem;flex:1;transition:var(--tr)}.catcnt{font-size:.68rem;background:var(--bg2);padding:2px 6px;border-radius:100px;color:var(--muted)}.cbw{height:2px;background:var(--bdr);border-radius:2px;margin-top:2px}.cbar{height:100%;background:var(--accent);border-radius:2px;transition:width .8s}.sri{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)}.sri:last-child{border-bottom:none}.srd{width:7px;height:7px;border-radius:50%;flex-shrink:0}.srd.active{background:var(--accent)}.srd.error{background:var(--ember)}.srn{font-size:.76rem;flex:1}.src2{font-size:.66rem;color:var(--muted)}.cc{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--bdra)}.ccr{margin-bottom:9px}.ccl{font-size:.72rem;color:var(--txt2);margin-bottom:4px;display:block}.ccv{text-align:center;font-size:.78rem;color:var(--accent);margin-top:3px}.ccres{background:var(--bg);border:1px solid var(--bdra);border-radius:var(--rs);padding:10px;text-align:center;margin-top:10px}.ccrl{font-size:.68rem;color:var(--muted);margin-bottom:3px}.ccn{font-size:1.4rem;font-weight:700;color:var(--accent)}.mst{display:flex;flex-wrap:wrap;gap:5px}.mstg{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:3px 9px;border-radius:100px;font-size:.72rem;cursor:pointer;transition:var(--tr)}.mstg:hover{border-color:var(--bdra);color:var(--accent)}.mo{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:200;display:none;align-items:flex-end;justify-content:center}@media(min-width:600px){.mo{align-items:center;padding:20px}}.mo.active{display:flex}.modal{background:var(--card);border:1px solid var(--bdra);border-radius:20px 20px 0 0;width:100%;max-width:680px;max-height:92vh;overflow-y:auto;position:relative;animation:mi .3s ease}@media(min-width:600px){.modal{border-radius:20px;max-height:85vh}}@keyframes mi{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}.mc{position:sticky;top:12px;right:12px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:.85rem;float:right;margin:12px 12px 0 0;display:flex;align-items:center;justify-content:center;z-index:10;transition:var(--tr)}[dir=rtl] .mc{float:left;margin:12px 0 0 12px}.mc:hover{background:var(--ember);color:#fff}.mth{width:100%;height:160px;background:linear-gradient(135deg,var(--bg2),var(--card));display:flex;align-items:center;justify-content:center;font-size:3.5rem;clear:both}.mb{padding:18px}.mcat{font-size:.68rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px}.mtt{font-size:1.2rem;font-weight:700;margin-bottom:9px;line-height:1.3}.mds{color:var(--txt2);font-size:.86rem;margin-bottom:18px;line-height:1.7}.mgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:18px}@media(max-width:480px){.mgrid{grid-template-columns:1fr}}.mdi{background:var(--bg2);border-radius:var(--rs);padding:9px}.mdl{font-size:.66rem;color:var(--muted);margin-bottom:3px}.mdv{font-size:.82rem;font-weight:600}.gn{color:var(--accent)}.or{color:var(--ember)}.gd{color:var(--gold)}.mtags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:18px}.tag{background:var(--bg2);border:1px solid var(--bdr);color:var(--muted);padding:2px 8px;border-radius:4px;font-size:.7rem}.ma{display:flex;gap:8px;flex-wrap:wrap}.bv{flex:1;min-width:110px;background:var(--accent);color:#0A0E1A;padding:11px;border-radius:var(--r);text-decoration:none;text-align:center;font-weight:700;font-size:.88rem;transition:var(--tr)}.bv:hover{background:var(--adark)}.bma{background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);padding:11px 13px;border-radius:var(--r);cursor:pointer;font-size:.82rem;transition:var(--tr);font-family:inherit;white-space:nowrap}.bma:hover{border-color:var(--bdra);color:var(--accent)}.cmo{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:300;display:none;align-items:center;justify-content:center;padding:16px}.cmo.active{display:flex}.cmob{background:var(--card);border:1px solid var(--bdra);border-radius:20px;width:100%;max-width:860px;max-height:90vh;overflow-y:auto;padding:20px;position:relative}.cmoc{position:absolute;top:14px;right:14px;background:var(--bg2);border:1px solid var(--bdr);color:var(--txt2);width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center}.cmog{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}@media(max-width:600px){.cmog{grid-template-columns:1fr}}.cmoc2 h3{font-size:.92rem;font-weight:700;margin-bottom:10px;text-align:center;color:var(--accent)}.cmof{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bdr);font-size:.79rem}.cmof:last-child{border-bottom:none}.cmol{color:var(--muted)}.cmov{font-weight:600}.smo{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:none;align-items:flex-end;justify-content:center}.smo.active{display:flex}@media(min-width:600px){.smo{align-items:center;padding:16px}}.smob{background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:420px;padding:20px;border:1px solid var(--bdra)}@media(min-width:600px){.smob{border-radius:20px}}.smot{font-size:.95rem;font-weight:700;margin-bottom:13px;text-align:center}.smbtn{display:flex;align-items:center;gap:11px;padding:11px 14px;background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--rs);cursor:pointer;font-size:.87rem;color:var(--txt);transition:var(--tr);font-family:inherit;width:100%;margin-bottom:8px}.smbtn:hover{border-color:var(--bdra);color:var(--accent)}.smcan{background:none;border:1px solid var(--bdr);color:var(--txt2);padding:9px;border-radius:var(--rs);cursor:pointer;width:100%;margin-top:4px;font-size:.87rem;font-family:inherit}.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card);border:1px solid var(--bdra);color:var(--txt);padding:11px 18px;border-radius:var(--r);font-size:.83rem;box-shadow:var(--sh);z-index:999;opacity:0;transition:all .3s;max-width:90vw;text-align:center;white-space:nowrap;pointer-events:none}.toast.show{transform:translateX(-50%) translateY(0);opacity:1}.footer{background:var(--bg2);border-top:1px solid var(--bdr);padding:40px 0 20px}.fg{display:grid;grid-template-columns:1fr;gap:26px;margin-bottom:26px}@media(min-width:600px){.fg{grid-template-columns:repeat(2,1fr)}}@media(min-width:900px){.fg{grid-template-columns:2fr 1fr 1fr}}.fsoc{width:32px;height:32px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--txt2);font-size:.82rem;transition:var(--tr);margin-right:6px}.fsoc:hover{border-color:var(--bdra);color:var(--accent)}.fl{color:var(--txt2);text-decoration:none;font-size:.76rem;transition:var(--tr)}.fl:hover{color:var(--accent)}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--card);border-radius:2px}</style>\n</head>\n<body>\n<div id=\"ob\" class=\"ob\"></div>\n<div id=\"mmenu\" class=\"mm\">\n  <div class=\"mmh\"><div class=\"logo\"><b>&#9711;</b> EarnRadar</div><button id=\"mmclose\" class=\"mmc\">&#10005;</button></div>\n  <a href=\"#\" id=\"mmhome\" data-k=\"navHome\">&#127968; Home</a>\n  <a href=\"#categories\" id=\"mmcats\" data-k=\"navCats\">&#128194; Categories</a>\n  <a href=\"#trending\" id=\"mmtrend\" data-k=\"navTrending\">&#128293; Trending</a>\n  <a href=\"#\" id=\"mmsaved\" data-k=\"navSaved\">&#128278; Saved</a>\n</div>\n<header class=\"hdr\">\n  <div class=\"container\">\n    <div class=\"hi\">\n      <a href=\"/\" class=\"logo\" id=\"logobtn\"><b>&#9711;</b> EarnRadar <span class=\"badge\">LIVE</span></a>\n      <nav class=\"nav\">\n        <a href=\"#\" class=\"nl active\" id=\"navhome\" data-k=\"navHome\">Home</a>\n        <a href=\"#categories\" class=\"nl\" data-k=\"navCats\">Categories</a>\n        <a href=\"#trending\" class=\"nl\" data-k=\"navTrending\">Trending</a>\n        <a href=\"#\" class=\"nl\" id=\"navsaved\" data-k=\"navSaved\">Saved</a>\n      </nav>\n      <div class=\"hr\">\n        <button class=\"hbtn\" id=\"stbtn\">&#128269;</button>\n        <button class=\"hbtn\" id=\"themeBtn\">&#9728;&#65039;</button>\n        <select id=\"lsel\" class=\"lsel\"><option value=\"en\">&#127482;&#127480; EN</option><option value=\"ar\">&#127462;&#127479; AR</option><option value=\"fr\">&#127467;&#127479; FR</option><option value=\"tr\">&#127481;&#127479; TR</option><option value=\"es\">&#127466;&#127480; ES</option></select>\n        <button id=\"ibtn\" class=\"ibtn\">&#128241;</button>\n        <button id=\"burgbtn\" class=\"burger\"><span></span><span></span><span></span></button>\n      </div>\n    </div>\n  </div>\n  <div id=\"sbar\" class=\"sb\" style=\"display:none\">\n    <div class=\"container\">\n      <div class=\"sbw\">&#128269; <input id=\"sinput\" type=\"text\" placeholder=\"Search...\" autocomplete=\"off\"> <button id=\"scbtn\">&#10005;</button></div>\n      <div id=\"sres\" class=\"sres\"></div>\n    </div>\n  </div>\n</header>\n<div id=\"hv\">\n  <div class=\"container\">\n    <div id=\"ood\" class=\"ood\">\n      <div class=\"oodl\" data-k=\"oppOfDay\">&#9889; OPPORTUNITY OF THE DAY</div>\n      <div id=\"oodt\" class=\"oodt\">Loading...</div>\n      <div id=\"oode\" class=\"oode\"></div>\n    </div>\n  </div>\n  <div class=\"tw\"><div class=\"tl\">&#128308; LIVE</div><div class=\"tt\"><div id=\"ticker\" class=\"ti\"></div></div></div>\n  <div class=\"fb\">\n    <div class=\"container\">\n      <div class=\"fi\">\n        <div class=\"chips\" id=\"chips\">\n          <button class=\"chip active\" data-cat=\"all\"><span data-k=\"catAll\">All</span></button>\n          <button class=\"chip\" data-cat=\"freelance\"><span class=\"cn\" data-id=\"freelance\">Freelance</span></button><button class=\"chip\" data-cat=\"ai\"><span class=\"cn\" data-id=\"ai\">AI Tools</span></button><button class=\"chip\" data-cat=\"surveys\"><span class=\"cn\" data-id=\"surveys\">Surveys</span></button><button class=\"chip\" data-cat=\"affiliate\"><span class=\"cn\" data-id=\"affiliate\">Affiliate</span></button><button class=\"chip\" data-cat=\"referral\"><span class=\"cn\" data-id=\"referral\">Referrals</span></button><button class=\"chip\" data-cat=\"cashback\"><span class=\"cn\" data-id=\"cashback\">Cashback</span></button><button class=\"chip\" data-cat=\"apps\"><span class=\"cn\" data-id=\"apps\">Apps</span></button><button class=\"chip\" data-cat=\"contests\"><span class=\"cn\" data-id=\"contests\">Contests</span></button><button class=\"chip\" data-cat=\"remote\"><span class=\"cn\" data-id=\"remote\">Remote Jobs</span></button><button class=\"chip\" data-cat=\"crypto\"><span class=\"cn\" data-id=\"crypto\">Crypto</span></button><button class=\"chip\" data-cat=\"grants\"><span class=\"cn\" data-id=\"grants\">Grants</span></button><button class=\"chip\" data-cat=\"testing\"><span class=\"cn\" data-id=\"testing\">Testing</span></button><button class=\"chip\" data-cat=\"trading\"><span class=\"cn\" data-id=\"trading\">Trading</span></button><button class=\"chip\" data-cat=\"other\"><span class=\"cn\" data-id=\"other\">Other</span></button>\n        </div>\n        <div class=\"fw\">\n          <select class=\"fsel\" id=\"sortSel\"><option value=\"newest\" data-k=\"sortNewest\">Newest</option><option value=\"trending\">Trending</option><option value=\"rated\">Top Rated</option><option value=\"earning\">Top Earning</option></select>\n          <select class=\"fsel\" id=\"devSel\"><option value=\"all\">All Devices</option><option value=\"mobile\">Mobile</option><option value=\"desktop\">Desktop</option><option value=\"both\">Both</option></select>\n          <select class=\"fsel\" id=\"paySel\"><option value=\"all\">Payment</option><option value=\"paypal\">PayPal</option><option value=\"bank\">Bank</option><option value=\"crypto\">Crypto</option><option value=\"gift\">Gift Cards</option></select>\n        </div>\n      </div>\n    </div>\n  </div>\n  <main class=\"main\">\n    <div class=\"container\">\n      <div class=\"layout\">\n        <div>\n          <section class=\"sec\"><div class=\"sech\"><h2 class=\"sect\"><span class=\"bn\">NEW</span> <span data-k=\"newToday\">New Today</span></h2><button id=\"rbtn\" class=\"rb\">&#8635; <span data-k=\"refresh\">Refresh</span></button></div><div class=\"grid\" id=\"ng\"></div></section>\n          <section class=\"sec\" id=\"trending\"><div class=\"sech\"><h2 class=\"sect\" data-k=\"trending\">Trending</h2><a href=\"#aopps\" class=\"sa\">View All &#8594;</a></div><div class=\"grid\" id=\"tg\"></div></section>\n          <section class=\"sec\" id=\"aopps\"><div class=\"sech\"><h2 class=\"sect\" data-k=\"allOpps\">All Opportunities</h2><span id=\"rc\" class=\"rc\">0</span></div><div class=\"grid\" id=\"mg\"></div><div style=\"text-align:center;margin-top:18px\"><button id=\"lmbtn\" class=\"lm\" data-k=\"loadMore\">Load More</button></div></section>\n        </div>\n        <aside class=\"sidebar\" id=\"categories\">\n          <div class=\"sbc\"><h3 class=\"sbt\" data-k=\"topRated\">&#11088; Top Rated</h3><div id=\"trl\"></div></div>\n          <div class=\"sbc cc\">\n            <div class=\"sbt\" data-k=\"calculator\">&#128176; Income Calculator</div>\n            <div class=\"ccr\"><label class=\"ccl\" data-k=\"calcHours\">Hours/day</label><input type=\"range\" id=\"cch\" min=\"1\" max=\"12\" value=\"4\" oninput=\"calcUpdate()\" style=\"width:100%;accent-color:var(--accent)\"><div class=\"ccv\"><span id=\"cchv\">4</span>h</div></div>\n            <div class=\"ccr\"><label class=\"ccl\" data-k=\"calcDays\">Days/week</label><input type=\"range\" id=\"ccd\" min=\"1\" max=\"7\" value=\"5\" oninput=\"calcUpdate()\" style=\"width:100%;accent-color:var(--accent)\"><div class=\"ccv\"><span id=\"ccdv\">5</span>d</div></div>\n            <div class=\"ccr\"><label class=\"ccl\" data-k=\"calcSkill\">Skill level</label><select id=\"ccs\" onchange=\"calcUpdate()\" class=\"fsel\" style=\"width:100%\"><option value=\"1\">Beginner</option><option value=\"2.5\" selected>Intermediate</option><option value=\"6\">Expert</option></select></div>\n            <div class=\"ccres\"><div class=\"ccrl\" data-k=\"calcResult\">Monthly estimate</div><div id=\"ccn\" class=\"ccn\">$0</div></div>\n          </div>\n          <div class=\"sbc\" id=\"cat-sidebar\"><h3 class=\"sbt\" data-k=\"categories\">&#128194; Categories</h3><div id=\"cstats\"></div></div>\n          <div class=\"sbc\"><h3 class=\"sbt\" data-k=\"mostSearched\">&#128269; Most Searched</h3><div id=\"mstags\" class=\"mst\"></div></div>\n          <div class=\"sbc\"><h3 class=\"sbt\" data-k=\"sources\">&#128225; Active Sources</h3><div id=\"srcs\"></div></div>\n        </aside>\n      </div>\n    </div>\n  </main>\n</div>\n<div id=\"sv\" style=\"display:none;padding:32px 0 60px\">\n  <div class=\"container\">\n    <h2 style=\"margin-bottom:20px;font-size:1.2rem\" data-k=\"savedPage\">Saved</h2>\n    <div class=\"grid\" id=\"sgrid\"></div>\n    <div id=\"nsaved\" style=\"display:none;text-align:center;padding:60px 20px;color:var(--muted)\"><div style=\"font-size:3rem\">&#128278;</div><div data-k=\"noSaved\">No saved opportunities yet</div></div>\n  </div>\n</div>\n<div id=\"moverlay\" class=\"mo\"><div class=\"modal\"><button id=\"mcbtn\" class=\"mc\">&#10005;</button><div id=\"mc\"></div></div></div>\n<div id=\"cmo\" class=\"cmo\"><div class=\"cmob\"><button id=\"cmcbtn\" class=\"cmoc\">&#10005;</button><h2 style=\"font-size:1rem;font-weight:700\" data-k=\"compare\">&#9878;&#65039; Compare</h2><div id=\"cmgrid\" class=\"cmog\"></div></div></div>\n<div id=\"smo\" class=\"smo\"><div class=\"smob\"><div class=\"smot\" data-k=\"share\">&#128228; Share</div><div id=\"sbtns\"></div><button id=\"smcan\" class=\"smcan\">&#10005;</button></div></div>\n<div id=\"toastel\" class=\"toast\"></div>\n<footer class=\"footer\">\n  <div class=\"container\">\n    <div class=\"fg\">\n      <div><div class=\"logo\"><b>&#9711;</b> EarnRadar</div><p data-k=\"footerDesc\" style=\"color:var(--txt2);font-size:.8rem;margin:10px 0 14px;line-height:1.7\">Smart platform for online earning opportunities.</p><div><a class=\"fsoc\" href=\"#\">&#120143;</a><a class=\"fsoc\" href=\"#\">&#9992;</a></div></div>\n      <div><h4 data-k=\"footerNav\" style=\"font-size:.82rem;font-weight:700;margin-bottom:10px\">Navigation</h4><ul style=\"list-style:none;display:flex;flex-direction:column;gap:6px\"><li><a href=\"#\" class=\"fl\" data-k=\"navHome\">Home</a></li><li><a href=\"#categories\" class=\"fl\" data-k=\"navCats\">Categories</a></li><li><a href=\"#trending\" class=\"fl\" data-k=\"navTrending\">Trending</a></li></ul></div>\n      <div><h4 data-k=\"footerLegal\" style=\"font-size:.82rem;font-weight:700;margin-bottom:10px\">Legal</h4><ul style=\"list-style:none;display:flex;flex-direction:column;gap:6px\"><li><a href=\"#\" class=\"fl\" data-k=\"footerPrivacy\">Privacy Policy</a></li><li><a href=\"#\" class=\"fl\" data-k=\"footerTerms\">Terms</a></li></ul></div>\n    </div>\n    <div style=\"border-top:1px solid var(--bdr);padding-top:18px;margin-top:26px;text-align:center\">\n      <p style=\"font-size:.73rem;color:var(--muted)\">&#169; 2025 EarnRadar &bull; earnradar.manasa.workers.dev &bull; Auto-updated every hour</p>\n      <p data-k=\"footerDisc\" style=\"font-size:.72rem;color:var(--ember);opacity:.8;margin-top:5px\">&#9888;&#65039; For informational purposes only. Always verify on official sites.</p>\n    </div>\n  </div>\n</footer>\n<script src=\"/app.js\"></script>\n</body></html>";
const APP_CONTENT = "var OPPS=[{\"id\": 1, \"title\": \"Upwork\", \"description\": \"Earn from design, programming, writing on the world's biggest freelance marketplace.\", \"fullDescription\": \"Upwork is the leading global freelance marketplace with thousands of daily projects. Fields include programming, design, writing, and marketing. Start free and earn $5-$200+/hr.\", \"category\": \"freelance\", \"status\": \"recommended\", \"emoji\": \"💼\", \"earnings\": \"$500-$5,000/mo\", \"earningLevel\": \"high\", \"trustScore\": 9.5, \"rating\": 4.7, \"reviews\": 12840, \"country\": \"Worldwide\", \"devices\": \"both\", \"payment\": [\"paypal\", \"bank\", \"payoneer\"], \"minWithdraw\": \"$100\", \"isFree\": true, \"difficulty\": \"Medium\", \"timeRequired\": \"Full or part-time\", \"url\": \"https://upwork.com\", \"tags\": [\"freelance\", \"programming\", \"design\"], \"source\": \"upwork\", \"publishedAt\": \"2026-06-29T11:00:00Z\", \"views\": 28450}, {\"id\": 2, \"title\": \"Scale AI\", \"description\": \"Get paid to evaluate AI responses and improve machine learning models.\", \"fullDescription\": \"Earn by contributing to AI model training. Evaluate model responses, write sample conversations, or test capabilities. Payment via Scale AI and partners.\", \"category\": \"ai\", \"status\": \"trending\", \"emoji\": \"🤖\", \"earnings\": \"$15-$50/hr\", \"earningLevel\": \"medium\", \"trustScore\": 9.8, \"rating\": 4.9, \"reviews\": 3210, \"country\": \"Worldwide\", \"devices\": \"desktop\", \"payment\": [\"paypal\", \"bank\"], \"minWithdraw\": \"$50\", \"isFree\": true, \"difficulty\": \"Medium\", \"timeRequired\": \"Flexible\", \"url\": \"https://scale.ai\", \"tags\": [\"AI\", \"RLHF\", \"data-labeling\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T10:00:00Z\", \"views\": 15200}, {\"id\": 3, \"title\": \"Swagbucks\", \"description\": \"Earn rewards for filling surveys, watching ads, and shopping online.\", \"fullDescription\": \"Swagbucks is one of the oldest and most trusted rewards platforms. Earn SB points for surveys, videos, shopping. 100 SB = $1. Withdraw via PayPal or gift cards.\", \"category\": \"surveys\", \"status\": \"new\", \"emoji\": \"📋\", \"earnings\": \"$50-$300/mo\", \"earningLevel\": \"low\", \"trustScore\": 8.5, \"rating\": 4.2, \"reviews\": 45600, \"country\": \"Worldwide\", \"devices\": \"both\", \"payment\": [\"paypal\", \"gift\"], \"minWithdraw\": \"$3\", \"isFree\": true, \"difficulty\": \"Easy\", \"timeRequired\": \"1 hr/day\", \"url\": \"https://swagbucks.com\", \"tags\": [\"surveys\", \"rewards\", \"cashback\"], \"source\": \"swagbucks\", \"publishedAt\": \"2026-06-29T11:30:00Z\", \"views\": 9870}, {\"id\": 4, \"title\": \"Amazon Associates\", \"description\": \"Earn 1-10% commission on every Amazon sale through your referral links.\", \"fullDescription\": \"Amazon Associates lets you promote millions of products and earn commissions from 1% to 10%. You need a website, YouTube channel, or social media page.\", \"category\": \"affiliate\", \"status\": \"recommended\", \"emoji\": \"🔗\", \"earnings\": \"$100-$10,000/mo\", \"earningLevel\": \"variable\", \"trustScore\": 9.7, \"rating\": 4.5, \"reviews\": 89200, \"country\": \"Worldwide\", \"devices\": \"both\", \"payment\": [\"bank\", \"gift\", \"check\"], \"minWithdraw\": \"$10\", \"isFree\": true, \"difficulty\": \"Medium\", \"timeRequired\": \"Requires existing audience\", \"url\": \"https://affiliate-program.amazon.com\", \"tags\": [\"affiliate\", \"amazon\", \"marketing\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T08:00:00Z\", \"views\": 22100}, {\"id\": 5, \"title\": \"Rakuten\", \"description\": \"Get real cash back shopping from 3,500+ online stores. Up to 40% cashback.\", \"fullDescription\": \"Rakuten gives you real cashback when shopping from brands like Nike, ASOS, Booking.com, eBay. Just install the browser extension or use the site before purchasing.\", \"category\": \"cashback\", \"status\": \"recommended\", \"emoji\": \"💰\", \"earnings\": \"1-40% per purchase\", \"earningLevel\": \"variable\", \"trustScore\": 9.2, \"rating\": 4.6, \"reviews\": 67800, \"country\": \"US, Canada, Europe\", \"devices\": \"both\", \"payment\": [\"paypal\", \"check\"], \"minWithdraw\": \"$5.01\", \"isFree\": true, \"difficulty\": \"Very Easy\", \"timeRequired\": \"No extra time\", \"url\": \"https://rakuten.com\", \"tags\": [\"cashback\", \"shopping\", \"rewards\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T06:00:00Z\", \"views\": 18900}, {\"id\": 6, \"title\": \"UserTesting\", \"description\": \"Earn $10 per 20-minute session testing websites and apps from home.\", \"fullDescription\": \"UserTesting pays everyday users to test websites and apps. Each task takes 10-20 minutes and pays $4-$60. You need a microphone and internet connection.\", \"category\": \"testing\", \"status\": \"trending\", \"emoji\": \"🧪\", \"earnings\": \"$10-$60/task\", \"earningLevel\": \"medium\", \"trustScore\": 8.8, \"rating\": 4.4, \"reviews\": 23100, \"country\": \"Most countries\", \"devices\": \"both\", \"payment\": [\"paypal\"], \"minWithdraw\": \"$10\", \"isFree\": true, \"difficulty\": \"Easy\", \"timeRequired\": \"20 min/task\", \"url\": \"https://usertesting.com\", \"tags\": [\"testing\", \"UX\", \"feedback\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T09:00:00Z\", \"views\": 14500}, {\"id\": 7, \"title\": \"Fiverr\", \"description\": \"Create professional service gigs and sell them to millions of buyers worldwide.\", \"fullDescription\": \"Fiverr lets you offer services starting at $5. Top fields: logo design, content writing, SEO, social media, voice-over, translation, and programming. Fiverr takes 20% commission.\", \"category\": \"freelance\", \"status\": \"recommended\", \"emoji\": \"🌟\", \"earnings\": \"$100-$10,000/mo\", \"earningLevel\": \"high\", \"trustScore\": 9.0, \"rating\": 4.5, \"reviews\": 156000, \"country\": \"Worldwide\", \"devices\": \"both\", \"payment\": [\"paypal\", \"bank\", \"payoneer\"], \"minWithdraw\": \"$20\", \"isFree\": true, \"difficulty\": \"Medium\", \"timeRequired\": \"Flexible\", \"url\": \"https://fiverr.com\", \"tags\": [\"freelance\", \"services\", \"design\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T04:00:00Z\", \"views\": 34200}, {\"id\": 8, \"title\": \"Replit Bounties\", \"description\": \"Earn by solving coding challenges posted by Replit users. Rewards $50-$5,000.\", \"fullDescription\": \"Replit Bounties connects developers with employers seeking technical solutions. Browse tasks, apply, and complete them directly in your browser.\", \"category\": \"freelance\", \"status\": \"new\", \"emoji\": \"💻\", \"earnings\": \"$50-$5,000/task\", \"earningLevel\": \"high\", \"trustScore\": 8.6, \"rating\": 4.3, \"reviews\": 4200, \"country\": \"Worldwide\", \"devices\": \"desktop\", \"payment\": [\"paypal\", \"bank\"], \"minWithdraw\": \"$10\", \"isFree\": true, \"difficulty\": \"Advanced\", \"timeRequired\": \"Per project\", \"url\": \"https://replit.com/bounties\", \"tags\": [\"coding\", \"bounty\", \"projects\"], \"source\": \"hackernews\", \"publishedAt\": \"2026-06-29T11:40:00Z\", \"views\": 8900}, {\"id\": 9, \"title\": \"Binance Earn\", \"description\": \"Earn up to 20% annual interest on your cryptocurrency through Binance Earn.\", \"fullDescription\": \"Binance Earn lets you generate passive income from crypto without trading. Options: Flexible Savings, Locked Staking, Dual Investment, and Launchpool.\", \"category\": \"crypto\", \"status\": \"trending\", \"emoji\": \"₿\", \"earnings\": \"3-20% annually\", \"earningLevel\": \"medium\", \"trustScore\": 8.3, \"rating\": 4.1, \"reviews\": 89500, \"country\": \"Worldwide (some restrictions)\", \"devices\": \"both\", \"payment\": [\"crypto\"], \"minWithdraw\": \"Depends on asset\", \"isFree\": true, \"difficulty\": \"Medium\", \"timeRequired\": \"Long-term investment\", \"url\": \"https://binance.com/earn\", \"tags\": [\"crypto\", \"staking\", \"passive-income\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T07:00:00Z\", \"views\": 19600}, {\"id\": 10, \"title\": \"Y Combinator\", \"description\": \"YC provides $500,000 to each accepted startup plus world-class mentorship.\", \"fullDescription\": \"Y Combinator is the world's most prestigious startup accelerator. Your company gets $500,000 and three months of intensive mentorship, then pitches to hundreds of investors.\", \"category\": \"grants\", \"status\": \"new\", \"emoji\": \"🎓\", \"earnings\": \"$500,000 grant\", \"earningLevel\": \"high\", \"trustScore\": 9.9, \"rating\": 4.9, \"reviews\": 1230, \"country\": \"Worldwide\", \"devices\": \"desktop\", \"payment\": [\"bank\"], \"minWithdraw\": \"N/A\", \"isFree\": true, \"difficulty\": \"Very Hard\", \"timeRequired\": \"Full commitment\", \"url\": \"https://ycombinator.com/apply\", \"tags\": [\"grant\", \"startup\", \"YC\"], \"source\": \"hackernews\", \"publishedAt\": \"2026-06-28T12:00:00Z\", \"views\": 45800}, {\"id\": 11, \"title\": \"99designs\", \"description\": \"Participate in design contests and win $99-$1,299 per winning project.\", \"fullDescription\": \"99designs lets designers join contests where employers post a project and designers submit work. The winner gets the full amount. Great for building your portfolio.\", \"category\": \"contests\", \"status\": \"new\", \"emoji\": \"🏆\", \"earnings\": \"$99-$1,299/win\", \"earningLevel\": \"variable\", \"trustScore\": 8.4, \"rating\": 4.2, \"reviews\": 18900, \"country\": \"Worldwide\", \"devices\": \"desktop\", \"payment\": [\"paypal\", \"bank\"], \"minWithdraw\": \"$20\", \"isFree\": true, \"difficulty\": \"Requires design skills\", \"timeRequired\": \"Per project\", \"url\": \"https://99designs.com\", \"tags\": [\"design\", \"contests\", \"graphic\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T11:45:00Z\", \"views\": 7600}, {\"id\": 12, \"title\": \"Top Referral Programs 2025\", \"description\": \"Guide to the best paid referral programs. Companies pay up to $500 per friend.\", \"fullDescription\": \"Referral programs are among the easiest earning methods. Top programs: Robinhood ($5-$20), Coinbase ($10), Rakuten ($30), Swagbucks ($3). Just share your unique link.\", \"category\": \"referral\", \"status\": \"new\", \"emoji\": \"👥\", \"earnings\": \"$10-$500/referral\", \"earningLevel\": \"medium\", \"trustScore\": 8.0, \"rating\": 4.3, \"reviews\": 5430, \"country\": \"Worldwide\", \"devices\": \"both\", \"payment\": [\"paypal\", \"bank\", \"crypto\"], \"minWithdraw\": \"Varies\", \"isFree\": true, \"difficulty\": \"Very Easy\", \"timeRequired\": \"Minutes\", \"url\": \"https://referralhero.com\", \"tags\": [\"referral\", \"rewards\", \"passive\"], \"source\": \"reddit\", \"publishedAt\": \"2026-06-29T11:15:00Z\", \"views\": 6700}];\nvar CATS=[{\"id\": \"freelance\", \"en\": \"Freelance\", \"ar\": \"عمل حر\", \"fr\": \"Freelance\", \"tr\": \"Serbest\", \"es\": \"Freelance\", \"icon\": \"🎨\"}, {\"id\": \"ai\", \"en\": \"AI Tools\", \"ar\": \"ذكاء اصطناعي\", \"fr\": \"IA\", \"tr\": \"Yapay Zeka\", \"es\": \"IA\", \"icon\": \"🤖\"}, {\"id\": \"surveys\", \"en\": \"Surveys\", \"ar\": \"استبيانات\", \"fr\": \"Sondages\", \"tr\": \"Anketler\", \"es\": \"Encuestas\", \"icon\": \"📋\"}, {\"id\": \"affiliate\", \"en\": \"Affiliate\", \"ar\": \"عمولة\", \"fr\": \"Affiliation\", \"tr\": \"Affiliate\", \"es\": \"Afiliados\", \"icon\": \"🔗\"}, {\"id\": \"referral\", \"en\": \"Referrals\", \"ar\": \"إحالات\", \"fr\": \"Parrainage\", \"tr\": \"Yönlendirme\", \"es\": \"Referencias\", \"icon\": \"👥\"}, {\"id\": \"cashback\", \"en\": \"Cashback\", \"ar\": \"كاش باك\", \"fr\": \"Cashback\", \"tr\": \"Cashback\", \"es\": \"Cashback\", \"icon\": \"💰\"}, {\"id\": \"apps\", \"en\": \"Apps\", \"ar\": \"تطبيقات\", \"fr\": \"Apps\", \"tr\": \"Uygulamalar\", \"es\": \"Apps\", \"icon\": \"📱\"}, {\"id\": \"contests\", \"en\": \"Contests\", \"ar\": \"مسابقات\", \"fr\": \"Concours\", \"tr\": \"Yarışmalar\", \"es\": \"Concursos\", \"icon\": \"🏆\"}, {\"id\": \"remote\", \"en\": \"Remote Jobs\", \"ar\": \"عمل عن بعد\", \"fr\": \"Télétravail\", \"tr\": \"Uzak İş\", \"es\": \"Remoto\", \"icon\": \"💻\"}, {\"id\": \"crypto\", \"en\": \"Crypto\", \"ar\": \"عملات رقمية\", \"fr\": \"Crypto\", \"tr\": \"Kripto\", \"es\": \"Cripto\", \"icon\": \"₿\"}, {\"id\": \"grants\", \"en\": \"Grants\", \"ar\": \"منح\", \"fr\": \"Subventions\", \"tr\": \"Hibeler\", \"es\": \"Becas\", \"icon\": \"🎓\"}, {\"id\": \"testing\", \"en\": \"Testing\", \"ar\": \"اختبارات\", \"fr\": \"Tests\", \"tr\": \"Test\", \"es\": \"Pruebas\", \"icon\": \"🧪\"}, {\"id\": \"trading\", \"en\": \"Trading\", \"ar\": \"تداول\", \"fr\": \"Trading\", \"tr\": \"Ticaret\", \"es\": \"Trading\", \"icon\": \"📈\"}, {\"id\": \"other\", \"en\": \"Other\", \"ar\": \"أخرى\", \"fr\": \"Autre\", \"tr\": \"Diğer\", \"es\": \"Otros\", \"icon\": \"📦\"}];\nvar TR={\"en\": {\"oppOfDay\": \"⚡ OPPORTUNITY OF THE DAY\", \"newToday\": \"New Today\", \"trending\": \"🔥 Trending Now\", \"allOpps\": \"All Opportunities\", \"topRated\": \"⭐ Top Rated\", \"categories\": \"📂 Categories\", \"sources\": \"📡 Active Sources\", \"visitSite\": \"🔗 Visit Official Site\", \"save\": \"🔖 Save\", \"saved\": \"✅ Saved\", \"share\": \"📤 Share\", \"compare\": \"⚖️ Compare\", \"calculator\": \"💰 Income Calculator\", \"calcHours\": \"Hours per day\", \"calcDays\": \"Days per week\", \"calcSkill\": \"Skill level\", \"calcResult\": \"Estimated monthly income\", \"earnings\": \"Expected Earnings\", \"trust\": \"Trust Score\", \"rating\": \"User Rating\", \"countries\": \"Supported Countries\", \"devices\": \"Supported Devices\", \"payment\": \"Payment Method\", \"minWithdraw\": \"Min Withdrawal\", \"difficulty\": \"Difficulty\", \"time\": \"Time Required\", \"free\": \"Free?\", \"statusNew\": \"NEW\", \"statusTrending\": \"TRENDING\", \"statusRecommended\": \"TOP PICK\", \"searchPlaceholder\": \"Search opportunities...\", \"loadMore\": \"Load More\", \"refresh\": \"Refresh\", \"results\": \"opportunities\", \"noResults\": \"No results found\", \"savedPage\": \"Saved\", \"noSaved\": \"No saved opportunities yet\", \"shareWa\": \"Share on WhatsApp\", \"shareTg\": \"Share on Telegram\", \"copyLink\": \"Copy Link\", \"copied\": \"✅ Link copied!\", \"compareSelect\": \"Select another opportunity to compare\", \"mostSearched\": \"🔎 Most Searched\", \"offline\": \"📶 Offline - showing cached data\", \"navHome\": \"Home\", \"navCats\": \"Categories\", \"navTrending\": \"Trending\", \"navSaved\": \"Saved\", \"footerDesc\": \"Smart platform to discover online earning opportunities, fully automated.\", \"footerNav\": \"Navigation\", \"footerLegal\": \"Legal\", \"footerPrivacy\": \"Privacy Policy\", \"footerTerms\": \"Terms\", \"footerDisc\": \"⚠️ For informational purposes only. Always verify on official sites.\", \"mobileOnly\": \"Mobile Only\", \"desktopOnly\": \"Desktop Only\", \"mobileBoth\": \"Mobile & Desktop\", \"catAll\": \"All\"}, \"ar\": {\"oppOfDay\": \"⚡ فرصة اليوم\", \"newToday\": \"جديد اليوم\", \"trending\": \"🔥 الفرص الرائجة\", \"allOpps\": \"جميع الفرص\", \"topRated\": \"⭐ الأعلى تقييماً\", \"categories\": \"📂 التصنيفات\", \"sources\": \"📡 المصادر النشطة\", \"visitSite\": \"🔗 زيارة الموقع الرسمي\", \"save\": \"🔖 حفظ\", \"saved\": \"✅ محفوظ\", \"share\": \"📤 مشاركة\", \"compare\": \"⚖️ مقارنة\", \"calculator\": \"💰 حاسبة الدخل\", \"calcHours\": \"ساعات يومياً\", \"calcDays\": \"أيام أسبوعياً\", \"calcSkill\": \"مستوى المهارة\", \"calcResult\": \"الدخل الشهري المقدر\", \"earnings\": \"الأرباح المتوقعة\", \"trust\": \"مستوى الموثوقية\", \"rating\": \"تقييم المستخدمين\", \"countries\": \"الدول المدعومة\", \"devices\": \"الأجهزة المدعومة\", \"payment\": \"طريقة الدفع\", \"minWithdraw\": \"الحد الأدنى للسحب\", \"difficulty\": \"مستوى الصعوبة\", \"time\": \"الوقت المطلوب\", \"free\": \"هل هي مجانية؟\", \"statusNew\": \"جديد\", \"statusTrending\": \"رائج\", \"statusRecommended\": \"موصى به\", \"searchPlaceholder\": \"ابحث عن فرصة...\", \"loadMore\": \"تحميل المزيد\", \"refresh\": \"تحديث\", \"results\": \"فرصة\", \"noResults\": \"لا توجد نتائج\", \"savedPage\": \"المحفوظات\", \"noSaved\": \"لا توجد فرص محفوظة بعد\", \"shareWa\": \"مشاركة على واتساب\", \"shareTg\": \"مشاركة على تيليجرام\", \"copyLink\": \"نسخ الرابط\", \"copied\": \"✅ تم نسخ الرابط!\", \"compareSelect\": \"اختر فرصة أخرى للمقارنة\", \"mostSearched\": \"🔎 الأكثر بحثاً\", \"offline\": \"📶 أنت غير متصل\", \"navHome\": \"الرئيسية\", \"navCats\": \"التصنيفات\", \"navTrending\": \"الرائج\", \"navSaved\": \"المحفوظات\", \"footerDesc\": \"منصة ذكية لاكتشاف فرص الربح عبر الإنترنت.\", \"footerNav\": \"التنقل\", \"footerLegal\": \"قانوني\", \"footerPrivacy\": \"سياسة الخصوصية\", \"footerTerms\": \"الشروط والأحكام\", \"footerDisc\": \"⚠️ المحتوى للأغراض المعلوماتية فقط.\", \"mobileOnly\": \"موبايل فقط\", \"desktopOnly\": \"كمبيوتر فقط\", \"mobileBoth\": \"موبايل وكمبيوتر\", \"catAll\": \"الكل\"}, \"fr\": {\"oppOfDay\": \"⚡ Opportunité du jour\", \"newToday\": \"Nouveau aujourd'hui\", \"trending\": \"🔥 Tendances\", \"allOpps\": \"Toutes les opportunités\", \"topRated\": \"⭐ Mieux notées\", \"categories\": \"📂 Catégories\", \"sources\": \"📡 Sources actives\", \"visitSite\": \"🔗 Visiter le site\", \"save\": \"🔖 Sauvegarder\", \"saved\": \"✅ Sauvegardé\", \"share\": \"📤 Partager\", \"compare\": \"⚖️ Comparer\", \"calculator\": \"💰 Calculateur\", \"calcHours\": \"Heures/jour\", \"calcDays\": \"Jours/semaine\", \"calcSkill\": \"Niveau\", \"calcResult\": \"Revenu mensuel estimé\", \"earnings\": \"Gains prévus\", \"trust\": \"Score de confiance\", \"rating\": \"Note\", \"countries\": \"Pays supportés\", \"devices\": \"Appareils\", \"payment\": \"Paiement\", \"minWithdraw\": \"Retrait min\", \"difficulty\": \"Difficulté\", \"time\": \"Temps requis\", \"free\": \"Gratuit?\", \"statusNew\": \"NOUVEAU\", \"statusTrending\": \"TENDANCE\", \"statusRecommended\": \"TOP\", \"searchPlaceholder\": \"Rechercher...\", \"loadMore\": \"Charger plus\", \"refresh\": \"Actualiser\", \"results\": \"opportunités\", \"noResults\": \"Aucun résultat\", \"savedPage\": \"Sauvegardés\", \"noSaved\": \"Aucune opportunité\", \"shareWa\": \"WhatsApp\", \"shareTg\": \"Telegram\", \"copyLink\": \"Copier le lien\", \"copied\": \"✅ Copié!\", \"compareSelect\": \"Sélectionnez une opportunité\", \"mostSearched\": \"🔎 Populaires\", \"offline\": \"📶 Hors ligne\", \"navHome\": \"Accueil\", \"navCats\": \"Catégories\", \"navTrending\": \"Tendances\", \"navSaved\": \"Sauvegardés\", \"footerDesc\": \"Plateforme intelligente pour découvrir les meilleures opportunités.\", \"footerNav\": \"Navigation\", \"footerLegal\": \"Légal\", \"footerPrivacy\": \"Confidentialité\", \"footerTerms\": \"Conditions\", \"footerDisc\": \"⚠️ Contenu à titre informatif uniquement.\", \"mobileOnly\": \"Mobile\", \"desktopOnly\": \"Bureau\", \"mobileBoth\": \"Mobile et Bureau\", \"catAll\": \"Tout\"}, \"tr\": {\"oppOfDay\": \"⚡ Günün Fırsatı\", \"newToday\": \"Bugün Yeni\", \"trending\": \"🔥 Trend\", \"allOpps\": \"Tüm Fırsatlar\", \"topRated\": \"⭐ En Yüksek Puanlı\", \"categories\": \"📂 Kategoriler\", \"sources\": \"📡 Kaynaklar\", \"visitSite\": \"🔗 Siteyi Ziyaret Et\", \"save\": \"🔖 Kaydet\", \"saved\": \"✅ Kaydedildi\", \"share\": \"📤 Paylaş\", \"compare\": \"⚖️ Karşılaştır\", \"calculator\": \"💰 Hesaplayıcı\", \"calcHours\": \"Saat/gün\", \"calcDays\": \"Gün/hafta\", \"calcSkill\": \"Beceri\", \"calcResult\": \"Tahmini gelir\", \"earnings\": \"Kazanç\", \"trust\": \"Güven\", \"rating\": \"Puan\", \"countries\": \"Ülkeler\", \"devices\": \"Cihazlar\", \"payment\": \"Ödeme\", \"minWithdraw\": \"Min Çekim\", \"difficulty\": \"Zorluk\", \"time\": \"Süre\", \"free\": \"Ücretsiz?\", \"statusNew\": \"YENİ\", \"statusTrending\": \"TREND\", \"statusRecommended\": \"ÖNERİLEN\", \"searchPlaceholder\": \"Fırsat ara...\", \"loadMore\": \"Daha Fazla\", \"refresh\": \"Yenile\", \"results\": \"fırsat\", \"noResults\": \"Bulunamadı\", \"savedPage\": \"Kaydedilenler\", \"noSaved\": \"Kaydedilen fırsat yok\", \"shareWa\": \"WhatsApp\", \"shareTg\": \"Telegram\", \"copyLink\": \"Kopyala\", \"copied\": \"✅ Kopyalandı!\", \"compareSelect\": \"Karşılaştırmak için seçin\", \"mostSearched\": \"🔎 Popüler\", \"offline\": \"📶 Çevrimdışı\", \"navHome\": \"Ana Sayfa\", \"navCats\": \"Kategoriler\", \"navTrending\": \"Trend\", \"navSaved\": \"Kaydedilenler\", \"footerDesc\": \"Çevrim içi kazanç fırsatları için akıllı platform.\", \"footerNav\": \"Navigasyon\", \"footerLegal\": \"Yasal\", \"footerPrivacy\": \"Gizlilik\", \"footerTerms\": \"Koşullar\", \"footerDisc\": \"⚠️ Yalnızca bilgi amaçlıdır.\", \"mobileOnly\": \"Mobil\", \"desktopOnly\": \"Masaüstü\", \"mobileBoth\": \"Mobil ve Masaüstü\", \"catAll\": \"Tümü\"}, \"es\": {\"oppOfDay\": \"⚡ Oportunidad del día\", \"newToday\": \"Nuevo hoy\", \"trending\": \"🔥 Tendencias\", \"allOpps\": \"Todas las oportunidades\", \"topRated\": \"⭐ Mejor valoradas\", \"categories\": \"📂 Categorías\", \"sources\": \"📡 Fuentes activas\", \"visitSite\": \"🔗 Visitar sitio\", \"save\": \"🔖 Guardar\", \"saved\": \"✅ Guardado\", \"share\": \"📤 Compartir\", \"compare\": \"⚖️ Comparar\", \"calculator\": \"💰 Calculadora\", \"calcHours\": \"Horas/día\", \"calcDays\": \"Días/semana\", \"calcSkill\": \"Nivel\", \"calcResult\": \"Ingreso mensual\", \"earnings\": \"Ganancias\", \"trust\": \"Confianza\", \"rating\": \"Valoración\", \"countries\": \"Países\", \"devices\": \"Dispositivos\", \"payment\": \"Pago\", \"minWithdraw\": \"Retiro mín\", \"difficulty\": \"Dificultad\", \"time\": \"Tiempo\", \"free\": \"¿Gratis?\", \"statusNew\": \"NUEVO\", \"statusTrending\": \"TENDENCIA\", \"statusRecommended\": \"TOP\", \"searchPlaceholder\": \"Buscar...\", \"loadMore\": \"Cargar más\", \"refresh\": \"Actualizar\", \"results\": \"oportunidades\", \"noResults\": \"Sin resultados\", \"savedPage\": \"Guardados\", \"noSaved\": \"No hay guardados\", \"shareWa\": \"WhatsApp\", \"shareTg\": \"Telegram\", \"copyLink\": \"Copiar enlace\", \"copied\": \"✅ ¡Copiado!\", \"compareSelect\": \"Seleccionar para comparar\", \"mostSearched\": \"🔎 Populares\", \"offline\": \"📶 Sin conexión\", \"navHome\": \"Inicio\", \"navCats\": \"Categorías\", \"navTrending\": \"Tendencias\", \"navSaved\": \"Guardados\", \"footerDesc\": \"Plataforma inteligente para descubrir oportunidades de ingresos.\", \"footerNav\": \"Navegación\", \"footerLegal\": \"Legal\", \"footerPrivacy\": \"Privacidad\", \"footerTerms\": \"Términos\", \"footerDisc\": \"⚠️ Solo informativo.\", \"mobileOnly\": \"Móvil\", \"desktopOnly\": \"Escritorio\", \"mobileBoth\": \"Móvil y Escritorio\", \"catAll\": \"Todo\"}};\nvar SOURCES=[{\"id\": \"reddit\", \"name\": \"Reddit API\", \"status\": \"active\", \"count\": 134}, {\"id\": \"hackernews\", \"name\": \"Hacker News\", \"status\": \"active\", \"count\": 89}, {\"id\": \"producthunt\", \"name\": \"Product Hunt\", \"status\": \"active\", \"count\": 76}, {\"id\": \"remoteok\", \"name\": \"RemoteOK\", \"status\": \"active\", \"count\": 203}, {\"id\": \"upwork\", \"name\": \"Upwork Feed\", \"status\": \"active\", \"count\": 158}, {\"id\": \"fiverr\", \"name\": \"Fiverr Insights\", \"status\": \"active\", \"count\": 91}, {\"id\": \"techcrunch\", \"name\": \"TechCrunch RSS\", \"status\": \"active\", \"count\": 29}, {\"id\": \"indiehackers\", \"name\": \"Indie Hackers\", \"status\": \"active\", \"count\": 53}, {\"id\": \"aitools\", \"name\": \"AI Tools RSS\", \"status\": \"active\", \"count\": 67}, {\"id\": \"github\", \"name\": \"GitHub Trending\", \"status\": \"active\", \"count\": 45}, {\"id\": \"surveys\", \"name\": \"Survey Sites\", \"status\": \"active\", \"count\": 38}, {\"id\": \"freelancer\", \"name\": \"Freelancer RSS\", \"status\": \"error\", \"count\": 0}];\nvar MS=[\"freelance\", \"passive income\", \"remote work\", \"AI tools\", \"cashback\", \"crypto\", \"surveys\", \"referrals\", \"grants\", \"side hustle\", \"affiliate\", \"testing\"];\nvar S={lang:localStorage.getItem('lang')||'en',theme:localStorage.getItem('theme')||'dark',cat:'all',sort:'newest',dev:'all',pay:'all',q:'',page:1,per:6,fil:[],saved:JSON.parse(localStorage.getItem('savedOpps')||'[]'),opps:[].concat(OPPS),cA:null,cB:null};\nvar dpi=null;\ndocument.addEventListener('DOMContentLoaded',function(){\n  applyTheme();applyLang();regSW();\n  initFil();renderAll();renderTicker();renderSidebar();\n  setupEvents();animStats();loadLive();calcUpdate();renderOOD();\n});\nfunction regSW(){\n  if(!('serviceWorker' in navigator))return;\n  navigator.serviceWorker.register('/sw.js').catch(function(){});\n  window.addEventListener('online',function(){document.getElementById('ob').classList.remove('show');});\n  window.addEventListener('offline',function(){var b=document.getElementById('ob');b.textContent=T('offline');b.classList.add('show');});\n}\nwindow.addEventListener('beforeinstallprompt',function(e){\n  e.preventDefault();dpi=e;document.getElementById('ibtn').classList.add('show');\n});\ndocument.getElementById('ibtn').addEventListener('click',function(){\n  if(!dpi)return;dpi.prompt();dpi.userChoice.then(function(){dpi=null;document.getElementById('ibtn').classList.remove('show');});\n});\nasync function loadLive(){\n  try{\n    var r=await fetch('/api/opportunities');var live=await r.json();\n    if(Array.isArray(live)&&live.length>0){\n      var urls=new Set(S.opps.map(function(o){return o.url;}));\n      S.opps=live.filter(function(o){return !urls.has(o.url);}).concat(S.opps);\n      initFil();renderAll();toast('Live data loaded');\n    }\n  }catch(e){}\n  try{\n    var rs=await fetch('/api/stats');var st=await rs.json();\n    if(st.total){animN('sTotal',0,st.total,1200);animN('sToday',0,st.today||0,1000);}\n  }catch(e){}\n}\nfunction T(k){return(TR[S.lang]||TR.en)[k]||k;}\nfunction applyTheme(){\n  document.documentElement.setAttribute('data-theme',S.theme==='light'?'light':'');\n  document.getElementById('themeBtn').textContent=S.theme==='light'?'🌙':'☀️';\n}\nfunction applyLang(){\n  var rtl=S.lang==='ar';\n  document.documentElement.lang=S.lang;\n  document.documentElement.dir=rtl?'rtl':'ltr';\n  document.getElementById('lsel').value=S.lang;\n  document.querySelectorAll('[data-k]').forEach(function(el){var t=T(el.getAttribute('data-k'));if(t)el.textContent=t;});\n  CATS.forEach(function(c){document.querySelectorAll('.cn').forEach(function(x){if(x.dataset.id===c.id)x.textContent=c[S.lang]||c.en;});});\n  var si=document.getElementById('sinput');if(si)si.placeholder=T('searchPlaceholder');\n  if(S.opps.length){renderAll();renderSidebar();}\n}\nfunction setView(v){\n  document.getElementById('hv').style.display=v==='home'?'':'none';\n  document.getElementById('sv').style.display=v==='saved'?'':'none';\n  if(v==='saved')renderSaved();window.scrollTo(0,0);\n}\nfunction initFil(){\n  var d=S.opps.slice();\n  if(S.cat!=='all')d=d.filter(function(o){return o.category===S.cat;});\n  if(S.q){var q=S.q.toLowerCase();d=d.filter(function(o){return o.title.toLowerCase().includes(q)||(o.description||'').toLowerCase().includes(q)||(o.tags||[]).some(function(t){return t.toLowerCase().includes(q);});});}\n  if(S.dev!=='all')d=d.filter(function(o){return o.devices===S.dev||o.devices==='both';});\n  if(S.pay!=='all')d=d.filter(function(o){return(o.payment||[]).includes(S.pay);});\n  if(S.sort==='newest')d.sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);});\n  else if(S.sort==='trending')d.sort(function(a,b){return(b.views||0)-(a.views||0);});\n  else if(S.sort==='rated')d.sort(function(a,b){return(b.rating||0)-(a.rating||0);});\n  else d.sort(function(a,b){return(b.earningLevel==='high'?3:b.earningLevel==='medium'?2:1)-(a.earningLevel==='high'?3:a.earningLevel==='medium'?2:1);});\n  S.fil=d;\n  var el=document.getElementById('rc');if(el)el.textContent=d.length+' '+T('results');\n}\nfunction catName(id){var c=CATS.find(function(x){return x.id===id;});return c?(c[S.lang]||c.en):id;}\nfunction catIcon(id){var c=CATS.find(function(x){return x.id===id;});return c?c.icon:'';}\nfunction tAgo(d){\n  var diff=Date.now()-new Date(d),m=Math.floor(diff/60000),h=Math.floor(m/60),dy=Math.floor(h/24);\n  if(S.lang==='ar'){if(m<1)return'\\u0627\\u0644\\u0622\\u0646';if(m<60)return'\\u0645\\u0646\\u0630 '+m+' \\u062F\\u0642\\u064A\\u0642\\u0629';if(h<24)return'\\u0645\\u0646\\u0630 '+h+' \\u0633\\u0627\\u0639\\u0629';return'\\u0645\\u0646\\u0630 '+dy+' \\u064A\\u0648\\u0645';}\n  if(m<1)return'Just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';return dy+'d ago';\n}\nfunction sCls(s){return{new:'sn',trending:'st',recommended:'sr2'}[s]||'sn';}\nfunction sLbl(s){return T({new:'statusNew',trending:'statusTrending',recommended:'statusRecommended'}[s]||'statusNew');}\nfunction payLbl(p){return{paypal:'PayPal',bank:'Bank Transfer',crypto:'Crypto',gift:'Gift Cards',payoneer:'Payoneer',check:'Check'}[p]||p;}\nfunction devLbl(d){if(d==='both')return T('mobileBoth');if(d==='mobile')return T('mobileOnly');return T('desktopOnly');}\nfunction makeCard(o){\n  var sv=S.saved.includes(o.id);\n  var stars='';for(var i=1;i<=5;i++){stars+='<span class=\"'+(i<=Math.round(o.rating||0)?'on':'')+'\" data-star=\"'+i+'\" onclick=\"rateO('+o.id+','+i+',event)\">&#9733;</span>';}\n  var cn=o.country||'';if(cn.length>14)cn=cn.substring(0,14)+'...';\n  var h='<div class=\"card\" data-id=\"'+o.id+'\">';\n  h+='<div class=\"ct\"><span>'+o.emoji+'</span><span class=\"cs '+sCls(o.status)+'\">'+sLbl(o.status)+'</span></div>';\n  h+='<div class=\"cb\"><div class=\"ct2\">'+o.title+'</div><div class=\"cd\">'+o.description+'</div>';\n  h+='<div class=\"cm\"><span class=\"me earn\">&#128176; '+o.earnings+'</span><span class=\"me trust\">&#11088; '+o.trustScore+'/10</span><span class=\"me\">&#127757; '+cn+'</span><span class=\"me\">'+(o.isFree?'Free':'Paid')+'</span></div></div>';\n  h+='<div class=\"stars\" data-oid=\"'+o.id+'\">'+stars+'<span style=\"margin-left:4px;font-size:.68rem;color:var(--muted)\">'+(o.rating||0)+' ('+(o.reviews||0).toLocaleString()+')</span></div>';\n  h+='<div class=\"cbtns\"><button class=\"cbtn\" onclick=\"shareO('+o.id+',event)\">'+T('share')+'</button>';\n  h+='<button class=\"cbtn\" id=\"sb'+o.id+'\" onclick=\"toggleSv('+o.id+',event)\">'+(sv?T('saved'):T('save'))+'</button>';\n  h+='<button class=\"cbtn\" onclick=\"openCmp('+o.id+',event)\">'+T('compare')+'</button></div>';\n  h+='<div class=\"cf\"><span class=\"ccat\">'+catIcon(o.category)+' '+catName(o.category)+'</span><span class=\"cst\">&#9733; '+(o.rating||0)+'</span><span class=\"ctm\">'+tAgo(o.publishedAt)+'</span></div></div>';\n  return h;\n}\nfunction mkSkel(){return '<div class=\"skc\"><div class=\"sk ski\"></div><div class=\"skb\"><div class=\"sk skl w75\"></div><div class=\"sk skl w100\"></div><div class=\"sk skl w50\"></div></div></div>';}\nfunction renderAll(){renderNew();renderTrend();renderMain();}\nfunction renderNew(){\n  var g=document.getElementById('ng');if(!g)return;\n  var cut=Date.now()-86400000;\n  var items=S.opps.filter(function(o){return new Date(o.publishedAt)>cut;}).sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);}).slice(0,3);\n  g.innerHTML=items.length?items.map(makeCard).join(''):'<p style=\"color:var(--muted);font-size:.82rem;grid-column:1/-1\">'+T('noResults')+'</p>';\n  addL(g);\n}\nfunction renderTrend(){\n  var g=document.getElementById('tg');if(!g)return;\n  var items=S.opps.filter(function(o){return o.status==='trending'||(o.views||0)>10000;}).sort(function(a,b){return(b.views||0)-(a.views||0);}).slice(0,3);\n  g.innerHTML=items.map(makeCard).join('');addL(g);\n}\nfunction renderMain(ap){\n  var g=document.getElementById('mg');if(!g)return;\n  if(!ap){\n    g.innerHTML=mkSkel()+mkSkel()+mkSkel();\n    setTimeout(function(){\n      if(!S.fil.length){g.innerHTML='<div style=\"grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)\"><div style=\"font-size:3rem;margin-bottom:12px\">&#128269;</div><div>'+T('noResults')+'</div></div>';return;}\n      g.innerHTML=S.fil.slice(0,S.page*S.per).map(makeCard).join('');addL(g);\n      var lm=document.getElementById('lmbtn');if(lm)lm.style.display=S.fil.slice(0,S.page*S.per).length>=S.fil.length?'none':'block';\n    },350);\n  }else{\n    g.insertAdjacentHTML('beforeend',S.fil.slice((S.page-1)*S.per,S.page*S.per).map(makeCard).join(''));addL(g);\n    var lm2=document.getElementById('lmbtn');if(lm2)lm2.style.display=g.querySelectorAll('.card').length>=S.fil.length?'none':'block';\n  }\n}\nfunction addL(g){g.querySelectorAll('.card').forEach(function(c){c.addEventListener('click',function(e){if(e.target.closest('.cbtns')||e.target.closest('.stars'))return;openM(parseInt(c.dataset.id));});});}\nfunction renderSaved(){\n  var g=document.getElementById('sgrid'),ns=document.getElementById('nsaved');\n  var items=S.opps.filter(function(o){return S.saved.includes(o.id);});\n  if(!items.length){if(g)g.innerHTML='';if(ns)ns.style.display='block';return;}\n  if(ns)ns.style.display='none';if(g){g.innerHTML=items.map(makeCard).join('');addL(g);}\n}\nfunction renderSidebar(){renderTop();renderCatStats();renderSrcs();renderMS();}\nfunction renderTop(){\n  var l=document.getElementById('trl');if(!l)return;\n  var items=S.opps.slice().sort(function(a,b){return(b.rating||0)-(a.rating||0);}).slice(0,5);\n  var rk=['rkg','rks','rkb','',''];\n  l.innerHTML=items.map(function(o,i){return '<div class=\"tri\" onclick=\"openM('+o.id+')\"><div class=\"trr '+rk[i]+'\">'+(i+1)+'</div><div class=\"tri-i\"><div class=\"trn\">'+o.title+'</div><div class=\"tre\">'+o.earnings+'</div></div><span style=\"font-size:.7rem;color:var(--gold)\">&#9733;'+(o.rating||0)+'</span></div>';}).join('');\n}\nfunction renderCatStats(){\n  var c=document.getElementById('cstats');if(!c)return;\n  var counts={};S.opps.forEach(function(o){counts[o.category]=(counts[o.category]||0)+1;});\n  var max=Math.max.apply(null,Object.values(counts).concat([1]));\n  c.innerHTML=CATS.slice(0,8).map(function(cat){\n    return '<div class=\"catr\" onclick=\"filterCat(\\''+cat.id+'\\')\"><span class=\"cati\">'+cat.icon+'</span><div style=\"flex:1\"><div style=\"display:flex;justify-content:space-between\"><span class=\"catnm\">'+(cat[S.lang]||cat.en)+'</span><span class=\"catcnt\">'+(counts[cat.id]||0)+'</span></div><div class=\"cbw\"><div class=\"cbar\" style=\"width:'+((counts[cat.id]||0)/max*100)+'%\"></div></div></div></div>';\n  }).join('');\n}\nfunction renderSrcs(){\n  var l=document.getElementById('srcs');if(!l)return;\n  l.innerHTML=SOURCES.slice(0,8).map(function(s){return '<div class=\"sri\"><div class=\"srd '+s.status+'\"></div><span class=\"srn\">'+s.name+'</span><span class=\"src2\">'+s.count+'</span></div>';}).join('');\n}\nfunction renderMS(){\n  var el=document.getElementById('mstags');if(!el)return;\n  el.innerHTML=MS.map(function(t){return '<span class=\"mstg\" onclick=\"qs(\\''+t+'\\')\">'+t+'</span>';}).join('');\n}\nfunction renderTicker(){\n  var inner=document.getElementById('ticker');if(!inner)return;\n  var html=S.opps.slice(0,8).map(function(o){return '<span class=\"tic\"><span class=\"tc\">'+catIcon(o.category)+'</span> '+o.title+' &mdash; '+o.earnings+'</span>';}).join('');\n  inner.innerHTML=html+html;\n}\nfunction renderOOD(){\n  var opp=S.opps.slice().sort(function(a,b){return(b.views||0)-(a.views||0);})[0];if(!opp)return;\n  var t=document.getElementById('oodt'),e=document.getElementById('oode'),l=document.querySelector('.oodl');\n  if(t)t.textContent=opp.emoji+' '+opp.title;if(e)e.textContent='&#128176; '+opp.earnings;\n  if(l)l.textContent=T('oppOfDay');\n  document.getElementById('ood').onclick=function(){openM(opp.id);};\n}\nfunction openM(id){\n  var o=S.opps.find(function(x){return x.id===id;});if(!o)return;\n  var sv=S.saved.includes(id);\n  var pay=(o.payment||[]).map(payLbl).join(', ');\n  var tags=(o.tags||[]).map(function(t){return '<span class=\"tag\">#'+t+'</span>';}).join('');\n  var h='<div class=\"mth\">'+o.emoji+'</div><div class=\"mb\">';\n  h+='<div class=\"mcat\">'+catIcon(o.category)+' '+catName(o.category)+'</div>';\n  h+='<h2 class=\"mtt\">'+o.title+'</h2><p class=\"mds\">'+(o.fullDescription||o.description)+'</p>';\n  h+='<div class=\"mgrid\">';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('earnings')+'</div><div class=\"mdv gn\">'+o.earnings+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('trust')+'</div><div class=\"mdv gd\">'+o.trustScore+'/10</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('rating')+'</div><div class=\"mdv\">&#9733;'+(o.rating||0)+' ('+(o.reviews||0).toLocaleString()+')</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('countries')+'</div><div class=\"mdv\">'+o.country+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('devices')+'</div><div class=\"mdv\">'+devLbl(o.devices)+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('payment')+'</div><div class=\"mdv\">'+pay+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('minWithdraw')+'</div><div class=\"mdv or\">'+o.minWithdraw+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('time')+'</div><div class=\"mdv\">'+o.timeRequired+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('difficulty')+'</div><div class=\"mdv\">'+o.difficulty+'</div></div>';\n  h+='<div class=\"mdi\"><div class=\"mdl\">'+T('free')+'</div><div class=\"mdv gn\">'+(o.isFree?'Yes, Free':'Paid')+'</div></div>';\n  h+='</div><div class=\"mtags\">'+tags+'</div>';\n  h+='<div class=\"ma\"><a href=\"'+o.url+'\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"bv\">'+T('visitSite')+'</a>';\n  h+='<button class=\"bma\" id=\"msb'+id+'\" onclick=\"toggleSv('+id+',event)\">'+(sv?T('saved'):T('save'))+'</button>';\n  h+='<button class=\"bma\" onclick=\"shareO('+id+',event)\">'+T('share')+'</button>';\n  h+='<button class=\"bma\" onclick=\"openCmp('+id+',event)\">'+T('compare')+'</button></div></div>';\n  document.getElementById('mc').innerHTML=h;\n  document.getElementById('moverlay').classList.add('active');\n  document.body.style.overflow='hidden';\n}\nfunction closeM(){document.getElementById('moverlay').classList.remove('active');document.body.style.overflow='';}\nfunction toggleSv(id,e){\n  if(e)e.stopPropagation();\n  var idx=S.saved.indexOf(id);\n  if(idx>-1){S.saved.splice(idx,1);toast(S.lang==='ar'?'\\u062A\\u0645 \\u0627\\u0644\\u0625\\u0632\\u0627\\u0644\\u0629':'Removed');}\n  else{S.saved.push(id);toast(S.lang==='ar'?'\\u2705 \\u062A\\u0645 \\u0627\\u0644\\u062D\\u0641\\u0638':'\\u2705 Saved!');}\n  localStorage.setItem('savedOpps',JSON.stringify(S.saved));\n  ['sb','msb'].forEach(function(p){var btn=document.getElementById(p+id);if(btn)btn.textContent=S.saved.includes(id)?T('saved'):T('save');});\n}\nfunction shareO(id,e){\n  if(e)e.stopPropagation();\n  var o=S.opps.find(function(x){return x.id===id;});if(!o)return;\n  var wu='https://wa.me/?text='+encodeURIComponent(o.title+' - '+o.earnings+'\\n'+o.url);\n  var tu='https://t.me/share/url?url='+encodeURIComponent(o.url)+'&text='+encodeURIComponent(o.title);\n  var h='<button class=\"smbtn\" onclick=\"window.open(\\''+wu+'\\',\\'_blank\\')\">&#128172; '+T('shareWa')+'</button>';\n  h+='<button class=\"smbtn\" onclick=\"window.open(\\''+tu+'\\',\\'_blank\\')\">&#9992; '+T('shareTg')+'</button>';\n  h+='<button class=\"smbtn\" onclick=\"cpLink(\\''+o.url+'\\')\">&#128279; '+T('copyLink')+'</button>';\n  document.getElementById('sbtns').innerHTML=h;\n  document.getElementById('smo').classList.add('active');\n}\nfunction cpLink(url){navigator.clipboard.writeText(url).then(function(){toast(T('copied'));document.getElementById('smo').classList.remove('active');});}\nfunction openCmp(id,e){\n  if(e)e.stopPropagation();\n  if(!S.cA){S.cA=id;toast(T('compareSelect'));return;}\n  if(S.cA===id){S.cA=null;return;}\n  S.cB=id;renderCmp();\n}\nfunction renderCmp(){\n  var a=S.opps.find(function(o){return o.id===S.cA;}),b=S.opps.find(function(o){return o.id===S.cB;});\n  if(!a||!b)return;\n  var fields=[[T('earnings'),a.earnings,b.earnings],[T('trust'),a.trustScore+'/10',b.trustScore+'/10'],['Rating','\\u2605'+(a.rating||0),'\\u2605'+(b.rating||0)],[T('countries'),a.country,b.country],[T('devices'),devLbl(a.devices),devLbl(b.devices)],[T('minWithdraw'),a.minWithdraw,b.minWithdraw],[T('difficulty'),a.difficulty,b.difficulty],[T('free'),a.isFree?'\\u2705':'\\u274C',b.isFree?'\\u2705':'\\u274C']];\n  var h='<div class=\"cmoc2\"><h3>'+a.emoji+' '+a.title.substring(0,26)+'...</h3>'+fields.map(function(f){return '<div class=\"cmof\"><span class=\"cmol\">'+f[0]+'</span><span class=\"cmov\">'+f[1]+'</span></div>';}).join('')+'</div>';\n  h+='<div class=\"cmoc2\"><h3>'+b.emoji+' '+b.title.substring(0,26)+'...</h3>'+fields.map(function(f){return '<div class=\"cmof\"><span class=\"cmol\">'+f[0]+'</span><span class=\"cmov\">'+f[2]+'</span></div>';}).join('')+'</div>';\n  document.getElementById('cmgrid').innerHTML=h;\n  document.getElementById('cmo').classList.add('active');\n  S.cA=null;S.cB=null;\n}\nfunction calcUpdate(){\n  var h=parseFloat(document.getElementById('cch').value),d=parseFloat(document.getElementById('ccd').value),sk=parseFloat(document.getElementById('ccs').value);\n  var hv=document.getElementById('cchv'),dv=document.getElementById('ccdv');\n  if(hv)hv.textContent=h;if(dv)dv.textContent=d;\n  var el=document.getElementById('ccn');if(el)el.textContent='$'+Math.round(h*d*4.3*sk).toLocaleString();\n}\nfunction rateO(id,star,e){\n  e.stopPropagation();\n  document.querySelectorAll('[data-oid=\"'+id+'\"] [data-star]').forEach(function(s){s.classList.toggle('on',parseInt(s.dataset.star)<=star);});\n  fetch('/api/rate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,rating:star})}).then(function(){toast('\\u2605 '+star+' Thanks!');}).catch(function(){toast('\\u2605 '+star);});\n}\nfunction animStats(){\n  var tot=S.opps.length,tod=S.opps.filter(function(o){return new Date(o.publishedAt)>Date.now()-86400000;}).length;\n  animN('sTotal',0,tot*8+47,1500);animN('sToday',0,tod+3,1200);\n}\nfunction animN(id,from,to,dur){\n  var el=document.getElementById(id);if(!el)return;\n  var step=(to-from)/(dur/16),cur=from;\n  var t=setInterval(function(){cur=Math.min(cur+step,to);el.textContent=Math.floor(cur);if(cur>=to)clearInterval(t);},16);\n}\nvar stmr;\ndocument.getElementById('sinput').addEventListener('input',function(e){\n  clearTimeout(stmr);\n  stmr=setTimeout(function(){\n    var q=e.target.value.trim();var r=document.getElementById('sres');\n    if(!q){r.innerHTML='';return;}\n    var m=S.opps.filter(function(o){return o.title.toLowerCase().includes(q.toLowerCase())||(o.description||'').toLowerCase().includes(q.toLowerCase())||(o.tags||[]).some(function(t){return t.toLowerCase().includes(q.toLowerCase());});}).slice(0,6);\n    if(!m.length){r.innerHTML='<div style=\"color:var(--muted);text-align:center;padding:14px\">'+T('noResults')+'</div>';return;}\n    r.innerHTML=m.map(function(o){return '<div onclick=\"openM('+o.id+');closeSB()\" style=\"background:var(--card);border:1px solid var(--bdr);border-radius:var(--rs);padding:10px;cursor:pointer\"><div style=\"font-size:.82rem;font-weight:600;margin-bottom:3px\">'+o.emoji+' '+o.title+'</div><div style=\"font-size:.7rem;color:var(--muted)\">'+o.description.substring(0,70)+'...</div></div>';}).join('');\n  },300);\n});\nfunction closeSB(){document.getElementById('sbar').style.display='none';document.getElementById('sinput').value='';document.getElementById('sres').innerHTML='';}\nfunction qs(term){S.q=term;S.page=1;initFil();renderMain();document.getElementById('aopps').scrollIntoView({behavior:'smooth'});}\nfunction filterCat(id){\n  S.cat=id;S.page=1;\n  document.querySelectorAll('.chip').forEach(function(c){c.classList.toggle('active',c.dataset.cat===id);});\n  initFil();renderMain();document.getElementById('aopps').scrollIntoView({behavior:'smooth'});\n}\nfunction setupEvents(){\n  document.getElementById('themeBtn').addEventListener('click',function(){S.theme=S.theme==='dark'?'light':'dark';localStorage.setItem('theme',S.theme);applyTheme();});\n  document.getElementById('lsel').addEventListener('change',function(e){\n    S.lang=e.target.value;localStorage.setItem('lang',S.lang);applyLang();renderTicker();renderOOD();renderSidebar();\n    var msgs={en:'\\uD83C\\uDDFA\\uD83C\\uDDF8 English',ar:'\\uD83C\\uDDF8\\uD83C\\uDDE6 \\u0639\\u0631\\u0628\\u064A',fr:'\\uD83C\\uDDEB\\uD83C\\uDDF7 Fran\\u00E7ais',tr:'\\uD83C\\uDDF9\\uD83C\\uDDF7 T\\u00FCrk\\u00E7e',es:'\\uD83C\\uDDEA\\uD83C\\uDDF8 Espa\\u00F1ol'};\n    toast(msgs[S.lang]||'Changed');\n  });\n  document.getElementById('stbtn').addEventListener('click',function(){var sb=document.getElementById('sbar');sb.style.display=sb.style.display==='none'||!sb.style.display?'block':'none';if(sb.style.display==='block')setTimeout(function(){document.getElementById('sinput').focus();},100);});\n  document.getElementById('scbtn').addEventListener('click',closeSB);\n  document.getElementById('mcbtn').addEventListener('click',closeM);\n  document.getElementById('moverlay').addEventListener('click',function(e){if(e.target===document.getElementById('moverlay'))closeM();});\n  document.getElementById('cmcbtn').addEventListener('click',function(){document.getElementById('cmo').classList.remove('active');S.cA=null;});\n  document.getElementById('smcan').addEventListener('click',function(){document.getElementById('smo').classList.remove('active');});\n  document.getElementById('smo').addEventListener('click',function(e){if(e.target===document.getElementById('smo'))document.getElementById('smo').classList.remove('active');});\n  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeM();closeSB();document.getElementById('cmo').classList.remove('active');document.getElementById('smo').classList.remove('active');}});\n  document.getElementById('chips').addEventListener('click',function(e){var c=e.target.closest('.chip');if(!c)return;document.querySelectorAll('.chip').forEach(function(x){x.classList.remove('active');});c.classList.add('active');S.cat=c.dataset.cat;S.page=1;initFil();renderMain();});\n  document.getElementById('sortSel').addEventListener('change',function(e){S.sort=e.target.value;S.page=1;initFil();renderMain();});\n  document.getElementById('devSel').addEventListener('change',function(e){S.dev=e.target.value;S.page=1;initFil();renderMain();});\n  document.getElementById('paySel').addEventListener('change',function(e){S.pay=e.target.value;S.page=1;initFil();renderMain();});\n  document.getElementById('lmbtn').addEventListener('click',function(){S.page++;renderMain(true);});\n  document.getElementById('rbtn').addEventListener('click',async function(){var b=document.getElementById('rbtn');b.disabled=true;try{await fetch('/api/refresh');await loadLive();toast('\\u2705 '+(S.lang==='ar'?'\\u062A\\u0645 \\u0627\\u0644\\u062A\\u062D\\u062F\\u064A\\u062B':'Updated!'));}catch(e){toast('\\u26A0\\uFE0F Failed');}b.disabled=false;});\n  document.getElementById('burgbtn').addEventListener('click',function(){document.getElementById('mmenu').classList.add('open');});\n  document.getElementById('mmclose').addEventListener('click',closeMM);\n  document.getElementById('mmhome').addEventListener('click',function(e){e.preventDefault();setView('home');closeMM();});\n  document.getElementById('mmsaved').addEventListener('click',function(e){e.preventDefault();setView('saved');closeMM();});\n  document.getElementById('mmcats').addEventListener('click',closeMM);\n  document.getElementById('mmtrend').addEventListener('click',closeMM);\n  document.getElementById('navhome').addEventListener('click',function(e){e.preventDefault();setView('home');});\n  document.getElementById('navsaved').addEventListener('click',function(e){e.preventDefault();setView('saved');});\n  document.getElementById('logobtn').addEventListener('click',function(e){e.preventDefault();setView('home');});\n  setInterval(renderTicker,5*60*1000);\n}\nfunction closeMM(){document.getElementById('mmenu').classList.remove('open');}\nvar tTmr;\nfunction toast(msg,dur){var el=document.getElementById('toastel');el.innerHTML=msg;el.classList.add('show');clearTimeout(tTmr);tTmr=setTimeout(function(){el.classList.remove('show');},dur||3000);}\n";
const SW_CONTENT = "const CACHE='er-v4';\nself.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.add('/')));self.skipWaiting();});\nself.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});\nself.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));});\n";

async function handleOpps(env, cors) {
  try {
    if (env.EARN_KV) {
      const c = await env.EARN_KV.get('opportunities');
      if (c) return new Response(c, { headers: {...cors,'Content-Type':'application/json'} });
    }
  } catch(e) {}
  return new Response('[]', { headers: {...cors,'Content-Type':'application/json'} });
}
async function handleStats(env, cors) {
  let s = {total:143,today:12,sources:12,categories:14,lastUpdate:new Date().toISOString()};
  try {
    if (env.EARN_KV) { const d = await env.EARN_KV.get('stats'); if (d) s = JSON.parse(d); }
  } catch(e) {}
  return new Response(JSON.stringify(s), { headers: {...cors,'Content-Type':'application/json'} });
}
async function handleRate(request, env, cors) {
  try {
    const {id, rating} = await request.json();
    if (env.EARN_KV) {
      const key = 'r_' + id;
      const ex = await env.EARN_KV.get(key);
      const data = ex ? JSON.parse(ex) : {total:0,count:0};
      data.total += rating; data.count += 1;
      await env.EARN_KV.put(key, JSON.stringify(data));
      return new Response(JSON.stringify({avg:(data.total/data.count).toFixed(1)}), {headers:cors});
    }
  } catch(e) {}
  return new Response(JSON.stringify({ok:true}), {headers:cors});
}
// ================================================================
//  LIVE DATA SOURCES — 8 real free APIs for earning opportunities
// ================================================================

async function fetchSources(env) {
  if (!env.EARN_KV) return;
  const results = [];
  const log = [];

  // Run all sources in parallel with individual error handling
  const fetchers = [
    ['RemoteOK',       fetchRemoteOK],
    ['Remotive',       fetchRemotive],
    ['Jobicy',         fetchJobicy],
    ['HackerNews',     fetchHN],
    ['Reddit',         fetchReddit],
    ['WeWorkRemotely', fetchWWR],
    ['CryptoJobs',     fetchCryptoJobs],
    ['GitHub Bounties',fetchGitHubBounties],
  ];

  await Promise.allSettled(fetchers.map(async ([name, fn]) => {
    try {
      const items = await fn();
      results.push(...items);
      log.push(name + ':' + items.length);
    } catch(e) {
      log.push(name + ':ERR:' + e.message.substring(0,40));
    }
  }));

  // Deduplicate by URL
  const seen = new Set();
  const unique = results.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Sort: newest first
  unique.sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  if (unique.length > 0) {
    await env.EARN_KV.put('opportunities', JSON.stringify(unique), { expirationTtl: 7200 });
    await env.EARN_KV.put('stats', JSON.stringify({
      total: unique.length,
      today: unique.filter(u => new Date(u.publishedAt) > Date.now() - 86400000).length,
      sources: 8,
      categories: 14,
      lastUpdate: new Date().toISOString(),
      log: log
    }));
  }
  return unique.length;
}

// ── 1. RemoteOK — Remote jobs with real salaries ────────────────
async function fetchRemoteOK() {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'EarnRadar/4.0 (earnradar.manasa.workers.dev)' }
  });
  const jobs = await res.json();

  return jobs.slice(1).filter(j => j.position && j.company).slice(0, 20).map(j => {
    const sal = j.salary_min && j.salary_max
      ? '$' + Math.round(j.salary_min/1000) + 'k–$' + Math.round(j.salary_max/1000) + 'k/yr'
      : j.salary_min ? '$' + Math.round(j.salary_min/1000) + 'k+/yr' : 'Competitive';

    const tags = (j.tags || []).slice(0, 5);
    const cat = tags.some(t => /design|ui|ux|figma/i.test(t)) ? 'freelance'
      : tags.some(t => /ai|ml|data|python/i.test(t)) ? 'ai'
      : tags.some(t => /crypto|web3|blockchain/i.test(t)) ? 'crypto'
      : 'remote';

    const desc = (j.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return {
      id: 'rok_' + j.id,
      title: j.position + ' at ' + j.company,
      description: desc.substring(0, 200) || 'Remote job opportunity at ' + j.company,
      fullDescription: desc.substring(0, 800) || 'Remote job opportunity at ' + j.company + '. Apply via RemoteOK.',
      category: cat,
      status: j.salary_min > 100000 ? 'recommended' : 'new',
      emoji: '💻',
      earnings: sal,
      earningLevel: j.salary_min > 120000 ? 'high' : j.salary_min > 60000 ? 'medium' : 'low',
      trustScore: 9.0,
      rating: 4.3,
      reviews: 0,
      country: 'Worldwide (Remote)',
      devices: 'desktop',
      payment: ['bank'],
      minWithdraw: 'Monthly salary',
      isFree: true,
      difficulty: j.position.toLowerCase().includes('senior') || j.position.toLowerCase().includes('lead') ? 'Advanced' : 'Medium',
      timeRequired: 'Full-time',
      url: j.url || 'https://remoteok.com',
      tags: tags.length ? tags : ['remote', 'job'],
      source: 'remoteok',
      publishedAt: j.date ? new Date(j.date).toISOString() : new Date().toISOString(),
      views: 0
    };
  });
}

// ── 2. Remotive — Curated remote jobs ───────────────────────────
async function fetchRemotive() {
  const res = await fetch('https://remotive.com/api/remote-jobs?limit=20', {
    headers: { 'User-Agent': 'EarnRadar/4.0' }
  });
  const data = await res.json();
  const jobs = data.jobs || [];

  return jobs.slice(0, 20).map(j => {
    const sal = j.salary ? j.salary : 'Competitive';
    const cat = /design|ui|ux/i.test(j.category) ? 'freelance'
      : /data|ai|ml/i.test(j.category) ? 'ai'
      : /crypto|web3/i.test(j.category) ? 'crypto'
      : 'remote';

    const desc = (j.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return {
      id: 'remotive_' + j.id,
      title: j.title + ' at ' + j.company_name,
      description: desc.substring(0, 200) || 'Remote job at ' + j.company_name,
      fullDescription: desc.substring(0, 800) || 'Remote opportunity at ' + j.company_name,
      category: cat,
      status: 'new',
      emoji: '🌍',
      earnings: sal !== 'Competitive' ? sal : 'Competitive salary',
      earningLevel: 'medium',
      trustScore: 8.8,
      rating: 4.4,
      reviews: 0,
      country: j.candidate_required_location || 'Worldwide',
      devices: 'desktop',
      payment: ['bank'],
      minWithdraw: 'Monthly salary',
      isFree: true,
      difficulty: 'Medium',
      timeRequired: j.job_type || 'Full-time',
      url: j.url,
      tags: [j.category, 'remote', 'remotive'].filter(Boolean).slice(0,4),
      source: 'remotive',
      publishedAt: j.publication_date ? new Date(j.publication_date).toISOString() : new Date().toISOString(),
      views: 0
    };
  });
}

// ── 3. Jobicy — More remote jobs ────────────────────────────────
async function fetchJobicy() {
  const res = await fetch('https://jobicy.com/api/v0/remote-jobs?count=20&geo=worldwide', {
    headers: { 'User-Agent': 'EarnRadar/4.0' }
  });
  const data = await res.json();
  const jobs = (data.jobs || []);

  return jobs.slice(0, 20).map(j => {
    const desc = (j.jobDescription || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const cat = /design/i.test(j.jobIndustry) ? 'freelance'
      : /tech|software|data|ai/i.test(j.jobIndustry) ? 'ai'
      : 'remote';

    return {
      id: 'jobicy_' + j.id,
      title: j.jobTitle + ' at ' + j.companyName,
      description: desc.substring(0, 200) || 'Remote job at ' + j.companyName,
      fullDescription: desc.substring(0, 800) || 'Remote opportunity at ' + j.companyName,
      category: cat,
      status: 'new',
      emoji: '🎯',
      earnings: j.annualSalaryMin && j.annualSalaryMax
        ? '$' + Math.round(j.annualSalaryMin/1000) + 'k–$' + Math.round(j.annualSalaryMax/1000) + 'k/yr'
        : 'Competitive',
      earningLevel: j.annualSalaryMin > 100000 ? 'high' : 'medium',
      trustScore: 8.5,
      rating: 4.2,
      reviews: 0,
      country: j.jobGeo || 'Worldwide',
      devices: 'desktop',
      payment: ['bank'],
      minWithdraw: 'Monthly salary',
      isFree: true,
      difficulty: 'Medium',
      timeRequired: j.jobType || 'Full-time',
      url: j.url,
      tags: [j.jobIndustry, 'remote', 'jobicy'].filter(Boolean).slice(0,4),
      source: 'jobicy',
      publishedAt: j.pubDate ? new Date(j.pubDate).toISOString() : new Date().toISOString(),
      views: 0
    };
  });
}

// ── 4. Hacker News — "Who's Hiring" + Bounties ──────────────────
async function fetchHN() {
  const kw = ['earn','money','freelance','bounty','grant','passive income','side project','pay','paid','hiring'];
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json();

  const stories = await Promise.allSettled(
    ids.slice(0, 40).map(id =>
      fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json').then(r => r.json())
    )
  );

  return stories
    .filter(s => s.status === 'fulfilled' && s.value && s.value.url && s.value.title)
    .map(s => s.value)
    .filter(s => kw.some(k => (s.title || '').toLowerCase().includes(k)))
    .slice(0, 10)
    .map(s => {
      const isBounty = /bounty/i.test(s.title);
      const isGrant = /grant|fund/i.test(s.title);
      const cat = isBounty ? 'freelance' : isGrant ? 'grants' : 'other';

      return {
        id: 'hn_' + s.id,
        title: s.title,
        description: 'Hacker News — ' + s.score + ' points · ' + (s.descendants || 0) + ' comments',
        fullDescription: s.title + '\n\nDiscussed on Hacker News with ' + s.score + ' points and ' + (s.descendants || 0) + ' comments. Visit the link to read the full story and discussion.',
        category: cat,
        status: s.score > 300 ? 'trending' : 'new',
        emoji: isBounty ? '💰' : isGrant ? '🎓' : '💡',
        earnings: isBounty ? 'Variable bounty' : isGrant ? 'Variable grant' : 'Varies',
        earningLevel: 'medium',
        trustScore: 7.5,
        rating: Math.min(5, 3 + s.score / 600),
        reviews: s.descendants || 0,
        country: 'Worldwide',
        devices: 'both',
        payment: ['paypal', 'bank'],
        minWithdraw: 'Varies',
        isFree: true,
        difficulty: 'Medium',
        timeRequired: 'Varies',
        url: s.url,
        tags: ['hacker-news', cat],
        source: 'hackernews',
        publishedAt: new Date(s.time * 1000).toISOString(),
        views: s.score || 0
      };
    });
}

// ── 5. Reddit — Real earning communities ────────────────────────
async function fetchReddit() {
  const subs = [
    { name: 'beermoney',      cat: 'surveys',   emoji: '🍺', label: 'BeerMoney' },
    { name: 'WorkOnline',     cat: 'remote',    emoji: '💻', label: 'Work Online' },
    { name: 'slavelabour',    cat: 'freelance', emoji: '🎨', label: 'Slave Labour (Gigs)' },
    { name: 'passive_income', cat: 'affiliate', emoji: '📈', label: 'Passive Income' },
    { name: 'beermoneyuk',    cat: 'surveys',   emoji: '🇬🇧', label: 'BeerMoney UK' },
  ];
  const results = [];

  for (const sub of subs) {
    try {
      const res = await fetch(
        'https://www.reddit.com/r/' + sub.name + '/hot.json?limit=6',
        { headers: { 'User-Agent': 'EarnRadar/4.0' } }
      );
      const data = await res.json();
      const posts = (data.data && data.data.children ? data.data.children : [])
        .filter(p => p.data.score > 20 && !p.data.stickied);

      posts.forEach(p => {
        const d = p.data;
        const text = (d.selftext || d.title || '').substring(0, 200);
        results.push({
          id: 'reddit_' + d.id,
          title: d.title,
          description: text || 'Discussion from r/' + sub.name,
          fullDescription: d.selftext || d.title || 'Visit the Reddit thread for full details.',
          category: sub.cat,
          status: d.score > 500 ? 'trending' : 'new',
          emoji: sub.emoji,
          earnings: 'Community-reported earnings vary',
          earningLevel: 'low',
          trustScore: 7.0,
          rating: Math.min(5, 3 + d.upvote_ratio * 1.5),
          reviews: d.num_comments,
          country: sub.name === 'beermoneyuk' ? 'United Kingdom' : 'Worldwide',
          devices: 'both',
          payment: ['paypal', 'gift'],
          minWithdraw: 'Varies',
          isFree: true,
          difficulty: 'Easy',
          timeRequired: 'Part-time',
          url: 'https://reddit.com' + d.permalink,
          tags: ['reddit', sub.name, sub.cat],
          source: 'reddit',
          publishedAt: new Date(d.created_utc * 1000).toISOString(),
          views: d.score
        });
      });
    } catch(e) {}
  }
  return results;
}

// ── 6. We Work Remotely — RSS Feed ──────────────────────────────
async function fetchWWR() {
  const feeds = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-design-jobs.rss',
    'https://weworkremotely.com/categories/remote-copywriting-jobs.rss',
  ];
  const results = [];

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { headers: { 'User-Agent': 'EarnRadar/4.0' } });
      const text = await res.text();
      const items = parseRSS(text, 15);
      const cat = feedUrl.includes('design') ? 'freelance' : feedUrl.includes('copy') ? 'freelance' : 'remote';
      const emoji = feedUrl.includes('design') ? '🎨' : feedUrl.includes('copy') ? '✍️' : '💻';

      items.forEach(item => {
        const desc = item.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        results.push({
          id: 'wwr_' + btoa(item.link).substring(0, 12),
          title: item.title,
          description: desc.substring(0, 200) || item.title,
          fullDescription: desc.substring(0, 800) || item.title,
          category: cat,
          status: 'new',
          emoji: emoji,
          earnings: 'Competitive (see listing)',
          earningLevel: 'medium',
          trustScore: 9.2,
          rating: 4.5,
          reviews: 0,
          country: 'Worldwide (Remote)',
          devices: 'desktop',
          payment: ['bank'],
          minWithdraw: 'Monthly salary',
          isFree: true,
          difficulty: 'Medium',
          timeRequired: 'Full-time',
          url: item.link,
          tags: ['we-work-remotely', cat, 'remote'],
          source: 'weworkremotely',
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          views: 0
        });
      });
    } catch(e) {}
  }
  return results;
}

// ── 7. Crypto Jobs List — Web3 / Crypto earning opportunities ───
async function fetchCryptoJobs() {
  try {
    const res = await fetch('https://cryptojobslist.com/rss.xml', {
      headers: { 'User-Agent': 'EarnRadar/4.0' }
    });
    const text = await res.text();
    const items = parseRSS(text, 15);

    return items.map(item => {
      const desc = item.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return {
        id: 'cjl_' + btoa(item.link).substring(0, 12),
        title: item.title,
        description: desc.substring(0, 200) || item.title,
        fullDescription: desc.substring(0, 800) || item.title,
        category: 'crypto',
        status: 'new',
        emoji: '⛓️',
        earnings: 'Crypto + Fiat salary',
        earningLevel: 'high',
        trustScore: 8.2,
        rating: 4.1,
        reviews: 0,
        country: 'Worldwide (Remote)',
        devices: 'desktop',
        payment: ['crypto', 'bank'],
        minWithdraw: 'Monthly',
        isFree: true,
        difficulty: 'Advanced',
        timeRequired: 'Full-time',
        url: item.link,
        tags: ['crypto', 'web3', 'blockchain', 'defi'],
        source: 'cryptojobslist',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        views: 0
      };
    });
  } catch(e) { return []; }
}

// ── 8. GitHub Bounties — Open source paid issues ─────────────────
async function fetchGitHubBounties() {
  try {
    // Search for repos/issues tagged with bounty
    const res = await fetch(
      'https://api.github.com/search/issues?q=label:bounty+state:open+is:issue&sort=updated&per_page=15',
      { headers: { 'User-Agent': 'EarnRadar/4.0', 'Accept': 'application/vnd.github.v3+json' } }
    );
    const data = await res.json();
    const issues = data.items || [];

    return issues.map(issue => {
      // Try to extract bounty amount from title/body
      const amountMatch = (issue.title + ' ' + (issue.body || '')).match(/\$[\d,]+|\d+\s*(USD|ETH|USDT)/i);
      const amount = amountMatch ? amountMatch[0] : 'Variable bounty';

      return {
        id: 'gh_' + issue.id,
        title: '💰 Bounty: ' + issue.title.substring(0, 80),
        description: (issue.body || issue.title).replace(/\s+/g, ' ').substring(0, 200),
        fullDescription: (issue.body || issue.title).replace(/\s+/g, ' ').substring(0, 800),
        category: 'freelance',
        status: 'new',
        emoji: '⚡',
        earnings: amount,
        earningLevel: 'variable',
        trustScore: 8.0,
        rating: 4.0,
        reviews: issue.comments || 0,
        country: 'Worldwide',
        devices: 'desktop',
        payment: ['crypto', 'paypal', 'bank'],
        minWithdraw: 'Varies',
        isFree: true,
        difficulty: 'Advanced',
        timeRequired: 'Per task',
        url: issue.html_url,
        tags: ['github', 'bounty', 'open-source', 'coding'],
        source: 'github',
        publishedAt: issue.updated_at || new Date().toISOString(),
        views: issue.comments || 0
      };
    });
  } catch(e) { return []; }
}

// ── RSS Parser utility ───────────────────────────────────────────
function parseRSS(xml, limit) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = rx.exec(xml)) !== null && items.length < (limit || 20)) {
    const block = match[1];
    const get = (tag) => {
      const m = new RegExp('<' + tag + '[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/' + tag + '>', 'i').exec(block);
      return m ? m[1].trim() : '';
    };
    const link = get('link') || (/<link>(.*?)<\/link>/i.exec(block) || [])[1] || '';
    const title = get('title');
    if (title && link) {
      items.push({
        title,
        link,
        description: get('description'),
        pubDate: get('pubDate')
      });
    }
  }
  return items;
}
