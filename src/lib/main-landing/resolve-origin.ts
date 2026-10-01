import { getRequestHost } from "@/lib/host-profiles";
import { SITE_ORIGIN } from "@/lib/seo";

/** 요청 Host 기준 절대 origin (멀티테넌트 sitemap·robots·canonical) */
export async function resolvePublicOrigin(): Promise<string> {
  const host = await getRequestHost();
  if (host) return `https://${host}`;
  return SITE_ORIGIN.replace(/\/$/, "");
}
