import { addRow, withTimeout } from "./ui.js";

// Public DNS-over-HTTPS resolvers we can hit cross-origin.
const RESOLVERS = [
  { name: "Cloudflare", url: "https://cloudflare-dns.com/dns-query", note: "1.1.1.1" },
  { name: "Google", url: "https://dns.google/resolve", note: "8.8.8.8", googleStyle: true },
  { name: "Quad9", url: "https://dns.quad9.net:5053/dns-query", note: "9.9.9.9" },
  { name: "NextDNS", url: "https://dns.nextdns.io/dns-query", note: "anycast" },
];

const QUERY_DOMAINS = ["whoami.cloudflare", "myip.opendns.com"];

async function dohQuery(resolver, name, type = "TXT") {
  let url;
  if (resolver.googleStyle) {
    url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`;
  } else {
    url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`;
  }
  const r = await withTimeout(
    fetch(url, { headers: { accept: "application/dns-json" }, cache: "no-store" }),
    6000
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

function extractAnswer(json) {
  if (!json || !json.Answer || !json.Answer.length) return null;
  return json.Answer.map((a) => a.data?.replace(/^"|"$/g, "")).filter(Boolean).join(", ");
}

export async function runDNS({ mount }) {
  const rows = [];
  for (const r of RESOLVERS) {
    rows.push({
      r,
      row: addRow(mount, {
        name: r.name,
        note: r.note,
        value: null,
        status: { kind: "dim", label: "DoH" },
      }),
    });
  }
  const summaryRow = addRow(mount, {
    name: "Resolver-observed source",
    note: "what each DoH resolver sees as your IP (whoami.cloudflare TXT)",
    value: null,
  });
  const seen = new Set();

  await Promise.all(
    rows.map(async ({ r, row }) => {
      try {
        // Try cloudflare's whoami first
        let answer = null;
        try {
          const j = await dohQuery(r, "whoami.cloudflare", "TXT");
          answer = extractAnswer(j);
        } catch {}
        if (!answer) {
          // Fallback to myip.opendns.com A (only OpenDNS responds authoritatively, but resolvers will recursively resolve)
          try {
            const j = await dohQuery(r, "myip.opendns.com", "A");
            answer = extractAnswer(j);
          } catch {}
        }
        if (!answer) throw new Error("no answer");
        seen.add(answer);
        row.update(answer, { kind: "ok", label: "OK" });
      } catch (_) {
        row.fail("blocked");
      }
    })
  );

  if (seen.size === 0) summaryRow.fail("no resolver answered");
  else if (seen.size === 1) summaryRow.update([...seen][0], { kind: "ok", label: "AGREE" });
  else summaryRow.update([...seen].join(" / "), { kind: "warn", label: "DIVERGE" });
}
