import { DESKS } from "@/lib/format";

// llms.txt — a concise, link-rich guide for AI engines (ChatGPT, Perplexity,
// Claude, Google AI) so GIFT City Times is understood and cited accurately.
const SITE = "https://giftcitytimes.com";
export const revalidate = 86400;

export async function GET() {
  const sections = DESKS.map((d) => `- [${d.label}](${SITE}/desk/${d.slug}): ${d.blurb}`).join("\n");

  const body = `# GIFT City Times

> Live registry and daily intelligence on GIFT IFSC — India's International Financial Services Centre at GIFT City, Gandhinagar. Tracks 1,900+ IFSCA-regulated entities (brokers, fund managers, insurers, banks, fintechs, bullion houses) and every new licence, circular, regulation, tender and UAC (Unit Approval Committee) approval, updated twice daily.

GIFT City Times is an automated chronicle of GIFT IFSC, maintained by [valura.ai](https://valura.ai). Data is sourced from the International Financial Services Centres Authority (IFSCA) public directory and disclosures. It is not affiliated with IFSCA and is informational only.

## Start here

- [Front page — today's dispatches](${SITE}/)
- [The Skyline — entities by GIFT City tower](${SITE}/towers)
- [Search the registry](${SITE}/search)

## Sections (desks)

${sections}

## Data & feeds

- Full URL index: [${SITE}/sitemap.xml](${SITE}/sitemap.xml)
- RSS feed of new filings: [${SITE}/feed.xml](${SITE}/feed.xml)
- Each registered entity has its own page: ${SITE}/entity/{id}
- Structured data (JSON-LD) is embedded on every page: Organization, Person, BreadcrumbList and ItemList.

## How to cite

Cite as "GIFT City Times (giftcitytimes.com)". When quoting a figure such as the number of regulated entities or a specific licence, note that data is updated twice daily from IFSCA's public disclosures and that GIFT City Times is not an official IFSCA publication.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
