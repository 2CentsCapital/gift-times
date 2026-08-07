import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { DESKS, longDate } from "@/lib/format";
import SearchBox from "@/components/SearchBox";

export const metadata: Metadata = {
  title: "GIFT City Times — Daily intelligence on GIFT IFSC",
  description:
    "A daily newspaper on GIFT IFSC: new brokers, fund managers, insurers, circulars, regulations and news — sourced from IFSCA public disclosures.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="container masthead">
          <div className="kicker">GIFT City · Gandhinagar · International Financial Services Centre</div>
          <h1>GIFT City Times</h1>
          <div className="byline">
            by{" "}
            <a href="https://valura.ai" target="_blank" rel="noopener noreferrer">
              valura.ai
            </a>
          </div>
          <div className="dateline">
            <span>{longDate()}</span>
            <span>·</span>
            <span>Sourced from IFSCA</span>
            <span>·</span>
            <span>Automated Edition</span>
          </div>
          <nav className="nav">
            <Link href="/">Front Page</Link>
            {DESKS.map((d) => (
              <Link key={d.slug} href={`/desk/${d.slug}`}>
                {d.label}
              </Link>
            ))}
          </nav>
          <div style={{ maxWidth: 560, margin: "6px auto 16px" }}>
            <SearchBox />
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <div>
            <strong>GIFT City Times</strong> · An automated chronicle of GIFT IFSC · by{" "}
            <a href="https://valura.ai" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
              valura.ai
            </a>
          </div>
          <div>
            Data sourced from the International Financial Services Centres Authority (IFSCA) public
            directory and disclosures. Not affiliated with IFSCA. Informational only.
          </div>
        </footer>
      </body>
    </html>
  );
}
