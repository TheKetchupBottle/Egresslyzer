import { addRow, fetchJSON, fetchText, withTimeout } from "./ui.js";

// Probes: each returns a public IP as seen by that endpoint.
const PROBES = [
  {
    name: "Cloudflare trace",
    note: "1.1.1.1/cdn-cgi/trace",
    family: "v4",
    fn: async () => {
      const t = await fetchText("https://1.1.1.1/cdn-cgi/trace");
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
    name: "ifconfig.co",
    note: "ifconfig.co/json",
    family: "any",
    fn: async () => {
      const j = await fetchJSON("https://ifconfig.co/json");
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
  const rows = PROBES.map((p) =>
    addRow(mount, {
      name: p.name,
      note: p.note,
      value: null,
      status: { kind: "dim", label: p.family.toUpperCase() },
    })
  );

  const seen = { v4: new Set(), v6: new Set() };

  await Promise.all(
    PROBES.map(async (p, i) => {
      try {
        const ip = await withTimeout(p.fn(), 8000);
        if (!ip) throw new Error("no IP");
        const fam = ip.includes(":") ? "v6" : "v4";
        seen[fam].add(ip);
        rows[i].update(ip, { kind: "ok", label: fam.toUpperCase() });
        if (fam === "v4") setHero("ipv4", ip);
        else setHero("ipv6", ip);
      } catch (e) {
        rows[i].fail(p.family === "v6" ? "no IPv6" : "blocked");
      }
    })
  );

  if (seen.v4.size > 1 || seen.v6.size > 1) {
    addRow(mount, {
      name: "Divergence detected",
      note: "different endpoints saw different IPs",
      value: `${seen.v4.size} IPv4, ${seen.v6.size} IPv6`,
      status: { kind: "warn", label: "MIXED" },
    });
  }
}
