import { addRow } from "./ui.js";

export async function runBrowser({ mount }) {
  const nav = navigator || {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  const langs = (nav.languages || [nav.language]).filter(Boolean).join(", ");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const screenStr = `${screen.width}×${screen.height} @ ${window.devicePixelRatio}x · ${screen.colorDepth}bpp`;
  const ua = nav.userAgent || "—";
  const platform = nav.userAgentData?.platform || nav.platform || "—";
  const cookieEnabled = nav.cookieEnabled ? "yes" : "no";
  const doNotTrack = nav.doNotTrack === "1" ? "yes" : "no";
  const viewport = `${window.innerWidth}×${window.innerHeight} CSS px`;
  const hardware = [
    nav.hardwareConcurrency && `${nav.hardwareConcurrency} logical cores`,
    nav.deviceMemory && `${nav.deviceMemory} GB device memory`,
    nav.maxTouchPoints !== undefined && `${nav.maxTouchPoints} touch points`,
  ].filter(Boolean).join(" · ") || "not exposed";
  const colorScheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no preference";

  addRow(mount, { name: "User-Agent", note: "navigator.userAgent", value: ua });
  addRow(mount, { name: "Platform", note: "client hints / navigator", value: platform });
  addRow(mount, { name: "Browser brand", note: "navigator.userAgentData.brands", value: nav.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ") || "not exposed" });
  addRow(mount, { name: "Languages", note: "navigator.languages", value: langs || "—" });
  addRow(mount, { name: "Timezone", note: "Intl.DateTimeFormat", value: tz });
  addRow(mount, { name: "Timezone offset", note: "Date.getTimezoneOffset", value: `${new Date().getTimezoneOffset()} minutes from UTC` });
  addRow(mount, { name: "Screen", note: "screen + devicePixelRatio", value: screenStr });
  addRow(mount, { name: "Viewport", note: "current browser viewport", value: viewport });
  addRow(mount, { name: "Hardware hints", note: "cores, memory, touch capability", value: hardware });
  addRow(mount, { name: "Display preferences", note: "media query preferences", value: `color-scheme ${colorScheme} · motion ${reducedMotion}` });
  addRow(mount, { name: "Cookies", note: "navigator.cookieEnabled", value: cookieEnabled });
  addRow(mount, { name: "Do Not Track", note: "navigator.doNotTrack", value: doNotTrack });
  addRow(mount, { name: "Automation", note: "navigator.webdriver", value: nav.webdriver ? "webdriver detected" : "not detected", status: nav.webdriver ? { kind: "warn", label: "YES" } : { kind: "ok", label: "NO" } });
  addRow(mount, { name: "Online state", note: "navigator.onLine", value: nav.onLine ? "online" : "offline", status: nav.onLine ? { kind: "ok", label: "ON" } : { kind: "err", label: "OFF" } });

  if (conn) {
    const parts = [];
    if (conn.effectiveType) parts.push(conn.effectiveType);
    if (conn.downlink) parts.push(`${conn.downlink} Mbps`);
    if (conn.rtt !== undefined) parts.push(`${conn.rtt} ms RTT`);
    if (conn.saveData) parts.push("save-data on");
    addRow(mount, { name: "Network", note: "NetworkInformation API", value: parts.join(" · ") || "—" });
  } else {
    addRow(mount, { name: "Network", note: "NetworkInformation API", value: "not exposed", status: { kind: "dim", label: "—" } });
  }

  // Storage estimate
  addRow(mount, {
    name: "Local storage",
    note: "localStorage / sessionStorage availability",
    value: `${storageAvailable("localStorage") ? "localStorage yes" : "localStorage no"} · ${storageAvailable("sessionStorage") ? "sessionStorage yes" : "sessionStorage no"}`,
  });

  if (nav.storage?.estimate) {
    try {
      const e = await nav.storage.estimate();
      if (e.quota) {
        addRow(mount, {
          name: "Storage quota",
          note: "navigator.storage.estimate",
          value: `${formatBytes(e.usage || 0)} / ${formatBytes(e.quota)}`,
        });
      }
    } catch {}
  }

  if (nav.permissions?.query) {
    const states = [];
    for (const name of ["geolocation", "notifications", "camera", "microphone"]) {
      try {
        const p = await nav.permissions.query({ name });
        states.push(`${name}:${p.state}`);
      } catch {}
    }
    if (states.length) addRow(mount, { name: "Permissions", note: "Permissions API states", value: states.join(" · ") });
  }
}

function storageAvailable(name) {
  try {
    const store = window[name];
    const key = "__egz_storage_test__";
    store.setItem(key, "1");
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  const units = ["KB","MB","GB","TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + " " + units[i];
}
