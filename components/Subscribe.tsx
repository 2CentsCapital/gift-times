"use client";

import { useState } from "react";

export default function Subscribe() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      setState("done");
      setMsg("You’re on the list. The 6am edition will land in your inbox.");
    } catch (err: any) {
      setState("error");
      setMsg(err.message);
    }
  }

  if (state === "done") return <p style={{ fontFamily: "var(--sans)", fontSize: 13 }}>{msg}</p>;

  return (
    <form className="searchbar" onSubmit={submit} style={{ flexWrap: "wrap" }}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
      />
      <button type="submit" disabled={state === "loading"}>
        {state === "loading" ? "…" : "Subscribe"}
      </button>
      {state === "error" && (
        <p style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--accent)", width: "100%" }}>{msg}</p>
      )}
    </form>
  );
}
