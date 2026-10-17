"use client";

import { useEffect, useState } from "react";
import type { Ticker, Quote } from "@/lib/ticker";

type Markets = Pick<Ticker, "nifty" | "usdinr" | "nasdaq">;

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

// Market quotes for the masthead, kept live in the browser. The server renders
// `initial` (which may be a few minutes stale via ISR); on mount we immediately
// pull fresh numbers from /api/ticker and then refresh once a minute.
export default function LiveTicker({ initial }: { initial: Markets }) {
  const [m, setM] = useState<Markets>(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/ticker", { cache: "no-store" });
        if (!r.ok) return;
        const j: Ticker = await r.json();
        if (alive) setM({ nifty: j.nifty, usdinr: j.usdinr, nasdaq: j.nasdaq });
      } catch {
        /* keep last good values */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <QuoteSeg label="NIFTY" q={m.nifty} decimals={0} />
      <QuoteSeg label="USD/INR" q={m.usdinr} decimals={2} />
      <QuoteSeg label="NASDAQ" q={m.nasdaq} decimals={0} />
    </>
  );
}
