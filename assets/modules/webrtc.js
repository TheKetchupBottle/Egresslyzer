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
  let resolve;
  const done = new Promise((r) => (resolve = r));
  pc.onicecandidate = (e) => {
    if (!e.candidate) { resolve(); return; }
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
  return candidates;
}

function parseCandidate(line) {
  // Format: candidate:foundation comp transport prio addr port typ <type> ...
  const m = line.match(/candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\S+)/);
  if (!m) return null;
  return { transport: m[1], address: m[2], port: parseInt(m[3], 10), type: m[4] };
}

export async function runWebRTC({ mount }) {
  if (typeof RTCPeerConnection !== "function") {
    addRow(mount, { name: "WebRTC", note: "not supported in this browser", value: "—", status: { kind: "err", label: "N/A" } });
    return;
  }

  const r1 = addRow(mount, { name: "Local interface IPs", note: "host candidates", value: null });
  const r2 = addRow(mount, { name: "Public reflexive IP", note: "srflx via STUN", value: null });
  const r3 = addRow(mount, { name: "STUN reachability", note: "UDP egress to STUN servers", value: null });
  const r4 = addRow(mount, { name: "mDNS protection", note: "candidates obfuscated as *.local", value: null });

  const local = new Set();
  const srflx = new Set();
  let reachable = 0;

  await Promise.all(
    STUN_SERVERS.map(async (s) => {
      try {
        const cands = await gatherCandidates(s, 4500);
        let got = false;
        for (const line of cands) {
          const c = parseCandidate(line);
          if (!c) continue;
          if (c.type === "host") local.add(c.address);
          if (c.type === "srflx") { srflx.add(c.address); got = true; }
        }
        if (got) reachable++;
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

  if (srflx.size === 0) {
    r2.fail("no srflx");
  } else {
    const list = [...srflx].join(", ");
    r2.update(list, { kind: "ok", label: "UDP" });
  }

  r3.update(
    `${reachable} / ${STUN_SERVERS.length} STUN servers responded`,
    reachable === STUN_SERVERS.length ? { kind: "ok", label: "OPEN" } :
    reachable === 0 ? { kind: "err", label: "BLOCKED" } :
    { kind: "warn", label: "PARTIAL" }
  );

  if (hostList.length === 0) {
    r4.update("unknown", { kind: "dim", label: "—" });
  } else if (mDNSCount > 0 && ipHosts.length === 0) {
    r4.update("active — all host candidates obfuscated", { kind: "ok", label: "ON" });
  } else if (mDNSCount > 0) {
    r4.update("partial — some IPs still exposed", { kind: "warn", label: "MIXED" });
  } else {
    r4.update("disabled — raw IPs exposed", { kind: "err", label: "OFF" });
  }
}
