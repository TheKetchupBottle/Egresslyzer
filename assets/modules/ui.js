export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return node;
}

export function clearCard(mountId) {
  const root = document.getElementById(mountId);
  if (root) root.innerHTML = "";
}

export function addRow(mountId, { name, note, value, status, mono = true }) {
  const root = document.getElementById(mountId);
  if (!root) return null;
  const row = el("div", { class: "row" });
  const label = el("div", { class: "label" });
  if (status) {
    const dotWrap = el("span", { class: `pill ${statusClass(status)}` });
    dotWrap.appendChild(el("span", { class: "dot" }));
    dotWrap.appendChild(document.createTextNode(status.label || ""));
    label.appendChild(dotWrap);
  }
  const nameEl = el("span", { class: "name" }, name);
  label.appendChild(nameEl);
  if (note) label.appendChild(el("span", { class: "note" }, note));
  row.appendChild(label);
  const val = el("div", { class: "value" + (mono ? "" : " ") });
  if (value && value.nodeType) val.appendChild(value);
  else if (value == null) {
    val.appendChild(el("span", { class: "skeleton" }));
  } else val.textContent = String(value);
  row.appendChild(val);
  root.appendChild(row);
  return {
    update(newValue, newStatus) {
      val.innerHTML = "";
      if (newValue && newValue.nodeType) val.appendChild(newValue);
      else val.textContent = newValue == null ? "—" : String(newValue);
      if (newStatus) {
        const pill = label.querySelector(".pill");
        if (pill) {
          pill.className = `pill ${statusClass(newStatus)}`;
          pill.innerHTML = "";
          pill.appendChild(el("span", { class: "dot" }));
          pill.appendChild(document.createTextNode(newStatus.label || ""));
        }
      }
    },
    fail(msg) {
      val.innerHTML = "";
      val.appendChild(el("span", { class: "muted" }, msg || "unavailable"));
      const pill = label.querySelector(".pill");
      if (pill) pill.className = "pill err";
    },
  };
}

function statusClass(s) {
  if (!s) return "dim";
  if (s.kind === "ok") return "ok";
  if (s.kind === "warn") return "warn";
  if (s.kind === "err") return "err";
  return "dim";
}

const SUMMARY_FIELDS = [
  ["ipv4", "Public IPv4", "primary outbound v4"],
  ["ipv6", "Public IPv6", "primary outbound v6"],
  ["country", "Country", "from IP intelligence"],
  ["asn", "ASN / ISP", "from IP intelligence"],
  ["rdns", "Reverse DNS", "PTR record"],
  ["pop", "Nearest CF POP", "from cdn-cgi/trace"],
];

const summaryRows = new Map();

export function resetSummary() {
  const root = document.getElementById("summary-body");
  if (!root) return;
  root.innerHTML = "";
  summaryRows.clear();
  for (const [field, name, note] of SUMMARY_FIELDS) {
    const handle = addRow("summary-body", { name, note, value: null });
    summaryRows.set(field, handle);
  }
}

export function setHero(field, value) {
  const row = summaryRows.get(field);
  if (!row) return;
  if (value == null || value === "") row.update("—", { kind: "dim", label: "—" });
  else row.update(String(value), { kind: "ok", label: "OK" });
}

export async function withTimeout(p, ms, label = "timeout") {
  let to;
  const timer = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(label)), ms); });
  try { return await Promise.race([p, timer]); }
  finally { clearTimeout(to); }
}

export async function fetchJSON(url, opts = {}, ms = 8000) {
  const r = await withTimeout(fetch(url, { cache: "no-store", ...opts }), ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await r.json();
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

export async function fetchText(url, opts = {}, ms = 8000) {
  const r = await withTimeout(fetch(url, { cache: "no-store", ...opts }), ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}
