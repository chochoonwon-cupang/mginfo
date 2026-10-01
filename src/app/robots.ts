import type { MetadataRoute } from "next";
import { resolvePublicOrigin } from "@/lib/main-landing/resolve-origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await resolvePublicOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api", "/dev/"],
      },
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: ["/admin", "/api/", "/dev/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
