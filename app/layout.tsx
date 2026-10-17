import type { Metadata } from "next";
import "./globals.css";
import { playfair, sourceSerif, interTight } from "./fonts";
import Masthead from "@/components/Masthead";
import ConnectWithClaude from "@/components/ConnectWithClaude";

const SITE = "https://giftcitytimes.com";
const DESCRIPTION =
  "Live registry and daily intelligence on GIFT IFSC: search 1,900+ regulated entities (brokers, fund managers, insurers, fintechs), and track new licences, circulars, regulations, tenders and UAC approvals from IFSCA.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "GIFT City Times — GIFT IFSC registry, circulars, tenders & news",
    template: "%s | GIFT City Times",
  },
  description: DESCRIPTION,
  applicationName: "GIFT City Times",
  authors: [{ name: "valura.ai", url: "https://valura.ai" }],
  creator: "valura.ai",
  keywords: [
    "GIFT IFSC", "GIFT City", "IFSCA", "GIFT City brokers", "GIFT IFSC entities",
    "IFSCA registered entities", "GIFT City fund management", "IFSC banking units",
    "IFSCA circulars", "IFSCA regulations", "GIFT City tenders", "UAC approvals",
    "GIFT City directory", "India International Financial Services Centre",
  ],
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": [{ url: "/feed.xml", title: "GIFT City Times — GIFT IFSC filings" }] },
  },
  openGraph: {
    type: "website",
    siteName: "GIFT City Times",
    url: SITE,
    title: "GIFT City Times — GIFT IFSC registry, circulars, tenders & news",
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "GIFT City Times — GIFT IFSC registry & daily updates",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  category: "finance",
};

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsMediaOrganization",
      "@id": `${SITE}/#org`,
      name: "GIFT City Times",
      url: SITE,
      description: DESCRIPTION,
      publisher: { "@type": "Organization", name: "Valura", url: "https://valura.ai" },
      areaServed: "GIFT IFSC, GIFT City, Gandhinagar, India",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "GIFT City Times",
      publisher: { "@id": `${SITE}/#org` },
      inLanguage: "en-IN",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${sourceSerif.variable} ${interTight.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />
        <Masthead />
        <main className="container">
          {children}
          <ConnectWithClaude />
        </main>
        <footer className="footer">
          <div>
            <strong>GIFT City Times</strong> · An automated chronicle of GIFT IFSC · maintained by{" "}
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
