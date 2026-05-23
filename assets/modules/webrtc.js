import { addRow, withTimeout } from "./ui.js";

const STUN_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
  "stun:global.stun.twilio.com:3478",
];

function classifyAddress(ip) {
  if (!ip) return "unknown";
  if (ip.endsWith(".local")) return "mDNS (obfuscated)";
  if (ip.includes(":")) {
    if (ip.startsWith("fe80")) return "IPv6 link-local";
    if (/^f[cd]/i.test(ip)) return "IPv6 ULA (private)";
    return "IPv6 public";
  }
  // IPv4
  if (/^10\./.test(ip)) return "RFC1918 private";
  if (/^192\.168\./.test(ip)) return "RFC1918 private";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return "RFC1918 private";
  if (/^169\.254\./.test(ip)) return "link-local";
  if (/^127\./.test(ip)) return "loopback";
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return "CGNAT";
  return "public";
}

async function gatherCandidates(stunUrl, ms = 5000) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
  const candidates = [];
  const start = performance.now();
  let firstSrflxMs = null;
  let resolve;
  const done = new Promise((r) => (resolve = r));
  pc.onicecandidate = (e) => {
    if (!e.candidate) { resolve(); return; }
    if (firstSrflxMs == null && / typ srflx/.test(e.candidate.candidate)) {
      firstSrflxMs = Math.round(performance.now() - start);
    }
    candidates.push(e.candidate.candidate);
  };
  pc.onicegatheringstatechange = () => {
    if (pc.iceGatheringState === "complete") resolve();
  };
  try {
    pc.createDataChannel("egz");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await withTimeout(done, ms, "ice timeout").catch(() => {});
  } finally {
    pc.close();
  }
  return { candidates, totalMs: Math.round(performance.now() - start), firstSrflxMs };
}

function parseCandidate(line) {
  // candidate:foundation comp transport prio addr port typ <type> [raddr <ip> rport <port>] [generation N] [network-id N] [network-cost N]
  const m = line.match(/candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)/);
  if (!m) return null;
  const out = {
    foundation: m[1],
    component: parseInt(m[2], 10),
    transport: m[3],
    priority: parseInt(m[4], 10),
    address: m[5],
    port: parseInt(m[6], 10),
    type: m[7],
  };
  const raddr = line.match(/ raddr (\S+) rport (\d+)/);
  if (raddr) { out.relatedAddress = raddr[1]; out.relatedPort = parseInt(raddr[2], 10); }
  const netId = line.match(/ network-id (\d+)/);
  if (netId) out.networkId = parseInt(netId[1], 10);
  const netCost = line.match(/ network-cost (\d+)/);
  if (netCost) out.networkCost = parseInt(netCost[1], 10);
  return out;
}

function networkCostLabel(cost) {
  // Per draft-ietf-mmusic-ice-network-id: 0 = lan/wired, 10 = vpn,
  // 50 = wifi, 900 = cellular, 999 = unknown.
  if (cost == null) return null;
  if (cost === 0) return "wired/LAN";
  if (cost <= 10) return "VPN";
  if (cost <= 50) return "Wi-Fi";
  if (cost < 999) return "cellular/metered";
  return "unknown";
}

export async function runWebRTC({ mount }) {
  if (typeof RTCPeerConnection !== "function") {
    addRow(mount, { name: "WebRTC", note: "not supported in this browser", value: "—", status: { kind: "err", label: "N/A" } });
    return;
  }

  const r1 = addRow(mount, { name: "Local interface IPs", note: "host candidates", value: null });
  const r2 = addRow(mount, { name: "Public reflexive IPv4", note: "srflx via STUN (IPv4)", value: null });
  const r2v6 = addRow(mount, { name: "Public reflexive IPv6", note: "srflx via STUN (IPv6)", value: null });
  const r3 = addRow(mount, { name: "STUN reachability", note: "UDP egress to STUN servers", value: null });
  const rPerStun = addRow(mount, { name: "Per-STUN latency", note: "time to first srflx candidate", value: null });
  const rGather = addRow(mount, { name: "ICE gathering time", note: "average time to gathering=complete", value: null });
  const r4 = addRow(mount, { name: "mDNS protection", note: "candidates obfuscated as *.local", value: null });
  const r5 = addRow(mount, { name: "Candidate summary", note: "ICE candidate types and transports", value: null });
  const rTransports = addRow(mount, { name: "Transports observed", note: "UDP vs TCP candidates", value: null });
  const rPorts = addRow(mount, { name: "Source port range", note: "min/max ephemeral ports across candidates", value: null });
  const rPrio = addRow(mount, { name: "Top candidate priority", note: "highest ICE priority value (RFC 5245)", value: null });
  const rNet = addRow(mount, { name: "Network type hints", note: "network-cost attribute (Chromium)", value: null });
  const rRelay = addRow(mount, { name: "TURN candidates", note: "relay candidates would indicate a TURN server in use", value: null });
  const r6 = addRow(mount, { name: "STUN servers", note: "configured public servers", value: STUN_SERVERS.join(", ") });

  const local = new Set();
  const srflxV4 = new Set();
  const srflxV6 = new Set();
  const candidateTypes = new Map();
  const transports = new Set();
  const ports = [];
  const networkCosts = new Set();
  let totalCandidates = 0;
  let reachable = 0;
  let relayCount = 0;
  let topPriority = 0;
  const perStunLatency = [];
  const gatherTimes = [];

  await Promise.all(
    STUN_SERVERS.map(async (s) => {
      try {
        const { candidates: cands, totalMs, firstSrflxMs } = await gatherCandidates(s, 4500);
        gatherTimes.push(totalMs);
        let got = false;
        for (const line of cands) {
          const c = parseCandidate(line);
          if (!c) continue;
          totalCandidates++;
          candidateTypes.set(c.type, (candidateTypes.get(c.type) || 0) + 1);
          transports.add(c.transport.toUpperCase());
          ports.push(c.port);
          if (c.priority > topPriority) topPriority = c.priority;
          if (c.networkCost != null) networkCosts.add(c.networkCost);
          if (c.type === "host") local.add(c.address);
          if (c.type === "srflx") {
            (c.address.includes(":") ? srflxV6 : srflxV4).add(c.address);
            got = true;
          }
          if (c.type === "relay") relayCount++;
        }
        if (got) { reachable++; perStunLatency.push({ url: s, ms: firstSrflxMs }); }
      } catch (_) { /* server unreachable */ }
    })
  );

  const hostList = [...local];
  const mDNSCount = hostList.filter((a) => a.endsWith(".local")).length;
  const ipHosts = hostList.filter((a) => !a.endsWith(".local"));

  if (hostList.length === 0) {
    r1.fail("none gathered");
  } else {
    const summary = ipHosts.length
      ? ipHosts.map((a) => `${a} (${classifyAddress(a)})`).join(", ")
      : `${mDNSCount} obfuscated`;
    r1.update(summary, ipHosts.length ? { kind: "warn", label: "EXPOSED" } : { kind: "ok", label: "OK" });
  }

  if (srflxV4.size === 0) r2.fail("no IPv4 srflx");
  else r2.update([...srflxV4].join(", "), { kind: "ok", label: "UDP" });

  if (srflxV6.size === 0) r2v6.update("none — no IPv6 reflexive candidate", { kind: "dim", label: "—" });
  else r2v6.update([...srflxV6].join(", "), { kind: "ok", label: "UDP" });

  r3.update(
    `${reachable} / ${STUN_SERVERS.length} STUN servers responded`,
    reachable === STUN_SERVERS.length ? { kind: "ok", label: "OPEN" } :
    reachable === 0 ? { kind: "err", label: "BLOCKED" } :
    { kind: "warn", label: "PARTIAL" }
  );

  if (perStunLatency.length) {
    const fastest = perStunLatency.filter((l) => l.ms != null).sort((a, b) => a.ms - b.ms)[0];
    rPerStun.update(
      perStunLatency.map((l) => `${l.url.replace(/^stun:/, "")} ${l.ms ?? "?"} ms`).join(" · "),
      { kind: "ok", label: fastest ? `${fastest.ms} ms` : "—" }
    );
  } else rPerStun.fail("no srflx timing");

  if (gatherTimes.length) {
    const avg = Math.round(gatherTimes.reduce((a, b) => a + b, 0) / gatherTimes.length);
    rGather.update(`${avg} ms avg · ${Math.min(...gatherTimes)}–${Math.max(...gatherTimes)} ms range`,
      { kind: avg < 1000 ? "ok" : avg < 3000 ? "warn" : "err", label: `${avg} ms` });
  } else rGather.fail("none");

  if (hostList.length === 0) {
    r4.update("unknown", { kind: "dim", label: "—" });
  } else if (mDNSCount > 0 && ipHosts.length === 0) {
    r4.update("active — all host candidates obfuscated", { kind: "ok", label: "ON" });
  } else if (mDNSCount > 0) {
    r4.update("partial — some IPs still exposed", { kind: "warn", label: "MIXED" });
  } else {
    r4.update("disabled — raw IPs exposed", { kind: "err", label: "OFF" });
  }

  const typeSummary = [...candidateTypes.entries()].map(([type, count]) => `${type}:${count}`).join(", ");
  r5.update(
    totalCandidates
      ? `${totalCandidates} candidates · ${typeSummary || "unknown types"} · ${[...transports].join("/") || "unknown transport"} · ${new Set(ports).size} unique ports`
      : "no ICE candidates gathered",
    totalCandidates ? { kind: "ok", label: String(totalCandidates) } : { kind: "err", label: "NONE" }
  );

  rTransports.update(
    transports.size ? [...transports].join(" + ") : "none",
    transports.size ? { kind: "ok", label: `${transports.size}` } : { kind: "err", label: "NONE" }
  );

  if (ports.length) {
    const min = Math.min(...ports), max = Math.max(...ports);
    rPorts.update(`${min}–${max} · ${new Set(ports).size} unique`, { kind: "ok", label: `${new Set(ports).size}` });
  } else rPorts.fail("none");

  if (topPriority) {
    rPrio.update(`${topPriority} (${(topPriority >>> 24) & 0xff}/${(topPriority >>> 8) & 0xffff})`, { kind: "ok", label: "OK" });
  } else rPrio.fail("none");

  if (networkCosts.size) {
    rNet.update(
      [...networkCosts].map((c) => `cost=${c} (${networkCostLabel(c) || "?"})`).join(" · "),
      { kind: "ok", label: `${networkCosts.size}` }
    );
  } else rNet.update("not exposed by this browser", { kind: "dim", label: "—" });

  if (relayCount > 0) rRelay.update(`${relayCount} relay candidates`, { kind: "warn", label: "TURN" });
  else rRelay.update("none observed (no TURN configured)", { kind: "ok", label: "DIRECT" });
}
