import { addRow, fetchText, withTimeout } from "./ui.js";

// IATA airport code → city for nicer display of Cloudflare colo etc.
const IATA = {
  AMS:"Amsterdam",ARN:"Stockholm",ATL:"Atlanta",AUH:"Abu Dhabi",AUS:"Austin",BCN:"Barcelona",BLR:"Bangalore",
  BNE:"Brisbane",BOG:"Bogotá",BOS:"Boston",BRU:"Brussels",BUD:"Budapest",CAI:"Cairo",CCS:"Caracas",
  CDG:"Paris",CGK:"Jakarta",CMB:"Colombo",CMH:"Columbus",CNX:"Chiang Mai",CPH:"Copenhagen",CPT:"Cape Town",
  DAC:"Dhaka",DEL:"Delhi",DEN:"Denver",DFW:"Dallas",DME:"Moscow",DOH:"Doha",DTW:"Detroit",DUB:"Dublin",
  DUR:"Durban",DXB:"Dubai",EWR:"New York (EWR)",EZE:"Buenos Aires",FCO:"Rome",FOR:"Fortaleza",FRA:"Frankfurt",
  GIG:"Rio de Janeiro",GRU:"São Paulo",GVA:"Geneva",HAM:"Hamburg",HEL:"Helsinki",HKG:"Hong Kong",
  HND:"Tokyo (HND)",HNL:"Honolulu",IAD:"Washington DC",ICN:"Seoul",IST:"Istanbul",JFK:"New York (JFK)",
  JNB:"Johannesburg",KIX:"Osaka",KUL:"Kuala Lumpur",LAS:"Las Vegas",LAX:"Los Angeles",LHR:"London",
  LIM:"Lima",LIS:"Lisbon",LOS:"Lagos",MAA:"Chennai",MAD:"Madrid",MAN:"Manchester",MCI:"Kansas City",
  MCT:"Muscat",MDE:"Medellín",MEL:"Melbourne",MEX:"Mexico City",MIA:"Miami",MNL:"Manila",MRS:"Marseille",
  MSP:"Minneapolis",MUC:"Munich",NBO:"Nairobi",NRT:"Tokyo (NRT)",ORD:"Chicago",OSL:"Oslo",OTP:"Bucharest",
  PER:"Perth",PHL:"Philadelphia",PHX:"Phoenix",PRG:"Prague",QRO:"Querétaro",RUH:"Riyadh",SCL:"Santiago",
  SEA:"Seattle",SFO:"San Francisco",SGN:"Ho Chi Minh City",SIN:"Singapore",SJC:"San Jose",SJU:"San Juan",
  SLC:"Salt Lake City",SOF:"Sofia",STL:"St. Louis",SYD:"Sydney",TLV:"Tel Aviv",TPA:"Tampa",TPE:"Taipei",
  TXL:"Berlin",VIE:"Vienna",WAW:"Warsaw",YOW:"Ottawa",YUL:"Montréal",YVR:"Vancouver",YYZ:"Toronto",
  ZRH:"Zurich"
};

function expandIata(code) {
  if (!code) return null;
  const m = String(code).toUpperCase().match(/[A-Z]{3}/);
  if (!m) return code;
  const c = m[0];
  return IATA[c] ? `${c} — ${IATA[c]}` : c;
}

async function cloudflareColo() {
  const start = performance.now();
  const t = await fetchText("https://www.cloudflare.com/cdn-cgi/trace");
  const ms = Math.round(performance.now() - start);
  const colo = (t.match(/^colo=(.+)$/m) || [])[1];
  const loc = (t.match(/^loc=(.+)$/m) || [])[1];
  const fields = Object.fromEntries(
    t.split("\n").map((line) => line.split("=")).filter((parts) => parts.length === 2)
  );
  return { colo, loc, fields, ms };
}

async function timedReachable(url, timeoutMs = 5000) {
  const start = performance.now();
  try {
    await withTimeout(fetch(url, { cache: "no-store", mode: "no-cors" }), timeoutMs);
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

async function probeImageLatency(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const start = performance.now();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve({ ok, ms: Math.round(performance.now() - start) });
    };
    img.referrerPolicy = "no-referrer";
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
    setTimeout(() => finish(false), timeoutMs);
  });
}

async function cloudflareMeta() {
  const r = await withTimeout(fetch("https://speed.cloudflare.com/meta", { cache: "no-store" }), 6000);
  if (!r.ok) throw new Error("meta " + r.status);
  return await r.json();
}

async function detectHttpProtocol(url) {
  // Prefer the high-fidelity nextHopProtocol from Resource Timing — needs a
  // Timing-Allow-Origin: * response. Cloudflare's static assets set it.
  try {
    const r = await withTimeout(fetch(url, { cache: "no-store" }), 5000);
    await r.text().catch(() => {});
    const entry = performance.getEntriesByType("resource").reverse().find((e) => e.name.startsWith(url.split("?")[0]));
    if (entry && entry.nextHopProtocol) return entry.nextHopProtocol;
  } catch {}
  return null;
}

export async function runCDN({ mount, setHero }) {
  const cf = addRow(mount, { name: "Cloudflare POP", note: "www.cloudflare.com/cdn-cgi/trace (colo)", value: null });
  const cfLatency = addRow(mount, { name: "Cloudflare edge latency", note: "trace round-trip", value: null });
  const cfTrace = addRow(mount, { name: "Cloudflare trace details", note: "HTTP version, TLS, WARP, SNI, gateway", value: null });
  const cfClient = addRow(mount, { name: "Cloudflare-observed client", note: "ip / uag / kex from cdn-cgi/trace", value: null });
  const cfProto = addRow(mount, { name: "HTTP protocol negotiated", note: "Resource Timing nextHopProtocol vs cloudflare static", value: null });
  const cfMeta = addRow(mount, { name: "Cloudflare meta", note: "speed.cloudflare.com/meta", value: null });
  const cfClientMeta = addRow(mount, { name: "Cloudflare client network", note: "speed.cloudflare.com/meta ASN data", value: null });
  const ipv6Edge = addRow(mount, { name: "Cloudflare IPv6 edge", note: "[2606:4700:4700::1111]/cdn-cgi/trace via fetch", value: null });

  const google = addRow(mount, { name: "Google edge", note: "gstatic.com reachability probe", value: null });
  const apple = addRow(mount, { name: "Apple CDN", note: "www.apple.com favicon (Akamai)", value: null });
  const fastly = addRow(mount, { name: "Fastly edge", note: "www.fastly.com homepage probe", value: null });
  const ghPages = addRow(mount, { name: "GitHub Pages edge", note: "githubassets.com favicon (Fastly)", value: null });
  const aws = addRow(mount, { name: "AWS CloudFront edge", note: "d1.awsstatic.com test asset", value: null });
  const akamai = addRow(mount, { name: "Akamai edge", note: "www.akamai.com homepage probe", value: null });
  const bunny = addRow(mount, { name: "Bunny.net edge", note: "bunnycdn.com homepage probe", value: null });
  const azure = addRow(mount, { name: "Azure Front Door edge", note: "azure.microsoft.com favicon", value: null });
  const jsdelivr = addRow(mount, { name: "jsDelivr edge", note: "cdn.jsdelivr.net asset (Fastly+Cloudflare)", value: null });

  // Cloudflare
  cloudflareColo().then(({ colo, loc, fields, ms }) => {
    if (!colo) return cf.fail("no colo");
    cf.update(expandIata(colo) + (loc ? ` · loc=${loc}` : ""), { kind: "ok", label: "OK" });
    cfLatency.update(`${ms} ms`, { kind: ms < 100 ? "ok" : ms < 300 ? "warn" : "err", label: `${ms} ms` });
    cfTrace.update(
      [
        fields.http && `http=${fields.http}`,
        fields.tls && `tls=${fields.tls}`,
        fields.warp && `warp=${fields.warp}`,
        fields.gateway && `gateway=${fields.gateway}`,
        fields.sni && `sni=${fields.sni}`,
        fields.fl && `fl=${fields.fl}`,
        fields.h && `h=${fields.h}`,
      ].filter(Boolean).join(" · ") || "—",
      { kind: "ok", label: "TRACE" }
    );
    cfClient.update(
      [
        fields.ip && `ip=${fields.ip}`,
        fields.ts && `ts=${fields.ts}`,
        fields.visit_scheme && `scheme=${fields.visit_scheme}`,
        fields.uag && `ua=${fields.uag.length > 60 ? fields.uag.slice(0, 60) + "…" : fields.uag}`,
        fields.kex && `kex=${fields.kex}`,
      ].filter(Boolean).join(" · ") || "—",
      { kind: "ok", label: "CLIENT" }
    );
    setHero("pop", expandIata(colo));
  }).catch(() => {
    cf.fail("blocked");
    cfLatency.fail("blocked");
    cfTrace.fail("blocked");
    cfClient.fail("blocked");
  });

  detectHttpProtocol("https://www.cloudflare.com/cdn-cgi/trace").then((proto) => {
    if (!proto) return cfProto.fail("no timing info");
    cfProto.update(proto, { kind: proto.includes("h3") ? "ok" : "warn", label: proto });
  }).catch(() => cfProto.fail("no timing info"));

  cloudflareMeta().then((m) => {
    if (!m) return cfMeta.fail("none");
    const parts = [
      m.colo && `colo=${m.colo}`,
      m.city, m.region, m.country,
      m.postalCode && `${m.postalCode}`,
      m.httpProtocol && `http=${m.httpProtocol}`,
    ].filter(Boolean);
    cfMeta.update(parts.join(" · ") || "—", { kind: "ok", label: "OK" });
    cfClientMeta.update(
      [
        m.asn && `AS${m.asn}`,
        m.asOrganization,
        m.clientIp,
        m.latitude && m.longitude && `${m.latitude}, ${m.longitude}`,
        m.timezone,
      ].filter(Boolean).join(" · ") || "—",
      { kind: "ok", label: "META" }
    );
  }).catch(() => {
    cfMeta.fail("blocked");
    cfClientMeta.fail("blocked");
  });

  timedReachable("https://[2606:4700:4700::1111]/cdn-cgi/trace").then(({ ok, ms }) => {
    if (ok) ipv6Edge.update(`${ms} ms`, { kind: "ok", label: "IPv6" });
    else ipv6Edge.fail("no IPv6 egress");
  });

  // Latency/timing probes against well-known edges that allow image loads.
  const edgeProbes = [
    [google,   "https://www.gstatic.com/generate_204"],
    [apple,    "https://www.apple.com/favicon.ico"],
    [fastly,   "https://www.fastly.com/favicon.ico"],
    [ghPages,  "https://github.githubassets.com/favicons/favicon.svg"],
    [aws,      "https://d1.awsstatic.com/favicon.ico"],
    [akamai,   "https://www.akamai.com/favicon.ico"],
    [bunny,    "https://bunny.net/favicon.ico"],
    [azure,    "https://azure.microsoft.com/favicon.ico"],
    [jsdelivr, "https://cdn.jsdelivr.net/npm/lodash/package.json"],
  ];
  for (const [row, url] of edgeProbes) {
    probeImageLatency(url, 5000).then(({ ok, ms }) => {
      if (ok) row.update(`${ms} ms`, { kind: ms < 150 ? "ok" : ms < 400 ? "warn" : "err", label: `${ms} ms` });
      else row.fail("unreachable");
    });
  }

  addRow(mount, {
    name: "Edge POP headers",
    note: "x-served-by (Fastly), x-amz-cf-pop (CloudFront), server (Bunny)",
    value: "headers hidden from cross-origin JS by CORS — only Cloudflare exposes POP via cdn-cgi/trace",
    status: { kind: "dim", label: "N/A" },
  });
}
