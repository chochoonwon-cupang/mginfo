import type { MetadataRoute } from "next";
import { getCategories, getPublishedPosts } from "@/lib/db";
import { resolvePublicOrigin } from "@/lib/main-landing/resolve-origin";
import { collectRegionHubs, regionHubPath } from "@/lib/region-hub";

export const revalidate = 600;

function originPostUrl(origin: string, slug: string) {
  const safe = encodeURI(slug);
  return `${origin}/posts/${safe}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, categories, origin] = await Promise.all([
    getPublishedPosts(),
    getCategories(),
    resolvePublicOrigin(),
  ]);
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/posts`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${origin}/partners`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    ...categories.map((c) => ({
      url: `${origin}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...collectRegionHubs(posts).map((hub) => ({
      url: `${origin}${regionHubPath(hub.place)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.65,
    })),
  ];

  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: originPostUrl(origin, post.slug),
    lastModified: new Date(post.updatedAt || post.publishedAt || post.createdAt),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  return [...staticPages, ...postPages];
}
