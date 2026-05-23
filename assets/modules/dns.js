import { addRow, withTimeout } from "./ui.js";

// Public DNS-over-HTTPS resolvers we can hit cross-origin.
const RESOLVERS = [
  {
    name: "Cloudflare",
    url: "https://cloudflare-dns.com/dns-query",
    note: "cloudflare-dns.com (DoH)",
    probes: [{ name: "whoami.cloudflare", type: "TXT" }],
  },
  {
    name: "Google",
    url: "https://dns.google/resolve",
    note: "dns.google (DoH JSON)",
    probes: [{ name: "o-o.myaddr.l.google.com", type: "TXT" }],
  },
  {
    name: "Quad9",
    url: "https://dns.quad9.net:5053/dns-query",
    note: "dns.quad9.net (DoH, malware filter)",
    probes: [
      { name: "whoami.cloudflare", type: "TXT" },
      { name: "o-o.myaddr.l.google.com", type: "TXT" },
    ],
  },
  {
    name: "AdGuard",
    url: "https://dns.adguard-dns.com/resolve",
    note: "dns.adguard-dns.com (DoH)",
    probes: [
      { name: "whoami.cloudflare", type: "TXT" },
      { name: "o-o.myaddr.l.google.com", type: "TXT" },
    ],
  },
];

// Diagnostic record probes — run against Cloudflare's DoH endpoint since it's
// fastest and most permissive cross-origin.
const RECORD_PROBES = [
  { name: "example.com",          type: "A",     label: "A record" },
  { name: "example.com",          type: "AAAA",  label: "AAAA record" },
  { name: "www.cloudflare.com",   type: "CNAME", label: "CNAME chain" },
  { name: "gmail.com",            type: "MX",    label: "MX records" },
  { name: "cloudflare.com",       type: "NS",    label: "NS records" },
  { name: "cloudflare.com",       type: "TXT",   label: "TXT (root)" },
  { name: "cloudflare.com",       type: "CAA",   label: "CAA policy" },
  { name: "_dmarc.gmail.com",     type: "TXT",   label: "DMARC policy" },
  { name: "dnssec-failed.org",    type: "A",     label: "DNSSEC failure test" },
  { name: "internetsociety.org",  type: "A",     label: "DNSSEC-signed (AD flag)" },
];

async function dohQuery(resolver, name, type = "TXT", extraParams = "") {
  const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${type}${extraParams}`;
  const start = performance.now();
  const r = await withTimeout(
    fetch(url, { headers: { accept: "application/dns-json" }, cache: "no-store" }),
    6000
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return { json, ms: Math.round(performance.now() - start) };
}

function extractAnswer(json) {
  if (!json || !json.Answer || !json.Answer.length) return null;
  return json.Answer.map((a) => a.data?.replace(/^"|"$/g, "")).filter(Boolean).join(", ");
}

function rcodeName(code) {
  return {
    0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN",
    4: "NOTIMP", 5: "REFUSED", 9: "NOTAUTH",
  }[code] ?? `code ${code}`;
}

function responseSummary(json, ms) {
  if (!json) return "no response";
  const answers = json.Answer?.length || 0;
  const ttl = json.Answer?.map((a) => a.TTL).filter((v) => Number.isFinite(v));
  const ttlText = ttl?.length ? `min TTL ${Math.min(...ttl)}s` : "no TTL";
  const flags = [
    json.AD && "AD",
    json.CD && "CD",
    json.RA && "RA",
    json.TC && "TC",
  ].filter(Boolean).join("/");
  return `${rcodeName(json.Status ?? -1)} · ${answers} answers · ${ttlText}${flags ? " · " + flags : ""}${ms != null ? ` · ${ms} ms` : ""}`;
}

export async function runDNS({ mount }) {
  const started = performance.now();
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
    note: "what each DoH resolver sees as your IP",
    value: null,
  });
  const latencyRow = addRow(mount, {
    name: "Per-resolver latency",
    note: "DoH round-trip time for the whoami probe",
    value: null,
  });

  const seen = new Set();
  const details = [];
  const latencies = [];
  let answered = 0;

  await Promise.all(
    rows.map(async ({ r, row }) => {
      try {
        let answer = null;
        let bestMs = null;
        for (const probe of r.probes) {
          try {
            const { json, ms } = await dohQuery(r, probe.name, probe.type);
            const a = extractAnswer(json);
            details.push(`${r.name} ${probe.name}: ${responseSummary(json, ms)}`);
            if (bestMs == null || ms < bestMs) bestMs = ms;
            if (a) { answer = a; break; }
          } catch {}
        }
        if (!answer) throw new Error("no answer");
        if (bestMs != null) latencies.push({ name: r.name, ms: bestMs });
        seen.add(answer);
        answered++;
        row.update(answer + (bestMs != null ? ` · ${bestMs} ms` : ""), { kind: "ok", label: "OK" });
      } catch (_) {
        row.fail("blocked");
      }
    })
  );

  if (seen.size === 0) summaryRow.fail("no resolver answered");
  else if (seen.size === 1) summaryRow.update([...seen][0], { kind: "ok", label: "AGREE" });
  else summaryRow.update([...seen].join(" / "), { kind: "warn", label: "DIVERGE" });

  if (latencies.length) {
    const fastest = latencies.reduce((a, b) => (a.ms < b.ms ? a : b));
    latencyRow.update(
      latencies.map((l) => `${l.name} ${l.ms} ms`).join(" · ") + ` · fastest=${fastest.name}`,
      { kind: "ok", label: `${fastest.ms} ms` }
    );
  } else {
    latencyRow.fail("no latency");
  }

  addRow(mount, {
    name: "DoH reachability",
    note: "public DNS-over-HTTPS resolvers tested",
    value: `${answered} / ${RESOLVERS.length} answered in ${Math.round(performance.now() - started)} ms`,
    status: answered === RESOLVERS.length ? { kind: "ok", label: "OK" } : answered ? { kind: "warn", label: "PARTIAL" } : { kind: "err", label: "NONE" },
  });
  addRow(mount, {
    name: "Resolvers",
    note: "endpoints queried",
    value: RESOLVERS.map((r) => r.name).join(", "),
  });
  addRow(mount, {
    name: "Answer consistency",
    note: "unique resolver-observed values",
    value: seen.size ? `${seen.size} unique answer${seen.size === 1 ? "" : "s"}` : "no answers",
    status: seen.size === 1 ? { kind: "ok", label: "AGREE" } : seen.size > 1 ? { kind: "warn", label: "DIVERGE" } : { kind: "err", label: "NONE" },
  });

  // Record-type diagnostics against Cloudflare's DoH endpoint.
  const cf = RESOLVERS[0];
  const recordHeader = addRow(mount, {
    name: "Record diagnostics",
    note: "A / AAAA / CNAME / MX / NS / TXT / CAA / DMARC / DNSSEC probes via Cloudflare DoH",
    value: "querying…",
  });
  let recordsOk = 0;
  let dnssecValidated = null;
  let dnssecFailureBlocked = null;
  await Promise.all(
    RECORD_PROBES.map(async (p) => {
      try {
        const extra = p.name === "internetsociety.org" || p.name === "dnssec-failed.org" ? "&do=1" : "";
        const { json, ms } = await dohQuery(cf, p.name, p.type, extra);
        const ans = extractAnswer(json) || "—";
        const status = rcodeName(json.Status ?? -1);
        const ad = json.AD ? " · AD" : "";
        addRow(mount, {
          name: `${p.label}`,
          note: `${p.name} ${p.type}`,
          value: `${ans} · ${status}${ad} · ${ms} ms`,
          status: json.Status === 0 && ans !== "—" ? { kind: "ok", label: "OK" } :
                  json.Status === 3 ? { kind: "warn", label: "NXDOMAIN" } :
                  json.Status === 2 ? { kind: "err", label: "SERVFAIL" } :
                  { kind: "dim", label: status },
        });
        recordsOk++;
        if (p.name === "internetsociety.org") dnssecValidated = !!json.AD;
        if (p.name === "dnssec-failed.org") dnssecFailureBlocked = json.Status === 2;
      } catch {
        addRow(mount, {
          name: p.label,
          note: `${p.name} ${p.type}`,
          value: "query failed",
          status: { kind: "err", label: "FAIL" },
        });
      }
    })
  );
  recordHeader.update(`${recordsOk} / ${RECORD_PROBES.length} record probes completed`,
    { kind: recordsOk === RECORD_PROBES.length ? "ok" : recordsOk ? "warn" : "err",
      label: `${recordsOk}/${RECORD_PROBES.length}` });

  addRow(mount, {
    name: "DNSSEC validation",
    note: "AD flag on a signed zone + SERVFAIL on a deliberately-bad zone",
    value: `signed-zone AD=${dnssecValidated == null ? "?" : dnssecValidated} · bad-zone blocked=${dnssecFailureBlocked == null ? "?" : dnssecFailureBlocked}`,
    status: dnssecValidated && dnssecFailureBlocked ? { kind: "ok", label: "VALIDATING" } :
            dnssecValidated === false || dnssecFailureBlocked === false ? { kind: "warn", label: "PARTIAL" } :
            { kind: "dim", label: "—" },
  });

  if (details.length) {
    addRow(mount, {
      name: "Response metadata",
      note: "DNS status, answer counts, TTL and flags per resolver",
      value: details.join(" · "),
    });
  }
}
