import Link from "next/link";
import type { Metadata } from "next";
import { searchAll } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Search-results URLs shouldn't be indexed (thin/duplicate); keep them crawl-follow.
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q || "").trim();
  const results = q ? await searchAll(q) : [];

  return (
    <div style={{ padding: "24px 0", maxWidth: 820 }}>
      {!q ? (
        <p className="empty">
          Search for any broker, fund, insurer, fintech, contact person, circular or notice.
        </p>
      ) : (
        <>
          <div className="section-head">
            <span>Results for “{q}”</span>
            <span className="count">{results.length}</span>
          </div>
          {results.length === 0 ? (
            <p className="empty">Nothing found. Try a shorter or different term.</p>
          ) : (
            results.map((r: any, i: number) => {
              const href =
                r.result_type === "person"
                  ? `/person/${encodeURIComponent(r.title)}`
                  : r.result_type === "entity"
                  ? `/entity/${r.id}`
                  : r.result_type === "sez"
                  ? "/desk/sez"
                  : undefined;
              const title = (
                <h3>
                  {href ? (
                    <Link className="title" href={href}>
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </h3>
              );
              return (
                <div className="result" key={`${r.result_type}-${r.id}-${i}`}>
                  <span className="tag">
                    {r.result_type === "person"
                      ? "Person"
                      : r.result_type === "publication"
                      ? "Document"
                      : r.result_type === "sez"
                      ? "SEZ / UAC"
                      : "Entity"}
                  </span>
                  {title}
                  <div className="meta">
                    {[r.subtitle, r.extra, fmtDate(r.the_date)].filter(Boolean).join(" · ")}
                  </div>
                  {r.result_type === "person" && (
                    <div className="meta" style={{ marginTop: 4 }}>
                      Authorised contact at{" "}
                      <Link className="readmore" href={`/entity/${r.id}`}>
                        {r.subtitle}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
