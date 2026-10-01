import { assembleBodyHtml } from "./page-plan-schema";
import type { PagePlan, WriterResult } from "./page-plan-types";
import { isCodeRenderedBlock } from "./vendor-profile-types";
import type { VerifiedPack } from "./verified-availability";
import { renderVerifiedBlockHtml, wrapVerifiedSection } from "./verified-renderers";

/**
 * Hybrid page assembly:
 * - AI sections from Writer JSON
 * - Verified sections from code renderers
 * Order follows PagePlan.sections.
 */
export function assembleHybridBodyHtml(input: {
  plan: PagePlan;
  writer: WriterResult;
  pack: VerifiedPack;
}): {
  bodyHtml: string;
  verifiedBlocksRendered: string[];
  verifiedBlocksRemoved: Array<{ blockKey: string; reason: string }>;
} {
  const writerByKey = new Map(input.writer.sections.map((s) => [s.blockKey, s]));
  const verifiedBlocksRendered: string[] = [];
  const verifiedBlocksRemoved: Array<{ blockKey: string; reason: string }> = [];
  const parts: string[] = [];

  const intro = input.writer.intro?.trim();
  if (intro) {
    parts.push(intro.startsWith("<") ? intro : `<p>${intro}</p>`);
  }

  for (const section of input.plan.sections) {
    // FAQ is rendered once on the post page from faqItems (<details>), not duplicated in body.
    if (section.blockKey === "faq") {
      continue;
    }

    if (isCodeRenderedBlock(section.blockKey)) {
      const inner = renderVerifiedBlockHtml(section.blockKey, section, input.pack);
      if (!inner) {
        verifiedBlocksRemoved.push({
          blockKey: section.blockKey,
          reason: "렌더 시점 데이터 없음",
        });
        continue;
      }
      parts.push(wrapVerifiedSection(section.heading, inner));
      verifiedBlocksRendered.push(section.blockKey);
      continue;
    }

    const written = writerByKey.get(section.blockKey);
    if (!written) {
      verifiedBlocksRemoved.push({
        blockKey: section.blockKey,
        reason: "Writer 섹션 누락",
      });
      continue;
    }
    const heading = written.heading.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let html = written.html.trim().replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>\s*/i, "");
    parts.push(`<h2>${heading}</h2>\n${html}`);
  }

  return {
    bodyHtml: parts.join("\n"),
    verifiedBlocksRendered,
    verifiedBlocksRemoved,
  };
}

/** Writer should only see non-code-rendered sections. */
export function planForWriter(plan: PagePlan): PagePlan {
  return {
    ...plan,
    sections: plan.sections.filter((s) => !isCodeRenderedBlock(s.blockKey)),
  };
}

export function assembleAiOnlyFallback(writer: WriterResult): string {
  return assembleBodyHtml(writer);
}
