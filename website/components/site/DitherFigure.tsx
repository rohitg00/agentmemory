"use client";

import { useEffect, useRef } from "react";

type Vec = [number, number, number];
type Face = Vec[];
type Edge = [Vec, Vec];
type Scene = { faces: Face[]; edges: Edge[]; nodes: Vec[] };
export type DitherShape = "stack" | "block" | "graph";

const GRID = 60;
const PITCH = 0.6155;
const LIGHT: Vec = [-0.3, 0.9, 0.3];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function box(cx: number, cy: number, cz: number, w: number, h: number, d: number): Face[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  return [
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ];
}

function stack(t: number): Scene {
  const faces: Face[] = [];
  const count = 5;
  const gap = 0.42 + Math.sin(t * 0.7) * 0.05;
  for (let i = 0; i < count; i++) {
    const lift = Math.sin(t * 0.9 - i * 0.7) * 0.025;
    faces.push(...box(0, (i - (count - 1) / 2) * gap + lift, 0, 1.45, 0.13, 1.45));
  }
  return { faces, edges: [], nodes: [] };
}

function block(t: number): Scene {
  const size = 1.34 + Math.sin(t * 0.8) * 0.03;
  return { faces: box(0, 0, 0, size, size, size), edges: [], nodes: [] };
}

const GRAPH_NODES: Vec[] = [
  [0, 1.02, 0],
  [0.95, 0.28, 0.3],
  [-0.9, 0.34, -0.25],
  [0.25, 0.1, -1],
  [-0.3, 0.2, 0.98],
  [0.62, -0.72, -0.5],
  [-0.66, -0.68, 0.45],
  [0, -1.04, 0],
];
const GRAPH_LINKS = [
  [0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [2, 3], [2, 4],
  [1, 5], [3, 5], [2, 6], [4, 6], [5, 7], [6, 7], [5, 6], [1, 6],
];

function graph(): Scene {
  return {
    faces: [],
    edges: GRAPH_LINKS.map(([a, b]) => [GRAPH_NODES[a!]!, GRAPH_NODES[b!]!] as Edge),
    nodes: GRAPH_NODES,
  };
}

const SCENES: Record<DitherShape, (t: number) => Scene> = { stack, block, graph };

function rotate(v: Vec, sinY: number, cosY: number, sinX: number, cosX: number): Vec {
  const x = v[0] * cosY + v[2] * sinY;
  const z = -v[0] * sinY + v[2] * cosY;
  return [x, v[1] * cosX - z * sinX, v[1] * sinX + z * cosX];
}

function hash(c: number, r: number) {
  const n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function DitherFigure({ shape, className }: { shape: DitherShape; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    const raster = document.createElement("canvas");
    raster.width = GRID;
    raster.height = GRID;
    const rctx = raster.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx || !rctx) return;

    const color = getComputedStyle(canvas).color;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rows = Math.round(GRID / 0.866);
    const sinX = Math.sin(PITCH);
    const cosX = Math.cos(PITCH);
    const scale = GRID * 0.33;
    const project = (v: Vec): [number, number] => [GRID / 2 + v[0] * scale, GRID / 2 - v[1] * scale];

    let size = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      const yaw = Math.PI / 4 + Math.sin(t * 0.35) * (shape === "graph" ? 0.9 : 0.32);
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const scene = SCENES[shape](t);

      rctx.fillStyle = "#000";
      rctx.fillRect(0, 0, GRID, GRID);
      const faces = scene.faces
        .map((face) => face.map((v) => rotate(v, sinY, cosY, sinX, cosX)))
        .map((pts) => {
          const a = pts[0]!;
          const b = pts[1]!;
          const c = pts[2]!;
          const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const w: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          const n: Vec = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          const len = Math.hypot(n[0], n[1], n[2]) || 1;
          const depth = pts.reduce((sum, p) => sum + p[2], 0) / pts.length;
          return { pts, n: [n[0] / len, n[1] / len, n[2] / len] as Vec, depth };
        })
        .filter((face) => face.n[2] > 0)
        .sort((a, b) => a.depth - b.depth);
      for (const face of faces) {
        const lit = Math.max(0, face.n[0] * LIGHT[0] + face.n[1] * LIGHT[1] + face.n[2] * LIGHT[2]);
        const level = Math.round((0.1 + 0.9 * lit * lit) * 255);
        rctx.fillStyle = `rgb(${level},${level},${level})`;
        rctx.beginPath();
        face.pts.forEach((p, i) => {
          const [x, y] = project(p);
          if (i === 0) rctx.moveTo(x, y);
          else rctx.lineTo(x, y);
        });
        rctx.closePath();
        rctx.fill();
      }
      rctx.lineCap = "round";
      for (const [from, to] of scene.edges) {
        const a = rotate(from, sinY, cosY, sinX, cosX);
        const b = rotate(to, sinY, cosY, sinX, cosX);
        const level = Math.round((0.42 + 0.3 * Math.max(0, Math.min(1, (a[2] + b[2]) / 2 + 0.5))) * 255);
        rctx.strokeStyle = `rgb(${level},${level},${level})`;
        rctx.lineWidth = 1.7;
        rctx.beginPath();
        rctx.moveTo(...project(a));
        rctx.lineTo(...project(b));
        rctx.stroke();
      }
      scene.nodes.forEach((node, i) => {
        const p = rotate(node, sinY, cosY, sinX, cosX);
        const pulse = 0.8 + 0.2 * Math.sin(t * 1.6 + i * 1.3);
        const level = Math.round(Math.min(1, 0.75 + 0.25 * (p[2] + 0.5)) * pulse * 255);
        rctx.fillStyle = `rgb(${level},${level},${level})`;
        rctx.beginPath();
        rctx.arc(...project(p), 2.6, 0, Math.PI * 2);
        rctx.fill();
      });

      const data = rctx.getImageData(0, 0, GRID, GRID).data;
      const step = size / GRID;
      const sweep = ((t * 0.16) % 1.6) - 0.3;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = color;
      for (let r = 0; r < rows; r++) {
        const gy = Math.min(GRID - 1, Math.floor(r * 0.866));
        for (let c = 0; c < GRID; c++) {
          const base = data[(gy * GRID + c) * 4]! / 255;
          if (base < 0.04) continue;
          const twinkle = 0.82 + 0.18 * Math.sin(t * 2.1 + hash(c, r) * 6.283);
          const band = Math.max(0, 1 - Math.abs((c + r) / (GRID + rows) - sweep) * 9) * 0.3;
          const value = Math.min(1, base * twinkle + band);
          const on = value > BAYER[(r % 4) * 4 + (c % 4)]! * 0.92;
          ctx.globalAlpha = on ? 0.3 + 0.7 * value * value : 0.1 + value * 0.25;
          const radius = step * (on ? 0.17 + 0.23 * value : 0.13);
          const x = (c + (r % 2 ? 0.5 : 0) + 0.25) * step;
          const y = (r + 0.5) * step * 0.866;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    let frame = 0;
    let visible = false;
    let last = 0;
    const loop = (now: number) => {
      frame = 0;
      if (!visible || still.matches) return;
      if (now - last >= 33) {
        last = now;
        draw(now / 1000);
      }
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && visible && !still.matches) frame = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      start();
    });
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now() / 1000);
    });
    const onMotion = () => {
      draw(performance.now() / 1000);
      start();
    };
    resize();
    draw(still.matches ? 2 : performance.now() / 1000);
    io.observe(canvas);
    ro.observe(canvas);
    still.addEventListener("change", onMotion);
    return () => {
      io.disconnect();
      ro.disconnect();
      still.removeEventListener("change", onMotion);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shape]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
