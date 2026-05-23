# Egresslyzer

A browser-based network diagnostics dashboard. Inspects, side-by-side:

- **Local IP** — interface addresses surfaced via WebRTC host candidates (and whether mDNS obfuscation is active).
- **Outbound IPs** — public IPv4 / IPv6 as seen by multiple independent probes (Cloudflare, ipify, ifconfig.co, icanhazip, Cloudflare Speed). Divergence between probes is flagged.
- **DNS egress** — what public DoH resolvers (Cloudflare, Google, Quad9, NextDNS) report back for your client; useful to spot DoH-vs-system-resolver divergence.
- **CDN routing & POP** — which edge node Cloudflare / Fastly / AWS CloudFront / Google / Bunny.net route you to.
- **WebRTC UDP exposure** — STUN reachability across multiple providers, server-reflexive (`srflx`) address, mDNS protection state.
- **IP intelligence** — aggregated geolocation, ASN/ISP, organization, reverse DNS, and a residential-vs-hosting heuristic from ipapi.co, ipwho.is, and ipinfo.io.
- **Browser / network hints** — UA, languages, timezone, screen, NetworkInformation API, storage quota.

Everything runs client-side. No backend, no analytics, no tracking. Probes hit only third-party public endpoints.

## Deploy

Push to `main`. The `Deploy to GitHub Pages` workflow publishes the static site.

To enable for the first time:

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the workflow manually).

The site is plain HTML/CSS/ES modules — no build step.

## Local preview

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

ES modules require `http://` (not `file://`), so a tiny static server is enough.

## Caveats

- Some probes (Fastly POP header, AWS CloudFront `x-amz-cf-pop`, Bunny `server` header) require the target to send permissive CORS headers — many won't, and those rows will show `CORS-blocked`. That isn't a bug in your network.
- True DNS-leak testing (i.e. observing which recursive resolver your system actually used) is impossible from a static page; the DNS card shows what each DoH resolver *would* say if it answered for you. For a real leak test, use [dnsleaktest.com](https://www.dnsleaktest.com/) or [browserleaks.com](https://browserleaks.com/).
- IPv6 rows show `no IPv6` when your network has no v6 connectivity — expected on many ISPs.
- mDNS obfuscation in Chrome/Firefox means local-IP rows often only show `*.local` candidates. That's the privacy feature working.

## License

MIT — see `LICENSE`.
