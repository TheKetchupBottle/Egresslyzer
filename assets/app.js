import { runDual } from "./modules/dual.js";
import { runConnectivity } from "./modules/connectivity.js";
import { runOutbound } from "./modules/outbound.js";
import { runWebRTC } from "./modules/webrtc.js";
import { runCDN } from "./modules/cdn.js";
import { runDNS } from "./modules/dns.js";
import { runIntel } from "./modules/intel.js";
import { runBrowser } from "./modules/browser.js";
import { clearCard, setHero, resetSummary } from "./modules/ui.js";

const SECONDARY = [
  { id: "outbound-body", fn: runOutbound },
  { id: "dns-body", fn: runDNS },
  { id: "webrtc-body", fn: runWebRTC },
  { id: "cdn-body", fn: runCDN },
  { id: "intel-body", fn: runIntel },
  { id: "browser-body", fn: runBrowser },
];

async function runAll() {
  for (const t of SECONDARY) clearCard(t.id);
  resetSummary();
  runDual({ setHero });
  runConnectivity();
  await Promise.allSettled(
    SECONDARY.map((t) => t.fn({ mount: t.id, setHero, state: {} }))
  );
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

// Toggle chips: hide ip / hide location
const TOGGLES = {
  "hide-ip": "ip",
  "hide-location": "location",
};
for (const [attr, mode] of Object.entries(TOGGLES)) {
  const btn = document.querySelector(`[data-toggle="${attr}"]`);
  if (!btn) continue;
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    const current = (document.body.dataset.hide || "").split(" ").filter(Boolean);
    const next = on ? [...new Set([...current, mode])] : current.filter((m) => m !== mode);
    document.body.dataset.hide = next.join(" ");
  });
}

// Tab navigation
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
function activateTab(name) {
  let found = false;
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    if (on) found = true;
  });
  if (!found) name = "overview";
  panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
  if (location.hash.replace("#", "") !== name) {
    history.replaceState(null, "", "#" + name);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
tabs.forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
document.querySelectorAll("[data-jump]").forEach((b) => {
  b.addEventListener("click", () => activateTab(b.dataset.jump));
});
window.addEventListener("hashchange", () => activateTab(location.hash.replace("#", "") || "overview"));
activateTab(location.hash.replace("#", "") || "overview");

runAll();
