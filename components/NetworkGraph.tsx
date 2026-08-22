"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GraphLink, GraphNode, NetworkGraph } from "@/lib/network";

// A force-directed graph on a 2D canvas, written from scratch — the site ships
// no charting library and the CSP forbids third-party scripts, so a dependency
// here would buy little and cost a lot.
//
// Layout is the usual three forces (repulsion, springs along edges, a weak pull
// to centre) integrated with damping. Repulsion is the expensive one, so rather
// than compare every pair we bucket nodes into a uniform grid and only repel
// within one cell of each other — the force is negligible past the cutoff.

type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pinned: boolean;
  /** anchor: the centre of this node's own cluster, not of the whole canvas */
  ax: number;
  ay: number;
};

type SimLink = { s: SimNode; t: SimNode; kind: GraphLink["kind"] };

const PAPER = "#f5f2ea";
const INK = "#1a1712";
const MUTED = "#8a8272";
const RULE = "#ddd5c4";
const ACCENT = "#7a1f1f";
const PERSON_COLOR = "#7a1f1f";
const ADDRESS_COLOR = "#1f5a5f";

// Force parameters, tuned for ~1k nodes on a 900px canvas.
const REPULSION = 1500;
const CUTOFF = 150;
const SPRING_K = 0.035;
const REST_LENGTH = 74;
const GRAVITY = 0.055;
const DAMPING = 0.86;
const ALPHA_DECAY = 0.994;
const ALPHA_MIN = 0.004;

function radiusFor(n: GraphNode): number {
  if (n.kind === "entity") return 4 + Math.min(n.degree, 6) * 0.9;
  return 3.5 + Math.min(n.degree, 12) * 1.15;
}

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showPeople, setShowPeople] = useState(true);
  const [showAddresses, setShowAddresses] = useState(true);
  const [hovered, setHovered] = useState<SimNode | null>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);

  // Mutable simulation state lives in refs: it changes 60×/second and must
  // never trigger a React render.
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ node: SimNode | null; panning: boolean; lx: number; ly: number }>({
    node: null,
    panning: false,
    lx: 0,
    ly: 0,
  });
  const matchRef = useRef<Set<string> | null>(null);
  const hoverRef = useRef<SimNode | null>(null);
  const selectedRef = useRef<SimNode | null>(null);
  const neighborRef = useRef<Set<string>>(new Set());
  const reducedMotion = useRef(false);
  const fittedRef = useRef(false);
  // A pending re-frame, applied by the animation loop: `null` means "frame
  // everything", a Set means "frame just these nodes".
  const fitRequestRef = useRef<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // ---- load ---------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    fetch("/api/network")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((g: NetworkGraph) => {
        if (alive) setGraph(g);
      })
      .catch(() => alive && setError("The network graph could not be loaded."));
    return () => {
      alive = false;
    };
  }, []);

  // ---- build the simulation once the data arrives -------------------------
  useEffect(() => {
    if (!graph) return;
    const byId = new Map<string, SimNode>();
    const golden = Math.PI * (3 - Math.sqrt(5));

    // This register is not one big web — it is hundreds of small, separate
    // constellations (a fund family, a services floor). A single global
    // gravity would mash them into an even lattice and hide exactly the
    // structure we are trying to show. So each connected component gets its
    // own anchor, and the components are packed onto a sunflower spiral with
    // the largest at the centre — each cluster's footprint scaled by its size
    // so bigger ones claim more room.
    const sizes = new Map<number, number>();
    for (const n of graph.nodes) sizes.set(n.cluster, (sizes.get(n.cluster) || 0) + 1);
    const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]);

    const anchors = new Map<number, { x: number; y: number; spread: number }>();
    let area = 0;
    order.forEach(([cid, size], i) => {
      const footprint = 34 * Math.sqrt(size) + 26;
      area += footprint * footprint * Math.PI;
      const ring = Math.sqrt(area / Math.PI) * 1.15;
      const a = i * golden;
      anchors.set(cid, { x: Math.cos(a) * ring, y: Math.sin(a) * ring, spread: footprint * 0.5 });
    });

    graph.nodes.forEach((n, i) => {
      const anchor = anchors.get(n.cluster) || { x: 0, y: 0, spread: 40 };
      // Deterministic jitter around the anchor — same layout on every load.
      const a = i * golden;
      byId.set(n.id, {
        ...n,
        x: anchor.x + Math.cos(a) * anchor.spread,
        y: anchor.y + Math.sin(a) * anchor.spread,
        vx: 0,
        vy: 0,
        r: radiusFor(n),
        pinned: false,
        ax: anchor.x,
        ay: anchor.y,
      });
    });
    nodesRef.current = [...byId.values()];
    linksRef.current = graph.links
      .map((l) => ({ s: byId.get(l.source)!, t: byId.get(l.target)!, kind: l.kind }))
      .filter((l) => l.s && l.t);
    alphaRef.current = 1;
  }, [graph]);

  // ---- instant search: recompute the match set as the user types ----------
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      matchRef.current = null;
      setMatchCount(null);
      if (fittedRef.current) fitRequestRef.current = null; // back to the whole map
      return;
    }
    const hits = new Set<string>();
    for (const n of nodesRef.current) {
      if (n.label.toLowerCase().includes(q)) hits.add(n.id);
    }
    // Dimming alone tells you a match exists but not where it is — so fly the
    // viewport to the matches. That is what makes the filter feel instant.
    if (hits.size && fittedRef.current) fitRequestRef.current = hits;
    // Pull in each match's immediate neighbours so a hit never floats alone.
    const withNeighbours = new Set(hits);
    for (const l of linksRef.current) {
      if (hits.has(l.s.id)) withNeighbours.add(l.t.id);
      if (hits.has(l.t.id)) withNeighbours.add(l.s.id);
    }
    matchRef.current = withNeighbours;
    setMatchCount(hits.size);
    // Deliberately no re-heat: searching should move the camera and the
    // highlighting, never the layout. A map that rearranges as you type is
    // impossible to read.
  }, [query, graph]);

  const visibleLink = useCallback(
    (l: SimLink) => (l.kind === "person" ? showPeople : showAddresses),
    [showPeople, showAddresses]
  );

  // ---- physics ------------------------------------------------------------
  const tick = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    if (!nodes.length) return;
    const alpha = alphaRef.current;

    // Uniform grid for neighbour lookup — O(n) instead of O(n²).
    const cell = CUTOFF;
    const grid = new Map<string, SimNode[]>();
    for (const n of nodes) {
      const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, (bucket = []));
      bucket.push(n);
    }

    for (const n of nodes) {
      const cx = Math.floor(n.x / cell);
      const cy = Math.floor(n.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get(`${gx},${gy}`);
          if (!bucket) continue;
          for (const m of bucket) {
            if (m === n) continue;
            let dx = n.x - m.x;
            let dy = n.y - m.y;
            let d2 = dx * dx + dy * dy;
            if (d2 > CUTOFF * CUTOFF) continue;
            if (d2 < 1) {
              // Coincident nodes get a deterministic nudge apart.
              dx = (n.r + 1) * 0.5;
              dy = (m.r + 1) * 0.5;
              d2 = dx * dx + dy * dy;
            }
            const f = (REPULSION * alpha) / d2;
            const d = Math.sqrt(d2);
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
      }
    }

    for (const l of links) {
      if (!visibleLink(l)) continue;
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - REST_LENGTH) * SPRING_K * alpha;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      l.s.vx += fx;
      l.s.vy += fy;
      l.t.vx -= fx;
      l.t.vy -= fy;
    }

    for (const n of nodes) {
      // Pull toward this node's own cluster centre, so components stay apart.
      n.vx -= (n.x - n.ax) * GRAVITY * alpha;
      n.vy -= (n.y - n.ay) * GRAVITY * alpha;
      if (n.pinned) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    }

    alphaRef.current = Math.max(alpha * ALPHA_DECAY, 0);
  }, [visibleLink]);

  // ---- rendering ----------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const { scale, tx, ty } = viewRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.scale(scale, scale);

    const matches = matchRef.current;
    const focus = hoverRef.current || selectedRef.current;
    const neighbours = neighborRef.current;
    const dimmed = (n: SimNode) => {
      if (focus) return n !== focus && !neighbours.has(n.id);
      if (matches) return !matches.has(n.id);
      return false;
    };

    const labelQueue: { n: SimNode; priority: number }[] = [];

    // Links first, so nodes sit on top.
    for (const l of linksRef.current) {
      if (!visibleLink(l)) continue;
      const faded = dimmed(l.s) || dimmed(l.t);
      const lit =
        focus && (l.s === focus || l.t === focus)
          ? true
          : matches
          ? matches.has(l.s.id) && matches.has(l.t.id)
          : false;
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      ctx.lineTo(l.t.x, l.t.y);
      ctx.strokeStyle =
        l.kind === "person"
          ? faded
            ? "rgba(122,31,31,0.06)"
            : lit
            ? "rgba(122,31,31,0.75)"
            : "rgba(122,31,31,0.22)"
          : faded
          ? "rgba(31,90,95,0.06)"
          : lit
          ? "rgba(31,90,95,0.7)"
          : "rgba(31,90,95,0.2)";
      ctx.lineWidth = (lit ? 1.6 : 0.9) / scale;
      ctx.setLineDash(l.kind === "address" ? [4 / scale, 3 / scale] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const n of nodesRef.current) {
      const faded = dimmed(n);
      ctx.globalAlpha = faded ? 0.13 : 1;

      if (n.kind === "entity") {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.status === "Active" || !n.status ? n.color || ACCENT : "#b9b1a2";
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = PAPER;
        ctx.stroke();
      } else if (n.kind === "person") {
        // Diamond — a person is a different kind of thing from a firm.
        ctx.beginPath();
        ctx.moveTo(n.x, n.y - n.r);
        ctx.lineTo(n.x + n.r, n.y);
        ctx.lineTo(n.x, n.y + n.r);
        ctx.lineTo(n.x - n.r, n.y);
        ctx.closePath();
        ctx.fillStyle = PERSON_COLOR;
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = PAPER;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
        ctx.fillStyle = ADDRESS_COLOR;
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = PAPER;
        ctx.stroke();
      }

      // Label priority is decided here; placement happens in a second pass so
      // that more important labels win the space.
      if (!faded) {
        let priority = -1;
        if (n === focus) priority = 100;
        else if (matches?.has(n.id)) priority = 80;
        else if (n.kind !== "entity") priority = 40 + Math.min(n.degree, 20);
        else if (scale > 2.2) priority = 10 + Math.min(n.degree, 8);
        if (priority >= 0) labelQueue.push({ n, priority });
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ---- labels: draw in screen space with collision avoidance ------------
    // Canvas has no layout engine, so without this the dense clusters turn
    // into a pile of overlapping type. Highest priority claims its slot first;
    // anything that would collide is simply dropped.
    ctx.save();
    ctx.font = '11px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const taken: { x1: number; y1: number; x2: number; y2: number }[] = [];
    labelQueue.sort((a, b) => b.priority - a.priority);
    for (const { n, priority } of labelQueue) {
      const sx = n.x * scale + w / 2 + tx;
      const sy = (n.y + n.r) * scale + h / 2 + ty + 4;
      if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) continue;
      const text = n.label.length > 34 ? `${n.label.slice(0, 32)}…` : n.label;
      const wid = ctx.measureText(text).width;
      const box = { x1: sx - wid / 2 - 3, y1: sy - 2, x2: sx + wid / 2 + 3, y2: sy + 13 };
      const clash = taken.some(
        (b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
      );
      if (clash) continue;
      taken.push(box);
      ctx.fillStyle = "rgba(245,242,234,0.86)";
      ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
      ctx.fillStyle = priority >= 80 ? INK : MUTED;
      ctx.fillText(text, sx, sy);
    }
    ctx.restore();
  }, [visibleLink]);

  // Compute the view that frames `subset` (or the whole graph when omitted).
  const computeFit = useCallback((subset?: Set<string> | null) => {
    const all = nodesRef.current;
    const canvas = canvasRef.current;
    const nodes = subset ? all.filter((n) => subset.has(n.id)) : all;
    if (!nodes.length || !canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const pad = 92; // leave room for labels, which sit outside the node bounds
    const scale = Math.min(
      // A single isolated match would otherwise zoom to absurd magnification.
      subset ? 3 : 6,
      Math.max(0.1, Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1)))
    );
    return {
      scale,
      tx: -((minX + maxX) / 2) * scale,
      ty: -((minY + maxY) / 2) * scale,
    };
  }, []);

  const fitView = useCallback(() => {
    const v = computeFit();
    if (v) viewRef.current = v;
  }, [computeFit]);

  // ---- animation loop -----------------------------------------------------
  useEffect(() => {
    if (!graph) return;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      // Warm-up: run the layout to a near-settled state before the first paint
      // and frame it, so the reader gets a composed graph rather than watching
      // fifteen seconds of nodes drifting apart.
      if (!fittedRef.current && nodesRef.current.length) {
        // Run all the way to rest, then freeze and frame. If we left residual
        // energy the clusters would keep drifting outward and immediately
        // escape the frame we just computed.
        for (let i = 0; i < 700; i++) tick();
        alphaRef.current = 0;
        fittedRef.current = true;
        fitView();
      } else if (alphaRef.current > ALPHA_MIN && !reducedMotion.current) {
        tick();
      }

      // Glide the viewport toward any requested framing. Easing rather than
      // snapping keeps the reader oriented — you can see where you were taken.
      if (fitRequestRef.current !== undefined) {
        const target = computeFit(fitRequestRef.current);
        if (target) {
          const v = viewRef.current;
          const k = reducedMotion.current ? 1 : 0.18;
          v.scale += (target.scale - v.scale) * k;
          v.tx += (target.tx - v.tx) * k;
          v.ty += (target.ty - v.ty) * k;
          if (
            Math.abs(target.scale - v.scale) < 0.002 &&
            Math.abs(target.tx - v.tx) < 0.6 &&
            Math.abs(target.ty - v.ty) < 0.6
          ) {
            viewRef.current = target;
            fitRequestRef.current = undefined;
          }
        } else {
          fitRequestRef.current = undefined;
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [graph, tick, draw, fitView, computeFit]);

  // ---- canvas sizing ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // ---- pointer helpers ----------------------------------------------------
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { scale, tx, ty } = viewRef.current;
    return {
      x: (clientX - rect.left - rect.width / 2 - tx) / scale,
      y: (clientY - rect.top - rect.height / 2 - ty) / scale,
    };
  }, []);

  const nodeAt = useCallback(
    (wx: number, wy: number): SimNode | null => {
      const pad = 5 / viewRef.current.scale;
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d <= n.r + pad && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    },
    []
  );

  const setFocus = useCallback((n: SimNode | null) => {
    hoverRef.current = n;
    const set = new Set<string>();
    if (n) {
      for (const l of linksRef.current) {
        if (l.s === n) set.add(l.t.id);
        if (l.t === n) set.add(l.s.id);
      }
    }
    neighborRef.current = set;
    setHovered(n);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    fitRequestRef.current = undefined; // the reader takes over the camera
    const { x, y } = toWorld(e.clientX, e.clientY);
    const hit = nodeAt(x, y);
    dragRef.current = { node: hit, panning: !hit, lx: e.clientX, ly: e.clientY };
    if (hit) {
      hit.pinned = true;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.node) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      drag.node.x = x;
      drag.node.y = y;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      return;
    }
    if (drag.panning) {
      viewRef.current.tx += e.clientX - drag.lx;
      viewRef.current.ty += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      return;
    }
    const { x, y } = toWorld(e.clientX, e.clientY);
    const hit = nodeAt(x, y);
    if (hit !== hoverRef.current) setFocus(hit);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const moved = Math.hypot(e.clientX - drag.lx, e.clientY - drag.ly) > 3;
    if (drag.node) {
      drag.node.pinned = false;
      if (!moved) {
        if (drag.node.kind === "entity") router.push(`/entity/${drag.node.id}`);
        else {
          selectedRef.current = selectedRef.current === drag.node ? null : drag.node;
          setSelected(selectedRef.current);
          setFocus(selectedRef.current);
        }
      }
    }
    dragRef.current = { node: null, panning: false, lx: 0, ly: 0 };
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    fitRequestRef.current = undefined;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    const factor = Math.exp(-e.deltaY * 0.0016);
    const next = Math.min(6, Math.max(0.25, v.scale * factor));
    // Zoom about the cursor, not the centre.
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    v.tx = mx - ((mx - v.tx) * next) / v.scale;
    v.ty = my - ((my - v.ty) * next) / v.scale;
    v.scale = next;
  };


  const resetView = () => {
    setQuery("");
    fitRequestRef.current = null;
  };

  const stats = graph?.stats;
  const tooltip = hovered || selected;

  const tooltipBody = useMemo(() => {
    if (!tooltip) return null;
    if (tooltip.kind === "entity") {
      return (
        <>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED }}>
            {tooltip.desk || "Entity"}
          </div>
          <strong style={{ display: "block", margin: "3px 0", lineHeight: 1.25 }}>{tooltip.label}</strong>
          <div style={{ fontSize: 12, color: "#4a453c" }}>
            {tooltip.category || "—"} · {tooltip.degree} connection{tooltip.degree === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Click to open the dossier →</div>
        </>
      );
    }
    return (
      <>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED }}>
          {tooltip.kind === "person" ? "Authorised person" : "Shared address"}
        </div>
        <strong style={{ display: "block", margin: "3px 0", lineHeight: 1.25 }}>{tooltip.label}</strong>
        <div style={{ fontSize: 12, color: "#4a453c" }}>
          Links {tooltip.degree} entities
        </div>
      </>
    );
  }, [tooltip]);

  return (
    <div>
      {/* ---- controls ---- */}
      <div className="net-controls">
        <input
          className="net-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter the graph — firm, person or address…"
          aria-label="Filter the network graph"
        />
        <label className="net-toggle">
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} />
          <span className="swatch" style={{ background: PERSON_COLOR }} /> Shared people
        </label>
        <label className="net-toggle">
          <input type="checkbox" checked={showAddresses} onChange={(e) => setShowAddresses(e.target.checked)} />
          <span className="swatch swatch-dash" style={{ borderColor: ADDRESS_COLOR }} /> Shared addresses
        </label>
        <button type="button" className="net-btn" onClick={resetView}>
          Reset view
        </button>
      </div>

      {matchCount !== null && (
        <div className="net-matchline">
          {matchCount === 0
            ? `No node matches “${query}”.`
            : `${matchCount} match${matchCount === 1 ? "" : "es"} highlighted — neighbours kept visible.`}
        </div>
      )}

      {/* ---- canvas ---- */}
      <div className="net-wrap" ref={wrapRef}>
        {!graph && !error && <div className="net-status">Building the network…</div>}
        {error && <div className="net-status">{error}</div>}
        <canvas
          ref={canvasRef}
          className="net-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setFocus(null)}
          onWheel={onWheel}
          role="img"
          aria-label="Force-directed graph of GIFT IFSC entities linked by shared authorised persons and shared registered addresses"
        />
        {tooltip && (
          <div className="net-tip" role="status">
            {tooltipBody}
          </div>
        )}
        <div className="net-legend">
          <span><i className="dot" style={{ background: "#7a1f1f" }} /> Markets &amp; Funds</span>
          <span><i className="dot" style={{ background: "#9a6a1a" }} /> Bullion</span>
          <span><i className="dot" style={{ background: "#1f5a5f" }} /> Banking</span>
          <span><i className="dot" style={{ background: "#6a2f5a" }} /> Insurance</span>
          <span><i className="dot" style={{ background: "#2f6b34" }} /> Fintech</span>
          <span><i className="dot" style={{ background: "#5a5148" }} /> Services</span>
          <span><i className="dia" /> Person</span>
          <span><i className="sq" /> Address</span>
        </div>
      </div>

      <p className="net-hint">
        Drag to pan · scroll to zoom · drag a node to pull it out · click a firm to open its dossier.
      </p>

      {/* ---- stats ---- */}
      {stats && (
        <div className="net-stats">
          <div>
            <strong>{stats.entitiesConnected.toLocaleString("en-IN")}</strong>
            <span>of {stats.entitiesTotal.toLocaleString("en-IN")} entities are connected to at least one other</span>
          </div>
          <div>
            <strong>{stats.peopleHubs.toLocaleString("en-IN")}</strong>
            <span>people sign for more than one entity</span>
          </div>
          <div>
            <strong>{stats.addressHubs.toLocaleString("en-IN")}</strong>
            <span>addresses host more than one entity</span>
          </div>
          <div>
            <strong>{stats.largestCluster.toLocaleString("en-IN")}</strong>
            <span>nodes in the largest single cluster</span>
          </div>
        </div>
      )}
    </div>
  );
}
