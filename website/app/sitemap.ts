import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getProjectMeta } from "@/lib/meta";
import { COMPETITORS } from "@/lib/compare";

const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/benchmarks", priority: 0.8, changeFrequency: "monthly" },
  { path: "/security", priority: 0.7, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.5, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.7, changeFrequency: "weekly" },
  { path: "/vs", priority: 0.6, changeFrequency: "monthly" },
  ...COMPETITORS.map((c) => ({ path: `/vs/${c.slug}`, priority: 0.6, changeFrequency: "monthly" as const })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(getProjectMeta().generatedAt);
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
