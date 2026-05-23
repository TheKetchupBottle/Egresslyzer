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
  const t = await fetchText("https://1.1.1.1/cdn-cgi/trace");
  const colo = (t.match(/^colo=(.+)$/m) || [])[1];
  const loc = (t.match(/^loc=(.+)$/m) || [])[1];
  return { colo, loc };
}

async function cloudflareMeta() {
  const r = await withTimeout(fetch("https://speed.cloudflare.com/meta", { cache: "no-store" }), 6000);
  if (!r.ok) throw new Error("meta " + r.status);
  return await r.json();
}

async function fastlyPop() {
  // fastly-debug.com publishes a JSON debug endpoint behind Fastly
  const r = await withTimeout(fetch("https://www.fastly-debug.com/anything", { cache: "no-store" }), 6000);
  if (r.ok) {
    const data = await r.json().catch(() => null);
    if (data && data.headers) {
      const pop = data.headers["x-served-by"] || data.headers["X-Served-By"];
      if (pop) return pop;
    }
  }
  // Fallback: try reading via httpbin behind Fastly fronts
  throw new Error("no headers");
}

async function awsPop() {
  // CloudFront stamps responses with X-Amz-Cf-Pop on properly-CORS'd buckets.
  // Amazon's own site has CORS limits; use a known public bucket served via CloudFront.
  const candidates = [
    "https://d1.awsstatic.com/Cloudfront-test/test-200.txt",
    "https://d3l5wxnahfuscp.cloudfront.net/", // placeholder demo distribution
  ];
  for (const u of candidates) {
    try {
      const r = await withTimeout(fetch(u, { cache: "no-store" }), 5000);
      const pop = r.headers.get("x-amz-cf-pop");
      if (pop) return pop;
    } catch (_) {}
  }
  throw new Error("no CF-POP header");
}

async function googlePop() {
  // Google frontends sometimes expose a 'via' header or alt-svc; without CORS we cannot read most.
  // gstatic and fonts.googleapis.com permit CORS for some assets — but headers are still restricted.
  // We perform a timing probe instead and label as "responsive".
  const start = performance.now();
  try {
    await withTimeout(fetch("https://www.gstatic.com/generate_204", { cache: "no-store", mode: "no-cors" }), 5000);
    return `${Math.round(performance.now() - start)} ms`;
  } catch {
    throw new Error("unreachable");
  }
}

async function bunnyPop() {
  // Bunny includes 'server: BunnyCDN-XXX' where XXX is POP code.
  const r = await withTimeout(fetch("https://bunny.net/favicon.ico", { cache: "no-store" }), 5000);
  const srv = r.headers.get("server") || "";
  const m = srv.match(/BunnyCDN-(\S+)/i);
  if (m) return m[1];
  throw new Error("no bunny header");
}

export async function runCDN({ mount, setHero }) {
  const cf = addRow(mount, { name: "Cloudflare", note: "1.1.1.1/cdn-cgi/trace (colo)", value: null });
  const cfMeta = addRow(mount, { name: "Cloudflare meta", note: "speed.cloudflare.com/meta", value: null });
  const fastly = addRow(mount, { name: "Fastly", note: "fastly-debug.com debug headers", value: null });
  const aws = addRow(mount, { name: "AWS CloudFront", note: "x-amz-cf-pop edge header", value: null });
  const google = addRow(mount, { name: "Google", note: "gstatic.com reachability probe", value: null });
  const bunny = addRow(mount, { name: "Bunny.net", note: "server header POP code", value: null });

  // Cloudflare
  cloudflareColo().then(({ colo, loc }) => {
    if (!colo) return cf.fail("no colo");
    const v = expandIata(colo) + (loc ? ` · loc=${loc}` : "");
    cf.update(v, { kind: "ok", label: "OK" });
    setHero("pop", expandIata(colo));
  }).catch(() => cf.fail("blocked"));

  cloudflareMeta().then((m) => {
    if (!m) return cfMeta.fail("none");
    const parts = [m.colo && `colo=${m.colo}`, m.city, m.country].filter(Boolean);
    cfMeta.update(parts.join(" · ") || "—", { kind: "ok", label: "OK" });
  }).catch(() => cfMeta.fail("blocked"));

  fastlyPop().then((p) => fastly.update(p, { kind: "ok", label: "OK" })).catch(() => fastly.fail("CORS-blocked"));
  awsPop().then((p) => aws.update(p, { kind: "ok", label: "OK" })).catch(() => aws.fail("CORS-blocked"));
  googlePop().then((t) => google.update(t, { kind: "ok", label: "OK" })).catch(() => google.fail("unreachable"));
  bunnyPop().then((p) => bunny.update(p, { kind: "ok", label: "OK" })).catch(() => bunny.fail("CORS-blocked"));
}
