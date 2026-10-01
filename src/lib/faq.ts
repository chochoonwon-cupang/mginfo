import type { FaqItem } from "./types";

export type { FaqItem };

export function parseFaqItems(raw: unknown): FaqItem[] | undefined {
  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = String(row.question || "").trim().slice(0, 120);
      const answer = String(row.answer || "").trim().slice(0, 450);
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is FaqItem => Boolean(item));
  return items.length ? items.slice(0, 5) : undefined;
}

function normFaqKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** Match only a single FAQ heading h2 (must not span earlier sections). */
const FAQ_H2_RE = /<h2(?:\s[^>]*)?>\s*[^<]*(?:FAQ|자주\s*묻는\s*질문)[^<]*\s*<\/h2>/i;
const FAQ_H2_WITH_PARAS_RE =
  /<h2(?:\s[^>]*)?>\s*[^<]*(?:FAQ|자주\s*묻는\s*질문)[^<]*\s*<\/h2>\s*((?:<p(?:\s[^>]*)?>[\s\S]*?<\/p>\s*)*)/gi;

/** Pull Q/A pairs from a legacy body FAQ block (plain <p>Q. … A. …). */
export function extractFaqFromBodyHtml(html: string): FaqItem[] {
  const source = String(html || "");
  if (!source || !FAQ_H2_RE.test(source)) return [];
  FAQ_H2_WITH_PARAS_RE.lastIndex = 0;
  const match = FAQ_H2_WITH_PARAS_RE.exec(source);
  if (!match) return [];
  const block = match[1] || "";
  const items: FaqItem[] = [];
  const pairRe =
    /Q\.\s*([\s\S]*?)\s*(?:<br\s*\/?>|\n)\s*A\.\s*([\s\S]*?)(?=<\/p>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(block)) !== null) {
    const question = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const answer = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 450);
    if (question && answer) items.push({ question, answer });
  }
  return items.slice(0, 5);
}

/**
 * Remove duplicate body FAQ heading+paragraphs — page renders one <details> FAQ.
 * Important: only strip the FAQ h2 itself, never earlier article sections.
 */
export function stripBodyFaqSections(html: string): string {
  return String(html || "")
    .replace(FAQ_H2_WITH_PARAS_RE, (full, paras: string) => {
      // Keep non-Q/A content after a mislabeled heading (safety).
      const body = String(paras || "");
      if (body && !/Q\.\s*/i.test(body)) return body;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefer structured faqItems; append unique body-extracted Qs. Max 5. */
export function mergeFaqItems(primary: FaqItem[], secondary: FaqItem[]): FaqItem[] {
  const out: FaqItem[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const q = String(item.question || "").trim();
    const a = String(item.answer || "").trim();
    if (!q || !a) continue;
    const key = normFaqKey(q);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: q.slice(0, 120), answer: a.slice(0, 450) });
    if (out.length >= 5) break;
  }
  return out;
}
