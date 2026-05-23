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

  addRow(mount, { name: "User-Agent", note: "navigator.userAgent", value: ua });
  addRow(mount, { name: "Platform", note: "client hints / navigator", value: platform });
  addRow(mount, { name: "Languages", note: "navigator.languages", value: langs || "—" });
  addRow(mount, { name: "Timezone", note: "Intl.DateTimeFormat", value: tz });
  addRow(mount, { name: "Screen", note: "screen + devicePixelRatio", value: screenStr });
  addRow(mount, { name: "Cookies", note: "navigator.cookieEnabled", value: cookieEnabled });
  addRow(mount, { name: "Do Not Track", note: "navigator.doNotTrack", value: doNotTrack });

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
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  const units = ["KB","MB","GB","TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + " " + units[i];
}
