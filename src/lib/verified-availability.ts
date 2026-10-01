import type { ContentBlock } from "./content-blueprint-types";
import type { PagePlan } from "./page-plan-types";
import {
  animalsForVendor,
  hasDataKey,
  projectsForVendor,
  resolveVendorView,
  type ResolvedVendorView,
} from "./vendor-profile-adapter";
import type { Animal, ProjectExample, VendorProfile, VendorProfileStore } from "./vendor-profile-types";
import { isCodeRenderedBlock } from "./vendor-profile-types";
import type { AdVendor } from "./types";
import { extractPlaceName } from "./region-geo";
import {
  bestProjectMatchType,
  groundProjectExamplesHeading,
  inferProjectTypeFromKeyword,
  selectRelevantAnimals,
  selectRelevantProjects,
  type MatchType,
  type MatchedAnimal,
  type MatchedProject,
  type TopicHints,
} from "./verified-match";

/** Richer per-block availability (PHASE 7). Backward-compatible string[] still exported. */
export type VerifiedBlockMeta = {
  blockKey: string;
  available: boolean;
  matchType?: MatchType | null;
  itemCount: number;
  matchedFields: string[];
  /** Planner-safe heading hint when Verified heading must not overclaim. */
  safeHeading?: string;
  reason?: string;
};

export type VerifiedContextMeta = {
  blocks: VerifiedBlockMeta[];
  topicHints: TopicHints;
};

export type VerifiedPack = {
  view: ResolvedVendorView | null;
  matchingAnimals: Animal[];
  projects: ProjectExample[];
  matchedAnimals: MatchedAnimal[];
  matchedProjects: MatchedProject[];
  /** Backward compatible list of available block keys */
  availableVerifiedBlocks: string[];
  /** Richer metadata for Planner / QA (not raw DB dump) */
  verifiedContext: VerifiedContextMeta;
  removedHints: Array<{ blockKey: string; reason: string }>;
  topicBreed?: string;
};

/** Extract breed-like topic from keyword (e.g. 배곧포메라니안분양 → 포메라니안). */
export function extractBreedTopic(keyword: string, primaryTopic?: string): string {
  const topic = (primaryTopic || "").trim();
  if (topic && !/분양|철거|지역|강아지/.test(topic)) return topic;
  const known = [
    "포메라니안",
    "말티푸",
    "미니비숑",
    "비숑",
    "푸들",
    "말티즈",
    "치와와",
    "코커",
    "시바",
    "리트리버",
    "허스키",
    "프렌치불독",
    "불독",
    "시츄",
    "믹스",
  ];
  for (const breed of known) {
    if (keyword.includes(breed)) return breed;
  }
  return "";
}

function buildTopicHints(keyword: string, primaryTopic?: string, topicBreed?: string): TopicHints {
  return {
    keyword,
    region: extractPlaceName(keyword) || "",
    primaryTopic: primaryTopic || topicBreed || "",
    projectType: inferProjectTypeFromKeyword(keyword, primaryTopic),
    breed: topicBreed || "",
    service: /철거/.test(keyword) ? "철거" : /분양/.test(keyword) ? "분양" : "",
  };
}

function blockAvailable(
  block: ContentBlock,
  view: ResolvedVendorView | null,
  animals: Animal[],
  projects: ProjectExample[]
): { ok: boolean; reason?: string } {
  if (!block.verifiedDataRequired && !isCodeRenderedBlock(block.key)) {
    return { ok: true };
  }
  if (!view) {
    if (isCodeRenderedBlock(block.key) || block.verifiedDataRequired) {
      return { ok: false, reason: "VendorProfile/AdVendor 없음" };
    }
    return { ok: true };
  }

  switch (block.key) {
    case "store_information":
    case "company_information": {
      if (!view.companyName) return { ok: false, reason: "상호 없음" };
      if (!view.address && !view.phone) return { ok: false, reason: "주소·전화 모두 없음" };
      return { ok: true };
    }
    case "visit_information": {
      if (view.businessHours || view.consultationMethod || view.visitPolicy) return { ok: true };
      return { ok: false, reason: "영업시간·상담방식·방문정책 없음" };
    }
    case "consultation": {
      if (view.consultationMethod) return { ok: true };
      return { ok: false, reason: "consultationMethod 없음" };
    }
    case "available_animals": {
      if (!animals.length) return { ok: false, reason: "matching available animal 없음" };
      return { ok: true };
    }
    case "project_examples": {
      if (!projects.length) return { ok: false, reason: "관련 ProjectExample 없음" };
      return { ok: true };
    }
    default: {
      if (!block.verifiedDataRequired) return { ok: true };
      const keys = block.requiredData.length ? block.requiredData : [];
      for (const key of keys) {
        if (!hasDataKey(view, key, { animals, projects })) {
          return { ok: false, reason: `requiredData 없음: ${key}` };
        }
      }
      return { ok: true };
    }
  }
}

/**
 * Compute which verified/code-rendered blocks can be used BEFORE Planner.
 * Projects/animals are relevance-filtered (PHASE 7).
 */
export function computeVerifiedAvailability(input: {
  blocks: ContentBlock[];
  adVendor?: AdVendor | null;
  profile?: VendorProfile | null;
  store: VendorProfileStore;
  keyword: string;
  primaryTopic?: string;
}): VerifiedPack {
  const view = resolveVendorView(input.adVendor, input.profile);
  const hasAnimalBlock = input.blocks.some(
    (b) => b.key === "available_animals" && b.status !== "disabled"
  );
  const topicBreed = hasAnimalBlock ? extractBreedTopic(input.keyword, input.primaryTopic) : "";
  const topicHints = buildTopicHints(input.keyword, input.primaryTopic, topicBreed);

  const rawAnimals =
    view && hasAnimalBlock
      ? animalsForVendor(input.store.animals, view.vendorId, {
          breed: topicBreed || undefined,
          availableOnly: true,
        })
      : [];
  // Re-apply exact breed relevance (defense in depth if breed filter was empty)
  const matchedAnimals = selectRelevantAnimals(rawAnimals, topicHints);
  const matchingAnimals = matchedAnimals.map((m) => m.animal);

  const rawProjects = view ? projectsForVendor(input.store.projectExamples, view.vendorId) : [];
  const matchedProjects = selectRelevantProjects(rawProjects, topicHints);
  const projects = matchedProjects.map((m) => m.project);

  const availableVerifiedBlocks: string[] = [];
  const removedHints: Array<{ blockKey: string; reason: string }> = [];
  const blockMetas: VerifiedBlockMeta[] = [];

  for (const block of input.blocks) {
    if (block.status === "disabled") continue;
    if (!block.verifiedDataRequired && !isCodeRenderedBlock(block.key)) continue;
    const check = blockAvailable(block, view, matchingAnimals, projects);
    if (check.ok) {
      availableVerifiedBlocks.push(block.key);
      if (block.key === "project_examples") {
        const matchType = bestProjectMatchType(matchedProjects);
        blockMetas.push({
          blockKey: block.key,
          available: true,
          matchType,
          itemCount: projects.length,
          matchedFields: [...new Set(matchedProjects.flatMap((m) => m.matchedFields))],
          safeHeading: groundProjectExamplesHeading({
            plannedHeading: "",
            matchType,
            region: topicHints.region,
            projectType: topicHints.projectType,
          }),
        });
      } else if (block.key === "available_animals") {
        blockMetas.push({
          blockKey: block.key,
          available: true,
          matchType: matchedAnimals[0]?.matchType || null,
          itemCount: matchingAnimals.length,
          matchedFields: [...new Set(matchedAnimals.flatMap((m) => m.matchedFields))],
        });
      } else {
        blockMetas.push({
          blockKey: block.key,
          available: true,
          matchType: null,
          itemCount: 1,
          matchedFields: [],
        });
      }
    } else {
      removedHints.push({ blockKey: block.key, reason: check.reason || "unavailable" });
      blockMetas.push({
        blockKey: block.key,
        available: false,
        matchType: null,
        itemCount: 0,
        matchedFields: [],
        reason: check.reason,
      });
    }
  }

  return {
    view,
    matchingAnimals,
    projects,
    matchedAnimals,
    matchedProjects,
    availableVerifiedBlocks,
    verifiedContext: { blocks: blockMetas, topicHints },
    removedHints,
    topicBreed: topicBreed || undefined,
  };
}

/** Post-plan filter using live pack (safety net). */
export function filterPlanWithVerifiedPack(
  plan: PagePlan,
  blocks: ContentBlock[],
  pack: VerifiedPack
): { plan: PagePlan; removed: Array<{ blockKey: string; reason: string }> } {
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const available = new Set(pack.availableVerifiedBlocks);
  const removed: Array<{ blockKey: string; reason: string }> = [];
  const sections = [];

  for (const section of plan.sections) {
    const block = byKey.get(section.blockKey);
    if (!block) {
      removed.push({ blockKey: section.blockKey, reason: "Blueprint에 없는 블록" });
      continue;
    }
    if (isCodeRenderedBlock(section.blockKey) || block.verifiedDataRequired) {
      if (!available.has(section.blockKey)) {
        const hint = pack.removedHints.find((r) => r.blockKey === section.blockKey);
        removed.push({
          blockKey: section.blockKey,
          reason: hint?.reason || "verified 데이터 없음",
        });
        continue;
      }
    }

    let heading = section.heading;
    if (section.blockKey === "project_examples") {
      const meta = pack.verifiedContext.blocks.find((b) => b.blockKey === "project_examples");
      heading = groundProjectExamplesHeading({
        plannedHeading: section.heading,
        matchType: meta?.matchType ?? bestProjectMatchType(pack.matchedProjects),
        region: pack.verifiedContext.topicHints.region,
        projectType: pack.verifiedContext.topicHints.projectType,
      });
    }

    sections.push({
      ...section,
      heading,
      mustUseVerifiedData: Boolean(block.verifiedDataRequired) || Boolean(section.mustUseVerifiedData),
    });
  }

  return { plan: { ...plan, sections }, removed };
}

/** Compact planner prompt lines for verifiedContext (no raw PII dump). */
export function formatVerifiedContextForPlanner(meta: VerifiedContextMeta): string {
  const lines = meta.blocks
    .filter((b) => b.available)
    .map((b) => {
      const parts = [`${b.blockKey} (items=${b.itemCount}`];
      if (b.matchType) parts.push(`match=${b.matchType}`);
      if (b.matchedFields.length) parts.push(`fields=${b.matchedFields.join("+")}`);
      if (b.safeHeading) parts.push(`safeHeading="${b.safeHeading}"`);
      return `- ${parts.join(", ")})`;
    });
  return lines.join("\n") || "(없음)";
}
