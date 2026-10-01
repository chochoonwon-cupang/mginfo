import type { Animal, ProjectExample } from "./vendor-profile-types";

/** Deterministic match strength for Verified inventory items. */
export type MatchType = "exact" | "type" | "region" | "other";

export type TopicHints = {
  keyword: string;
  region?: string;
  primaryTopic?: string;
  service?: string;
  /** e.g. 상가, 사무실, 상가철거 */
  projectType?: string;
  /** Animal breed topic when present */
  breed?: string;
};

export type MatchedProject = {
  project: ProjectExample;
  matchType: MatchType;
  matchedFields: string[];
};

export type MatchedAnimal = {
  animal: Animal;
  matchType: MatchType;
  matchedFields: string[];
};

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function includesEither(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** Infer projectType-like token from keyword (상가철거 → 상가철거 / 상가). */
export function inferProjectTypeFromKeyword(keyword: string, primaryTopic?: string): string {
  const topic = norm(primaryTopic || "");
  if (topic && !/철거|분양|지역/.test(topic)) return primaryTopic!.trim();
  const kw = String(keyword || "");
  const types = ["상가철거", "사무실철거", "인테리어철거", "주택철거", "상가", "사무실", "주택", "인테리어"];
  for (const t of types) {
    if (kw.includes(t)) return t;
  }
  return "";
}

function projectTypeMatches(projectType: string | undefined, hint: string): boolean {
  if (!hint) return false;
  const p = norm(projectType || "");
  const h = norm(hint);
  if (!p || !h) return false;
  if (includesEither(p, h)) return true;
  // 상가 ↔ 상가철거
  const strip = (s: string) => s.replace(/철거|공사|시공/g, "");
  return includesEither(strip(p), strip(h)) && Boolean(strip(p) && strip(h));
}

function regionMatches(projectRegion: string | undefined, hint: string): boolean {
  if (!hint) return false;
  return includesEither(norm(projectRegion || ""), norm(hint));
}

export function matchProject(project: ProjectExample, hints: TopicHints): MatchedProject {
  const matchedFields: string[] = [];
  const typeOk = projectTypeMatches(project.projectType, hints.projectType || hints.primaryTopic || "");
  const regionOk = regionMatches(project.region, hints.region || "");
  if (typeOk) matchedFields.push("projectType");
  if (regionOk) matchedFields.push("region");

  let matchType: MatchType = "other";
  if (typeOk && regionOk) matchType = "exact";
  else if (typeOk) matchType = "type";
  else if (regionOk) matchType = "region";

  return { project, matchType, matchedFields };
}

/**
 * Rank & filter projects for rendering.
 * Default: exact → type → region only (exclude "other" so unrelated cases never appear).
 */
export function selectRelevantProjects(
  projects: ProjectExample[],
  hints: TopicHints,
  opts?: { allowOther?: boolean; limit?: number }
): MatchedProject[] {
  const allowOther = opts?.allowOther === true;
  const limit = opts?.limit ?? 6;
  const ranked = projects
    .map((p) => matchProject(p, hints))
    .filter((m) => allowOther || m.matchType !== "other")
    .sort((a, b) => {
      const order: Record<MatchType, number> = { exact: 0, type: 1, region: 2, other: 3 };
      return order[a.matchType] - order[b.matchType];
    });
  return ranked.slice(0, limit);
}

/** Best match type among selected projects (for heading grounding). */
export function bestProjectMatchType(matched: MatchedProject[]): MatchType | null {
  if (!matched.length) return null;
  return matched[0].matchType;
}

/**
 * Safe heading for project_examples.
 * Exact (region+type) may keep topic-local wording; otherwise generic.
 */
export function groundProjectExamplesHeading(input: {
  plannedHeading: string;
  matchType: MatchType | null;
  region?: string;
  projectType?: string;
}): string {
  const planned = String(input.plannedHeading || "").trim();
  if (input.matchType === "exact") {
    return planned || "실제 시공 사례";
  }
  if (input.matchType === "type") {
    const label = (input.projectType || "").replace(/철거$/, "") || "관련";
    return `확인 가능한 ${label} 철거 사례`.replace(/\s+/g, " ").trim();
  }
  if (input.matchType === "region") {
    return "확인 가능한 시공 사례";
  }
  // other / none — never imply local exact cases
  if (/실제|현장/.test(planned) && input.region && planned.includes(input.region)) {
    return "확인 가능한 시공 사례";
  }
  return planned && !input.region?.length ? planned : "확인 가능한 시공 사례";
}

export function matchAnimal(animal: Animal, hints: TopicHints): MatchedAnimal {
  const breedHint = norm(hints.breed || hints.primaryTopic || "");
  const animalBreed = norm(animal.breed);
  const matchedFields: string[] = [];
  let matchType: MatchType = "other";
  if (breedHint && animalBreed && includesEither(animalBreed, breedHint)) {
    matchType = "exact";
    matchedFields.push("breed");
  }
  return { animal, matchType, matchedFields };
}

/** Animals: only exact breed matches (never show other breeds as "related"). */
export function selectRelevantAnimals(animals: Animal[], hints: TopicHints): MatchedAnimal[] {
  if (!hints.breed && !hints.primaryTopic) {
    // No breed topic → do not invent relevance; return empty for available_animals filter
    return [];
  }
  return animals.map((a) => matchAnimal(a, hints)).filter((m) => m.matchType === "exact");
}
