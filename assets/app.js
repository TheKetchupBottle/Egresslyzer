import { runOutbound } from "./modules/outbound.js";
import { runWebRTC } from "./modules/webrtc.js";
import { runCDN } from "./modules/cdn.js";
import { runDNS } from "./modules/dns.js";
import { runIntel } from "./modules/intel.js";
import { runBrowser } from "./modules/browser.js";
import { addRow, clearCard, setHero } from "./modules/ui.js";

const TASKS = [
  { id: "outbound-body", fn: runOutbound, hero: true },
  { id: "webrtc-body", fn: runWebRTC, hero: false },
  { id: "cdn-body", fn: runCDN, hero: true },
  { id: "dns-body", fn: runDNS, hero: false },
  { id: "intel-body", fn: runIntel, hero: true },
  { id: "browser-body", fn: runBrowser, hero: false },
];

const ctx = {
  addRow,
  setHero,
  state: {},
};

async function runAll() {
  for (const t of TASKS) clearCard(t.id);
  // Reset hero placeholders
  for (const id of ["hero-ipv4","hero-ipv6","hero-country","hero-asn","hero-rdns","hero-pop"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="skeleton"></span>';
  }
  // Kick off all probes in parallel
  await Promise.allSettled(TASKS.map((t) => t.fn({ ...ctx, mount: t.id })));
}

document.getElementById("rerun").addEventListener("click", runAll);

const themeBtn = document.getElementById("theme");
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("egz_theme", t);
}
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  applyTheme(cur === "light" ? "dark" : "light");
});
applyTheme(localStorage.getItem("egz_theme") || "dark");

runAll();
