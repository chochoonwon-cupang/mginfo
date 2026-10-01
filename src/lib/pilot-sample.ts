import { updatePilotEventPublicSample } from "./pilot-store";

/** Fetch one public page after pilot publish and attach sample fields to the event. */
export async function samplePublicPilotPage(eventId: string, slug: string, origin: string) {
  const url = `${origin.replace(/\/$/, "")}/posts/${slug}`;
  const html = await (await fetch(url, { cache: "no-store" })).text();
  const sm = await (await fetch(`${origin.replace(/\/$/, "")}/sitemap.xml?ts=${Date.now()}`, { cache: "no-store" }))
    .text()
    .catch(() => "");
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || "";
  const text = article.replace(/<[^>]+>/g, " ");
  const isDemo = /철거|demolition/i.test(slug) || /철거/.test(text.slice(0, 200));
  await updatePilotEventPublicSample(eventId, {
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim(),
    h1: html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim(),
    metaDesc:
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1],
    canonical:
      html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ||
      html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1],
    hasFaq: /FAQPage|faq-item|faqItems/i.test(html),
    hasVerified: /data-animal-id|data-project-id|verified-animal|verified-project/i.test(html),
    inSitemap: sm.includes(`/posts/${slug}`),
    articleCrossLeak: isDemo
      ? /분양|강아지|포메|개체|품종/.test(text)
      : /철거|폐기물|원상복구/.test(text),
  });
}
