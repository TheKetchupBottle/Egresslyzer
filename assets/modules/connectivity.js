// Reachability + latency to well-known sites. We use a no-cors `fetch` against the
// site's homepage (not its favicon) so it's a real "can the browser reach this
// origin from here" probe; the opaque response still resolves on network success
// and rejects on network failure, which is all we need.
//
// Display icons come from a favicon-service fallback chain so users never see
// an empty icon slot — if every remote fetcher fails we render a letter badge.

const SITES = [
  // China / domestic
  { name: "Baidu", host: "www.baidu.com" },
  { name: "Taobao", host: "www.taobao.com" },
  { name: "Tmall", host: "www.tmall.com" },
  { name: "Alipay", host: "www.alipay.com" },
  { name: "WeChat", host: "weixin.qq.com" },
  { name: "QQ", host: "www.qq.com" },
  { name: "Tencent Video", host: "v.qq.com" },
  { name: "Bilibili", host: "www.bilibili.com" },
  { name: "Weibo", host: "weibo.com" },
  { name: "Douyin", host: "www.douyin.com" },
  { name: "Kuaishou", host: "www.kuaishou.com" },
  { name: "Xiaohongshu", host: "www.xiaohongshu.com" },
  { name: "JD.com", host: "www.jd.com" },
  { name: "Pinduoduo", host: "www.pinduoduo.com" },
  { name: "Meituan", host: "www.meituan.com" },
  { name: "Ele.me", host: "www.ele.me" },
  { name: "Zhihu", host: "www.zhihu.com" },
  { name: "163.com", host: "www.163.com" },
  { name: "NetEase Music", host: "music.163.com" },
  { name: "iQIYI", host: "www.iqiyi.com" },
  { name: "Youku", host: "www.youku.com" },
  { name: "DingTalk", host: "www.dingtalk.com" },
  { name: "Amap", host: "www.amap.com" },
  { name: "Ctrip", host: "www.ctrip.com" },
  { name: "TapTap", host: "www.taptap.cn" },
  { name: "HoYoLAB", host: "www.hoyolab.com" },
  { name: "Sina", host: "www.sina.com.cn" },
  { name: "Sohu", host: "www.sohu.com" },
  { name: "Douban", host: "www.douban.com" },
  { name: "Toutiao", host: "www.toutiao.com" },
  { name: "Xunlei", host: "www.xunlei.com" },
  // Search / portals / mail
  { name: "Google", host: "www.google.com" },
  { name: "Gmail", host: "mail.google.com" },
  { name: "Google Drive", host: "drive.google.com" },
  { name: "Google Maps", host: "www.google.com/maps" },
  { name: "Bing", host: "www.bing.com" },
  { name: "DuckDuckGo", host: "duckduckgo.com" },
  { name: "Yahoo", host: "www.yahoo.com" },
  { name: "Yandex", host: "yandex.com" },
  { name: "Naver", host: "www.naver.com" },
  { name: "Wikipedia", host: "www.wikipedia.org" },
  // Video / streaming
  { name: "YouTube", host: "www.youtube.com" },
  { name: "Netflix", host: "www.netflix.com" },
  { name: "Twitch", host: "www.twitch.tv" },
  { name: "Disney+", host: "www.disneyplus.com" },
  { name: "Hulu", host: "www.hulu.com" },
  { name: "Prime Video", host: "www.primevideo.com" },
  { name: "HBO Max", host: "www.max.com" },
  { name: "Vimeo", host: "vimeo.com" },
  { name: "Niconico", host: "www.nicovideo.jp" },
  // Music
  { name: "Spotify", host: "open.spotify.com" },
  { name: "Apple Music", host: "music.apple.com" },
  { name: "SoundCloud", host: "soundcloud.com" },
  { name: "Bandcamp", host: "bandcamp.com" },
  // Social
  { name: "X / Twitter", host: "x.com" },
  { name: "Facebook", host: "www.facebook.com" },
  { name: "Instagram", host: "www.instagram.com" },
  { name: "Threads", host: "www.threads.net" },
  { name: "TikTok", host: "www.tiktok.com" },
  { name: "Reddit", host: "www.reddit.com" },
  { name: "Pinterest", host: "www.pinterest.com" },
  { name: "Tumblr", host: "www.tumblr.com" },
  { name: "LinkedIn", host: "www.linkedin.com" },
  { name: "Mastodon", host: "joinmastodon.org" },
  { name: "Bluesky", host: "bsky.app" },
  // Messaging / collab
  { name: "Discord", host: "discord.com" },
  { name: "WhatsApp", host: "www.whatsapp.com" },
  { name: "Telegram", host: "telegram.org" },
  { name: "Signal", host: "signal.org" },
  { name: "Slack", host: "slack.com" },
  { name: "Zoom", host: "zoom.us" },
  { name: "Microsoft Teams", host: "teams.microsoft.com" },
  { name: "LINE", host: "line.me" },
  { name: "KakaoTalk", host: "www.kakaocorp.com" },
  // Dev / docs
  { name: "GitHub", host: "github.com" },
  { name: "GitLab", host: "gitlab.com" },
  { name: "Bitbucket", host: "bitbucket.org" },
  { name: "Stack Overflow", host: "stackoverflow.com" },
  { name: "npm", host: "www.npmjs.com" },
  { name: "PyPI", host: "pypi.org" },
  { name: "Docker Hub", host: "hub.docker.com" },
  { name: "MDN", host: "developer.mozilla.org" },
  { name: "Hugging Face", host: "huggingface.co" },
  // AI
  { name: "ChatGPT", host: "chatgpt.com" },
  { name: "OpenAI", host: "openai.com" },
  { name: "Claude", host: "claude.ai" },
  { name: "Anthropic", host: "www.anthropic.com" },
  { name: "Gemini", host: "gemini.google.com" },
  { name: "Perplexity", host: "www.perplexity.ai" },
  { name: "Mistral", host: "mistral.ai" },
  // Gaming
  { name: "Steam", host: "store.steampowered.com" },
  { name: "Epic Games", host: "store.epicgames.com" },
  { name: "Roblox", host: "www.roblox.com" },
  { name: "Minecraft", host: "www.minecraft.net" },
  { name: "PlayStation", host: "www.playstation.com" },
  { name: "Xbox", host: "www.xbox.com" },
  { name: "Nintendo", host: "www.nintendo.com" },
  { name: "Riot Games", host: "www.riotgames.com" },
  // E-commerce / business
  { name: "Amazon", host: "www.amazon.com" },
  { name: "eBay", host: "www.ebay.com" },
  { name: "Etsy", host: "www.etsy.com" },
  { name: "Shopify", host: "www.shopify.com" },
  { name: "PayPal", host: "www.paypal.com" },
  { name: "Stripe", host: "stripe.com" },
  // Productivity / storage
  { name: "Dropbox", host: "www.dropbox.com" },
  { name: "Notion", host: "www.notion.so" },
  { name: "Figma", host: "www.figma.com" },
  { name: "Canva", host: "www.canva.com" },
  { name: "Trello", host: "trello.com" },
  // Platforms
  { name: "Apple", host: "www.apple.com" },
  { name: "Microsoft", host: "www.microsoft.com" },
  { name: "Cloudflare", host: "www.cloudflare.com" },
];

// Fallback chain of icon providers. DuckDuckGo's icon service serves a generic
// globe icon on failure rather than an HTTP error, so it doubles as a guaranteed
// last remote fallback.
function iconCandidates(host) {
  return [
    `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://${host}/favicon.ico`,
  ];
}

const LETTER_PALETTE = [
  "#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04",
  "#ea580c", "#dc2626", "#db2777", "#9333ea", "#475569",
];

function letterBadge(name) {
  const ch = (name.trim()[0] || "?").toUpperCase();
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = LETTER_PALETTE[code % LETTER_PALETTE.length];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'>` +
    `<rect width='18' height='18' rx='4' fill='${bg}'/>` +
    `<text x='9' y='12.5' text-anchor='middle' font-family='-apple-system,Segoe UI,Roboto,sans-serif' font-size='11' font-weight='600' fill='white'>${ch}</text>` +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function attachIcon(imgEl, host, name) {
  const candidates = iconCandidates(host);
  let i = 0;
  imgEl.onerror = () => {
    i++;
    if (i < candidates.length) imgEl.src = candidates[i];
    else imgEl.src = letterBadge(name);
  };
  imgEl.src = candidates[0];
}

// Cache-busting on every tick re-downloads the asset and defeats HTTP caching —
// expensive over a 1-second poll. We let the browser cache the favicon and use
// HTTP conditional revalidation instead, which is just a few bytes per tick after
// the first hit (the round-trip time is still the real network latency).
function probeFavicon(host, timeoutMs) {
  return new Promise((resolve) => {
    const start = performance.now();
    const img = new Image();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      img.onload = img.onerror = null;
      resolve({ ok, ms: Math.round(performance.now() - start) });
    };
    img.referrerPolicy = "no-referrer";
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = `https://${host}/favicon.ico?_=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTimeout(() => finish(false), timeoutMs);
  });
}

// Fallback for hosts whose favicon path 404s but the origin is reachable.
// no-cors HEAD-style: we abort the response as soon as the browser hands us
// the (opaque) response object, so we never download the body. The promise
// resolves either way — what matters is the network round-trip succeeded.
function probeFetchHead(host, timeoutMs) {
  return new Promise((resolve) => {
    const start = performance.now();
    const ctrl = new AbortController();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { ctrl.abort(); } catch {}
      resolve({ ok, ms: Math.round(performance.now() - start) });
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    fetch(`https://${host}/?_=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      method: "GET",
      mode: "no-cors",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(() => { clearTimeout(timer); finish(true); })
      .catch(() => { clearTimeout(timer); finish(false); });
  });
}

const PROBE_METHODS = {
  favicon: probeFavicon,
  head:    probeFetchHead,
};

// Per-host memo of which probe worked. Avoids paying the cost of a failed
// method every tick after we already know the working one.
const hostProbeCache = new Map();

async function probeReachable(host, timeoutMs = 4000) {
  const cached = hostProbeCache.get(host);
  if (cached) {
    const r = await PROBE_METHODS[cached](host, timeoutMs);
    if (r.ok) return r;
    // working method just failed — fall through to retry the alternates once.
    hostProbeCache.delete(host);
  }
  for (const method of ["head", "favicon"]) {
    const r = await PROBE_METHODS[method](host, timeoutMs);
    if (r.ok) {
      hostProbeCache.set(host, method);
      return r;
    }
  }
  return { ok: false, ms: 0 };
}

function makeCell(site) {
  const cell = document.createElement("div");
  cell.className = "conn-cell";
  cell.title = site.host;

  const ic = document.createElement("span");
  ic.className = "conn-icon";
  const im = document.createElement("img");
  im.referrerPolicy = "no-referrer";
  im.alt = "";
  im.width = 18;
  im.height = 18;
  attachIcon(im, site.host, site.name);
  ic.appendChild(im);

  const nm = document.createElement("span");
  nm.className = "conn-name";
  nm.textContent = site.name;

  const lat = document.createElement("span");
  lat.className = "conn-latency";
  lat.textContent = "…";

  cell.append(ic, nm, lat);
  return { cell, lat };
}

// Color gradient green → yellow → red based on latency (ms).
// 0ms = green, 600ms = yellow, ≥1500ms = red.
function latencyColor(ms) {
  const stops = [
    { ms: 0,    rgb: [16, 217, 120] },   // vivid green
    { ms: 600,  rgb: [255, 170, 0] },    // vivid amber
    { ms: 1500, rgb: [255, 56, 56] },    // vivid red
  ];
  if (ms <= stops[0].ms) return `rgb(${stops[0].rgb.join(",")})`;
  for (let i = 1; i < stops.length; i++) {
    if (ms <= stops[i].ms) {
      const a = stops[i - 1], b = stops[i];
      const t = (ms - a.ms) / (b.ms - a.ms);
      const rgb = a.rgb.map((c, k) => Math.round(c + (b.rgb[k] - c) * t));
      return `rgb(${rgb.join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1].rgb.join(",")})`;
}

const INTERVAL_MS = 1000;
const RUN_DURATION_MS = 5000;
const STAT_STORAGE_KEY = "egz_ping_stat";

const STATS = {
  min: (xs) => xs.reduce((a, b) => Math.min(a, b), Infinity),
  avg: (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
  median: (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  },
};

let currentStat = "median";
const allTargets = new Set();

function renderTarget(target) {
  const { cell, lat, samples } = target;
  const good = samples.filter((v) => v != null);
  lat.classList.remove("fast", "medium", "slow", "blocked");
  if (!good.length) {
    cell.classList.remove("ok"); cell.classList.add("err");
    lat.textContent = "blocked";
    lat.style.color = "";
    lat.classList.add("blocked");
    return;
  }
  cell.classList.remove("err"); cell.classList.add("ok");
  const stat = STATS[currentStat] || STATS.median;
  const value = Math.round(stat(good));
  lat.textContent = value + " ms";
  lat.style.color = latencyColor(value);
}

function tick(target) {
  probeReachable(target.site.host, INTERVAL_MS * 5).then(({ ok, ms }) => {
    target.samples.push(ok ? ms : null);
    renderTarget(target);
  });
}

function setStat(name) {
  if (!STATS[name]) name = "median";
  currentStat = name;
  try { localStorage.setItem(STAT_STORAGE_KEY, name); } catch {}
  for (const t of allTargets) renderTarget(t);
}

const groupTimers = new Map();

function runGroup(mountId, sites) {
  const root = document.getElementById(mountId);
  if (!root) return;
  if (groupTimers.has(mountId)) {
    clearInterval(groupTimers.get(mountId));
    groupTimers.delete(mountId);
  }
  root.innerHTML = "";
  const targets = sites.map((s) => {
    const { cell, lat } = makeCell(s);
    root.appendChild(cell);
    const t = { site: s, cell, lat, samples: [] };
    allTargets.add(t);
    return t;
  });

  for (const t of targets) tick(t);
  const id = setInterval(() => {
    for (const t of targets) tick(t);
  }, INTERVAL_MS);
  groupTimers.set(mountId, id);
  setTimeout(() => {
    if (groupTimers.get(mountId) === id) {
      clearInterval(id);
      groupTimers.delete(mountId);
    }
  }, RUN_DURATION_MS);
}

function wireStatSelector() {
  const sel = document.getElementById("ping-stat");
  if (!sel || sel.dataset.wired) return;
  sel.dataset.wired = "1";
  const stored = (() => { try { return localStorage.getItem(STAT_STORAGE_KEY); } catch { return null; } })();
  if (stored && STATS[stored]) currentStat = stored;
  sel.value = currentStat;
  sel.addEventListener("change", () => setStat(sel.value));
}

export async function runConnectivity() {
  wireStatSelector();
  allTargets.clear();
  runGroup("conn-all", SITES);
}
