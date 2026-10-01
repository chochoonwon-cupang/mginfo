import { revalidatePath } from "next/cache";

const PUBLIC_PAGES = ["/", "/posts", "/partners", "/sitemap.xml", "/rss.xml", "/feed/posts.json"] as const;
const PUBLIC_DYNAMIC_PAGES = ["/category/[slug]", "/posts/[slug]", "/region/[slug]"] as const;

/** Drop public ISR after admin settings/category/publish changes so the next visit is fresh. */
export function revalidatePublicSite() {
  revalidatePath("/", "layout");
  for (const path of PUBLIC_PAGES) {
    revalidatePath(path);
  }
  for (const path of PUBLIC_DYNAMIC_PAGES) {
    revalidatePath(path, "page");
  }
}
