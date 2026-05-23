import { addRow, fetchJSON, fetchText, withTimeout } from "./ui.js";

// Probes: each returns a public IP as seen by that endpoint.
const PROBES = [
  {
    name: "Cloudflare trace",
    note: "www.cloudflare.com/cdn-cgi/trace",
    family: "v4",
    fn: async () => {
      const t = await fetchText("https://www.cloudflare.com/cdn-cgi/trace");
      const ip = (t.match(/^ip=(.+)$/m) || [])[1];
      return ip;
    },
  },
  {
    name: "Cloudflare trace (IPv6)",
    note: "[2606:4700:4700::1111]/cdn-cgi/trace",
    family: "v6",
    fn: async () => {
      const t = await fetchText("https://[2606:4700:4700::1111]/cdn-cgi/trace");
      const ip = (t.match(/^ip=(.+)$/m) || [])[1];
      return ip;
    },
  },
  {
    name: "ipify",
    note: "api4.ipify.org",
    family: "v4",
    fn: async () => {
      const j = await fetchJSON("https://api4.ipify.org?format=json");
      return j && j.ip;
    },
  },
  {
    name: "ipify (IPv6)",
    note: "api6.ipify.org",
    family: "v6",
    fn: async () => {
      const j = await fetchJSON("https://api6.ipify.org?format=json");
      return j && j.ip;
    },
  },
  {
    name: "icanhazip",
    note: "ipv4.icanhazip.com",
    family: "v4",
    fn: async () => (await fetchText("https://ipv4.icanhazip.com")).trim(),
  },
  {
    name: "icanhazip (IPv6)",
    note: "ipv6.icanhazip.com",
    family: "v6",
    fn: async () => (await fetchText("https://ipv6.icanhazip.com")).trim(),
  },
  {
    name: "Cloudflare speed/meta",
    note: "speed.cloudflare.com/meta",
    family: "any",
    fn: async () => {
      const j = await fetchJSON("https://speed.cloudflare.com/meta");
      return j && j.clientIp;
    },
  },
];

export async function runOutbound({ mount, setHero }) {
  const started = performance.now();
  const rows = PROBES.map((p) =>
    addRow(mount, {
      name: p.name,
      note: p.note,
      value: null,
      status: { kind: "dim", label: p.family.toUpperCase() },
    })
  );

  const seen = { v4: new Set(), v6: new Set() };
  const ok = [];
  const failed = [];

  await Promise.all(
    PROBES.map(async (p, i) => {
      try {
        const ip = await withTimeout(p.fn(), 8000);
        if (!ip) throw new Error("no IP");
        const fam = ip.includes(":") ? "v6" : "v4";
        seen[fam].add(ip);
        ok.push({ name: p.name, family: fam, ip });
        rows[i].update(ip, { kind: "ok", label: fam.toUpperCase() });
        if (fam === "v4") setHero("ipv4", ip);
        else setHero("ipv6", ip);
      } catch (e) {
        failed.push(p);
        rows[i].fail(p.family === "v6" ? "no IPv6" : "blocked");
      }
    })
  );

  addRow(mount, {
    name: "Probe success",
    note: "completed public-IP endpoints",
    value: `${ok.length} / ${PROBES.length} answered in ${Math.round(performance.now() - started)} ms`,
    status: ok.length === PROBES.length ? { kind: "ok", label: "OK" } : ok.length ? { kind: "warn", label: "PARTIAL" } : { kind: "err", label: "NONE" },
  });
  addRow(mount, {
    name: "IPv4 candidates",
    note: "unique observed IPv4 egress addresses",
    value: seen.v4.size ? [...seen.v4].join(", ") : "none",
    status: seen.v4.size ? { kind: "ok", label: String(seen.v4.size) } : { kind: "dim", label: "0" },
  });
  addRow(mount, {
    name: "IPv6 candidates",
    note: "unique observed IPv6 egress addresses",
    value: seen.v6.size ? [...seen.v6].join(", ") : "none",
    status: seen.v6.size ? { kind: "ok", label: String(seen.v6.size) } : { kind: "dim", label: "0" },
  });
  addRow(mount, {
    name: "Dual-stack reachability",
    note: "whether both address families were observed",
    value: seen.v4.size && seen.v6.size ? "IPv4 and IPv6 both reachable" : seen.v4.size ? "IPv4 only observed" : seen.v6.size ? "IPv6 only observed" : "no public IP observed",
    status: seen.v4.size && seen.v6.size ? { kind: "ok", label: "DUAL" } : seen.v4.size || seen.v6.size ? { kind: "warn", label: "SINGLE" } : { kind: "err", label: "NONE" },
  });
  if (failed.length) {
    addRow(mount, {
      name: "Failed probes",
      note: "endpoints that did not return a usable IP",
      value: failed.map((p) => p.name).join(", "),
      status: { kind: "warn", label: String(failed.length) },
    });
  }

  if (seen.v4.size > 1 || seen.v6.size > 1) {
    addRow(mount, {
      name: "Divergence detected",
      note: "different endpoints saw different IPs",
      value: `${seen.v4.size} IPv4, ${seen.v6.size} IPv6`,
      status: { kind: "warn", label: "MIXED" },
    });
  }
}
