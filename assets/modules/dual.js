import { fetchJSON, fetchText, withTimeout } from "./ui.js";

function flag(cc) {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - 65, A + cc.toUpperCase().charCodeAt(1) - 65);
}

const PROBES = [
  {
    name: "ipapi.co",
    fn: async () => {
      const j = await fetchJSON("https://ipapi.co/json/", {}, 8000);
      if (j.error) throw new Error(j.reason || "ipapi error");
      return {
        ip: j.ip,
        country_code: j.country_code,
        country: j.country_name,
        region: j.region,
        city: j.city,
        postal: j.postal,
        isp: j.org,
        asn: j.asn,
        timezone: j.timezone,
        lat: j.latitude,
        lon: j.longitude,
      };
    },
  },
  {
    name: "ipinfo.io",
    fn: async () => {
      const j = await fetchJSON("https://ipinfo.io/json", {}, 8000);
      const [asn, ...rest] = (j.org || "").split(" ");
      const [lat, lon] = (j.loc || "").split(",").map((n) => (n ? parseFloat(n) : null));
      return {
        ip: j.ip,
        country_code: j.country,
        region: j.region,
        city: j.city,
        postal: j.postal,
        isp: rest.join(" ") || j.org,
        asn: /^AS\d+/i.test(asn) ? asn : null,
        timezone: j.timezone,
        lat,
        lon,
      };
    },
  },
  {
    name: "ipwho.is",
    fn: async () => {
      const j = await fetchJSON("https://ipwho.is/", {}, 8000);
      if (j.success === false) throw new Error(j.message || "ipwho.is error");
      return {
        ip: j.ip,
        country_code: j.country_code,
        country: j.country,
        region: j.region,
        city: j.city,
        postal: j.postal,
        isp: j.connection?.org || j.connection?.isp,
        asn: j.connection?.asn ? `AS${j.connection.asn}` : null,
        timezone: j.timezone?.id,
        lat: j.latitude,
        lon: j.longitude,
      };
    },
  },
  {
    name: "geojs.io",
    fn: async () => {
      const j = await fetchJSON("https://get.geojs.io/v1/ip/geo.json", {}, 8000);
      return {
        ip: j.ip,
        country_code: j.country_code,
        country: j.country,
        region: j.region,
        city: j.city,
        isp: j.organization_name || j.organization,
        asn: j.asn ? `AS${j.asn}` : null,
        timezone: j.timezone,
        lat: parseFloat(j.latitude),
        lon: parseFloat(j.longitude),
      };
    },
  },
  {
    name: "freeipapi.com",
    fn: async () => {
      const j = await fetchJSON("https://freeipapi.com/api/json", {}, 8000);
      return {
        ip: j.ipAddress,
        country_code: j.countryCode,
        country: j.countryName,
        region: j.regionName,
        city: j.cityName,
        postal: j.zipCode,
        timezone: j.timeZone,
        lat: j.latitude,
        lon: j.longitude,
      };
    },
  },
  {
    name: "reallyfreegeoip.org",
    fn: async () => {
      const j = await fetchJSON("https://reallyfreegeoip.org/json/", {}, 8000);
      return {
        ip: j.ip,
        country_code: j.country_code,
        country: j.country_name,
        region: j.region_name,
        city: j.city,
        postal: j.zip_code,
        timezone: j.time_zone,
        lat: j.latitude,
        lon: j.longitude,
      };
    },
  },
  {
    name: "cloudflare trace",
    fn: async () => {
      const t = await fetchText("https://www.cloudflare.com/cdn-cgi/trace", {}, 6000);
      const ip = (t.match(/^ip=(.+)$/m) || [])[1];
      const loc = (t.match(/^loc=(.+)$/m) || [])[1];
      const colo = (t.match(/^colo=(.+)$/m) || [])[1];
      if (!ip) throw new Error("no ip");
      return { ip, country_code: loc, colo };
    },
  },
  {
    name: "country.is",
    fn: async () => {
      const j = await fetchJSON("https://api.country.is/", {}, 6000);
      return { ip: j.ip, country_code: j.country };
    },
  },
];

function merge(results) {
  const ok = results.filter(Boolean);
  if (!ok.length) return null;
  const pick = (k) => ok.map((r) => r[k]).find((v) => v != null && v !== "");
  return {
    ip: pick("ip"),
    country_code: pick("country_code"),
    country: pick("country"),
    region: pick("region"),
    city: pick("city"),
    postal: pick("postal"),
    isp: pick("isp") || pick("org"),
    asn: pick("asn"),
    colo: pick("colo"),
    timezone: pick("timezone"),
    lat: pick("lat"),
    lon: pick("lon"),
    sources: ok.length,
  };
}

function appendRow(root, name, note, value) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("div");
  label.className = "label";
  const n = document.createElement("span"); n.className = "name"; n.textContent = name;
  const nt = document.createElement("span"); nt.className = "note"; nt.textContent = note;
  label.append(n, nt);
  const val = document.createElement("div");
  val.className = "value";
  if (value == null || value === "") {
    const s = document.createElement("span"); s.className = "skeleton";
    val.appendChild(s);
  } else val.textContent = String(value);
  row.append(label, val);
  root.appendChild(row);
}

function renderCard(rootEl, data, sourceNames, statusEl, summaryEl) {
  rootEl.innerHTML = "";
  if (!data) {
    statusEl.className = "status err";
    statusEl.textContent = "unreachable";
    if (summaryEl) summaryEl.textContent = "—";
    appendRow(rootEl, "IP", "no endpoint responded", "—");
    return;
  }
  statusEl.className = "status ok";
  statusEl.textContent = `${data.sources}/${sourceNames.length} sources`;

  const locParts = [data.city, data.region, data.country || data.country_code].filter(Boolean);
  const locStr = (data.country_code ? flag(data.country_code) + " " : "") + (locParts.join(", ") || "—");
  if (summaryEl) summaryEl.textContent = locStr;

  appendRow(rootEl, "IP Address", "public egress IP", data.ip || "—");
  appendRow(rootEl, "Location", "city / region / country", locStr);
  appendRow(rootEl, "Coordinates", "approximate lat / lon", (data.lat != null && data.lon != null) ? `${data.lat}, ${data.lon}` : "—");
  if (data.postal) appendRow(rootEl, "Postal Code", "from geo database", data.postal);
  if (data.timezone) appendRow(rootEl, "Timezone", "IANA tz", data.timezone);
  appendRow(rootEl, "ISP", "organization", data.isp || "—");
  appendRow(rootEl, "ASN", "autonomous system", data.asn || "—");
  if (data.colo) appendRow(rootEl, "Cloudflare POP", "nearest edge", data.colo);
  appendRow(rootEl, "Sources", "endpoints queried", sourceNames.join(", "));
}

const MAP_PROVIDERS = {
  "osm": {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  },
  "carto-voyager": {
    label: "Carto Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: { maxZoom: 20, subdomains: "abcd", attribution: '&copy; OpenStreetMap, &copy; CARTO' },
  },
  "carto-positron": {
    label: "Carto Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: { maxZoom: 20, subdomains: "abcd", attribution: '&copy; OpenStreetMap, &copy; CARTO' },
  },
  "carto-dark": {
    label: "Carto Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: { maxZoom: 20, subdomains: "abcd", attribution: '&copy; OpenStreetMap, &copy; CARTO' },
  },
  "esri-street": {
    label: "Esri Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "Tiles &copy; Esri" },
  },
  "esri-sat": {
    label: "Esri Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics" },
  },
  "opentopo": {
    label: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 17, attribution: "Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)" },
  },
};
const PROVIDER_ORDER = ["osm", "carto-voyager", "carto-positron", "carto-dark", "esri-street", "esri-sat", "opentopo"];
const PROVIDER_STORAGE_KEY = "egz_map_provider";

let mapInstance = null;
let mapMarker = null;
let mapTileLayer = null;
let currentProviderId = null;
let lastCoords = null;

function applyTileLayer(providerId, { allowFallback = true } = {}) {
  if (!mapInstance) return;
  const provider = MAP_PROVIDERS[providerId] || MAP_PROVIDERS["osm"];
  if (mapTileLayer) {
    mapInstance.removeLayer(mapTileLayer);
    mapTileLayer = null;
  }
  let errorCount = 0;
  let fellBack = false;
  mapTileLayer = L.tileLayer(provider.url, provider.options).addTo(mapInstance);
  mapTileLayer.on("tileerror", () => {
    errorCount++;
    if (!allowFallback || fellBack) return;
    if (errorCount < 4) return;
    const idx = PROVIDER_ORDER.indexOf(providerId);
    const next = PROVIDER_ORDER.slice(idx + 1).concat(PROVIDER_ORDER.slice(0, idx))
      .find((id) => id !== providerId);
    if (!next) return;
    fellBack = true;
    currentProviderId = next;
    const sel = document.getElementById("map-provider");
    if (sel) sel.value = next;
    applyTileLayer(next, { allowFallback: true });
  });
  currentProviderId = providerId;
}

function renderMap(lat, lon, label) {
  const mapEl = document.getElementById("map");
  if (!mapEl || typeof L === "undefined") return;
  if (lat == null || lon == null) {
    mapEl.innerHTML = '<div class="map-empty">No coordinates available</div>';
    return;
  }
  lastCoords = { lat, lon, label };
  if (!mapInstance) {
    mapInstance = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([lat, lon], 10);
    const themeDefault = () => document.documentElement.dataset.theme === "dark" ? "carto-dark" : "carto-positron";
    const stored = (() => { try { return localStorage.getItem(PROVIDER_STORAGE_KEY); } catch { return null; } })();
    const initial = MAP_PROVIDERS[stored] ? stored : themeDefault();
    const sel = document.getElementById("map-provider");
    if (sel) {
      sel.value = initial;
      sel.addEventListener("change", () => {
        const id = sel.value;
        try { localStorage.setItem(PROVIDER_STORAGE_KEY, id); } catch {}
        applyTileLayer(id, { allowFallback: true });
      });
    }
    applyTileLayer(initial, { allowFallback: true });
    // Auto-swap map theme when the UI theme changes, but only if the user hasn't
    // explicitly picked something else (i.e. current selection is still one of
    // the two theme defaults).
    new MutationObserver(() => {
      const auto = currentProviderId === "carto-dark" || currentProviderId === "carto-positron";
      if (!auto) return;
      const next = themeDefault();
      if (next === currentProviderId) return;
      if (sel) sel.value = next;
      applyTileLayer(next, { allowFallback: true });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } else {
    mapInstance.setView([lat, lon], 10);
  }
  if (mapMarker) mapMarker.remove();
  mapMarker = L.marker([lat, lon]).addTo(mapInstance);
  if (label) mapMarker.bindPopup(label).openPopup();
  setTimeout(() => mapInstance.invalidateSize(), 50);
}

async function runProbes() {
  const results = await Promise.all(
    PROBES.map(async (p) => {
      try {
        const r = await withTimeout(p.fn(), 8000);
        if (!r || !r.ip) throw new Error("no IP");
        return { ...r, _name: p.name };
      } catch {
        return null;
      }
    })
  );
  return { merged: merge(results), names: results.filter(Boolean).map((r) => r._name) };
}

export async function runDual({ setHero }) {
  const card = document.querySelector('[data-region="international"]');
  if (!card) return;
  const kv = card.querySelector("[data-kv]");
  const statusEl = card.querySelector("[data-status]");
  const summaryEl = document.getElementById("location-summary");

  kv.innerHTML = "";
  for (const [n, note] of [
    ["IP Address", "public egress IP"],
    ["Location", "city / region / country"],
    ["Coordinates", "approximate lat / lon"],
    ["ISP", "organization"],
    ["ASN", "autonomous system"],
  ]) appendRow(kv, n, note, null);

  statusEl.className = "status";
  statusEl.textContent = "probing…";
  if (summaryEl) summaryEl.textContent = "locating…";

  const { merged, names } = await runProbes();
  renderCard(kv, merged, names, statusEl, summaryEl);

  if (merged) {
    if (merged.ip) {
      if (merged.ip.includes(":")) setHero?.("ipv6", merged.ip);
      else setHero?.("ipv4", merged.ip);
    }
    renderMap(merged.lat, merged.lon, [merged.city, merged.country || merged.country_code].filter(Boolean).join(", ") || merged.ip);
  }
}
