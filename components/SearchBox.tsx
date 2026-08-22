"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Suggestion = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  desk: string | null;
};

const LABEL: Record<string, string> = {
  entity: "Entity",
  person: "Person",
  publication: "Document",
  sez: "SEZ / UAC",
};

// Entities and people both resolve to the entity dossier; documents live on
// their desk, so send those to the full results page instead of nowhere.
function hrefFor(s: Suggestion): string {
  if (s.type === "entity" || s.type === "person") return `/entity/${s.id}`;
  return `/search?q=${encodeURIComponent(s.title)}`;
}

export default function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  // Debounced type-ahead. Each keystroke cancels the previous request so slow
  // responses can never overwrite the results for a newer query.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      abortRef.current?.abort();
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
          setItems(d.results || []);
          setTotal(d.total || 0);
          setActive(-1);
          setOpen(true);
          setLoading(false);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setLoading(false);
        });
    }, 130);
    return () => clearTimeout(timer);
  }, [q]);

  // Close when focus or the pointer leaves the widget.
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    router.push(hrefFor(s));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && items[active]) return go(items[active]);
    const term = q.trim();
    if (term) {
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(term)}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setOpen(false);
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    }
  }

  const showPanel = open && q.trim().length >= 2;

  return (
    <div className="searchwrap" ref={boxRef}>
      <form className="searchbar" onSubmit={submit} role="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => items.length && setOpen(true)}
          placeholder="Search any broker, fund, entity or person…"
          aria-label="Search GIFT City Times"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
        <button type="submit">Search</button>
      </form>

      {showPanel && (
        <div className="suggest" id={listId} role="listbox">
          {items.length === 0 ? (
            <div className="suggest-empty">{loading ? "Searching…" : "No matches."}</div>
          ) : (
            <>
              {items.map((s, i) => (
                <button
                  type="button"
                  key={`${s.type}-${s.id}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`suggest-item${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(s)}
                >
                  <span className="suggest-tag">{LABEL[s.type] || "Result"}</span>
                  <span className="suggest-title">{s.title}</span>
                  {s.subtitle && <span className="suggest-sub">{s.subtitle}</span>}
                </button>
              ))}
              {total > items.length && (
                <button type="button" className="suggest-all" onClick={submit as any}>
                  See all {total} results for “{q.trim()}” →
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
