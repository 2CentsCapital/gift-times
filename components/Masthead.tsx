import Link from "next/link";
import { DESKS } from "@/lib/format";
import SearchBox from "@/components/SearchBox";
import { getTicker, type Quote } from "@/lib/ticker";

export const revalidate = 900;

function tickerDate(d = new Date()): string {
  // GIFT City is in India — the masthead date must read in IST, not the
  // server's UTC clock (otherwise it shows the previous day until 05:30 IST).
  return d
    .toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    })
    .toUpperCase();
}

// Weather label → a small glyph for the ticker.
function skyIcon(sky: string): string {
  const s = sky.toLowerCase();
  if (s.includes("clear")) return "☀";
  if (s.includes("fair")) return "🌤";
  if (s.includes("overcast") || s.includes("cloud")) return "☁";
  if (s.includes("haze")) return "🌫";
  if (s.includes("storm")) return "⛈";
  if (s.includes("rain") || s.includes("drizzle") || s.includes("shower")) return "🌧";
  return "☁";
}

function roman(n: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || "I";
}

function QuoteSeg({ label, q, decimals = 2 }: { label: string; q: Quote; decimals?: number }) {
  if (!q) return null;
  const up = q.changePct >= 0;
  return (
    <span className="tk-seg">
      <span className="tk-k">{label}</span>
      {q.level.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{" "}
      <b className={up ? "tk-up" : "tk-down"}>
        {up ? "+" : "−"}
        {Math.abs(q.changePct).toFixed(2)}%
      </b>
    </span>
  );
}

export default async function Masthead() {
  const t = await getTicker();
  const now = new Date();
  const vol = roman(now.getFullYear() - 2022); // founded 2026 → Vol. IV in 2026
  const no = Math.floor((Date.now() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000); // day of year

  return (
    <header className="mast">
      {/* Ticker bar */}
      <div className="mast-ticker">
        <div className="container tk-inner">
          <span className="tk-seg tk-date">{tickerDate()}</span>
          <span className="tk-pipe" aria-hidden="true">|</span>
          {t.weather && (
            <span className="tk-seg">
              <span className="tk-ico" aria-hidden="true">{skyIcon(t.weather.sky)}</span>
              <span className="tk-k">Gandhinagar</span> {t.weather.tempC}°C, {t.weather.sky}
            </span>
          )}
          <QuoteSeg label="NIFTY" q={t.nifty} decimals={0} />
          <QuoteSeg label="USD/INR" q={t.usdinr} decimals={2} />
          <span className="tk-seg tk-edition">Global Financial Hub Edition</span>
        </div>
      </div>

      {/* Nameplate with flanking ears */}
      <div className="container mast-inner">
        <div className="mast-plate">
          <div className="mast-ear mast-ear-l">
            <div className="mast-ear-k">The IFSC Report</div>
            <div className="mast-ear-sub">Deep analysis of cross-border capital flows.</div>
          </div>

          <Link href="/" className="mast-title" aria-label="GIFT City Times — home">
            GIFT <span className="mast-accent">City</span> Times
          </Link>

          <div className="mast-ear mast-ear-r">
            <div className="mast-ear-k">Vol. {vol} · No. {no}</div>
            <div className="mast-ear-sub">Serving the Smart City &amp; Global Hub since MMXXVI.</div>
          </div>

          <div className="mast-rules" aria-hidden="true" />
        </div>

        <nav className="mast-nav" aria-label="Sections">
          <Link href="/">Front Page</Link>
          <Link href="/towers">Skyline</Link>
          {DESKS.map((d) => (
            <Link key={d.slug} href={`/desk/${d.slug}`}>
              {d.label}
            </Link>
          ))}
        </nav>

        <div className="mast-search">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
