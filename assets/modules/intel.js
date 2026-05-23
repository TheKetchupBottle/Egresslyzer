import { addRow, fetchJSON, withTimeout } from "./ui.js";

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - 65, A + cc.toUpperCase().charCodeAt(1) - 65);
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

const PROVIDERS = [
  {
    name: "ipapi.co",
    note: "ipapi.co/json",
    fn: async () => {
      const j = await fetchJSON("https://ipapi.co/json/");
      return {
        ip: j.ip,
        country: j.country_name,
        country_code: j.country_code,
        region: j.region,
        city: j.city,
        org: j.org,
        asn: j.asn,
        timezone: j.timezone,
        postal: j.postal,
        latlon: j.latitude && j.longitude ? `${j.latitude},${j.longitude}` : null,
      };
    },
  },
  {
    name: "ipwho.is",
    note: "ipwho.is",
    fn: async () => {
      const j = await fetchJSON("https://ipwho.is/");
      if (j.success === false) throw new Error(j.message || "fail");
      return {
        ip: j.ip,
        country: j.country,
        country_code: j.country_code,
        region: j.region,
        city: j.city,
        org: j.connection?.org || j.connection?.isp,
        asn: j.connection?.asn ? `AS${j.connection.asn}` : null,
        timezone: j.timezone?.id,
        postal: j.postal,
        latlon: j.latitude && j.longitude ? `${j.latitude},${j.longitude}` : null,
      };
    },
  },
  {
    name: "ipinfo.io",
    note: "ipinfo.io/json (free tier, no token)",
    fn: async () => {
      const j = await fetchJSON("https://ipinfo.io/json");
      const [asn, ...rest] = (j.org || "").split(" ");
      return {
        ip: j.ip,
        country_code: j.country,
        region: j.region,
        city: j.city,
        org: rest.join(" ") || j.org,
        asn: /^AS\d+/i.test(asn) ? asn : null,
        timezone: j.timezone,
        postal: j.postal,
        latlon: j.loc,
      };
    },
  },
];

export async function runIntel({ mount, setHero }) {
  const results = [];
  const rows = PROVIDERS.map((p) =>
    addRow(mount, {
      name: p.name,
      note: p.note,
      value: null,
      status: { kind: "dim", label: "intel" },
    })
  );

  await Promise.all(
    PROVIDERS.map(async (p, i) => {
      try {
        const d = await withTimeout(p.fn(), 8000);
        results.push(d);
        const flag = d.country_code ? flagEmoji(d.country_code) + " " : "";
        const parts = [
          d.city || d.region,
          d.country_code || d.country,
          d.asn,
          d.org,
        ].filter(Boolean);
        rows[i].update(flag + parts.join(" · "), { kind: "ok", label: "OK" });
      } catch (e) {
        rows[i].fail("blocked");
      }
    })
  );

  // Aggregate hero fields from the first successful result
  const r = results[0];
  if (r) {
    if (r.country_code) setHero("country", `${flagEmoji(r.country_code)} ${r.country || r.country_code}${r.city ? " · " + r.city : ""}`);
    if (r.asn || r.org) setHero("asn", [r.asn, r.org].filter(Boolean).join(" · "));
  }

  // Try a reverse DNS via Google DoH for primary IP
  if (r && r.ip) {
    const rdnsRow = addRow(mount, { name: "Reverse DNS (PTR)", note: "google DoH lookup", value: null });
    try {
      const arpa = r.ip.includes(":")
        ? expandIPv6ToArpa(r.ip)
        : r.ip.split(".").reverse().join(".") + ".in-addr.arpa";
      const j = await fetchJSON(`https://dns.google/resolve?name=${arpa}&type=PTR`, {}, 6000);
      const ptr = j.Answer?.find((a) => a.type === 12)?.data;
      if (ptr) {
        const clean = ptr.replace(/\.$/, "");
        rdnsRow.update(clean, { kind: "ok", label: "PTR" });
        setHero("rdns", clean);
      } else {
        rdnsRow.update("(none)", { kind: "dim", label: "—" });
        setHero("rdns", "—");
      }
    } catch {
      rdnsRow.fail("blocked");
    }
  }

  // Hosting / VPN heuristic from org strings
  if (results.length) {
    addRow(mount, {
      name: "Provider coverage",
      note: "successful intelligence sources",
      value: `${results.length} / ${PROVIDERS.length} providers returned data`,
      status: results.length === PROVIDERS.length ? { kind: "ok", label: "OK" } : { kind: "warn", label: "PARTIAL" },
    });
    const cities = results.map((x) => [x.city, x.region, x.country_code || x.country].filter(Boolean).join(", "));
    addRow(mount, {
      name: "Consensus location",
      note: "most common city / region / country",
      value: mostCommon(cities) || "—",
    });
    addRow(mount, {
      name: "Consensus timezone",
      note: "most common provider timezone",
      value: mostCommon(results.map((x) => x.timezone)) || "—",
    });
    addRow(mount, {
      name: "Coordinates",
      note: "provider latitude / longitude values",
      value: [...new Set(results.map((x) => x.latlon).filter(Boolean))].join(" · ") || "—",
    });
    addRow(mount, {
      name: "Postal codes",
      note: "provider postal / ZIP values",
      value: [...new Set(results.map((x) => x.postal).filter(Boolean))].join(", ") || "—",
    });
    addRow(mount, {
      name: "ASN / organization",
      note: "unique network ownership values",
      value: [...new Set(results.map((x) => [x.asn, x.org].filter(Boolean).join(" ")).filter(Boolean))].join(" · ") || "—",
    });

    const orgs = results.map((x) => (x.org || "").toLowerCase()).join(" | ");
    const hosts = ["digitalocean","linode","amazon","aws","google","oracle","microsoft","azure","ovh","hetzner","vultr","contabo","leaseweb","alibaba","tencent","cloudflare","fastly","mullvad","nordvpn","expressvpn","proton","surfshark","pia","private internet access"];
    const hit = hosts.find((h) => orgs.includes(h));
    addRow(mount, {
      name: "Network type",
      note: "heuristic from org/ISP strings",
      value: hit ? `likely hosting / VPN (${hit})` : "likely residential / mobile",
      status: hit ? { kind: "warn", label: "HOSTING" } : { kind: "ok", label: "RESIDENTIAL" },
    });
  }
}

function expandIPv6ToArpa(ip) {
  // Expand abbreviated IPv6 to 8 groups, then reverse nibbles
  let groups = ip.split("::");
  let left = groups[0] ? groups[0].split(":") : [];
  let right = groups[1] !== undefined ? groups[1].split(":") : [];
  const fill = 8 - (left.length + right.length);
  const middle = Array(fill).fill("0");
  const full = [...left, ...middle, ...right].map((g) => g.padStart(4, "0")).join("");
  return full.split("").reverse().join(".") + ".ip6.arpa";
}
