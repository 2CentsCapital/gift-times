import type { MetadataRoute } from "next";

const SITE = "https://giftcitytimes.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/d"] },
      // Explicitly welcome AI crawlers so GIFT City Times can be cited in
      // ChatGPT / Perplexity / Google AI answers (GEO).
      {
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bytespider"],
        allow: "/",
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
