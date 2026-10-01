import { escapeHtml } from "./html-escape";
import type { PagePlanSection } from "./page-plan-types";
import type { VerifiedPack } from "./verified-availability";
import type { Animal, ProjectExample } from "./vendor-profile-types";

function esc(value: string): string {
  return escapeHtml(String(value || ""));
}

function factValue(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

function infoRow(label: string, value: string): string {
  if (!value.trim()) return "";
  return `<div class="verified-info-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

/** Only http(s) absolute URLs — never invent or pass through javascript: etc. */
export function isSafeMediaUrl(url: string): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function animalAlt(animal: Animal, companyName?: string): string {
  return [companyName, animal.breed, animal.name].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
}

/** Verified-only animal card. No Gemini copy. Hide empty fields. */
export function renderAnimalCard(animal: Animal, companyName?: string): string {
  const title = esc(animal.name || animal.breed);
  const chips = [
    animal.breed && `<span class="verified-chip">${esc(animal.breed)}</span>`,
    animal.sex && `<span class="verified-chip">${esc(animal.sex)}</span>`,
    animal.birthDate && `<span class="verified-chip">${esc(animal.birthDate)}</span>`,
    animal.color && `<span class="verified-chip">${esc(animal.color)}</span>`,
  ].filter(Boolean);
  const defaultAlt = animalAlt(animal, companyName);
  const media = (animal.media || [])
    .filter((m) => isSafeMediaUrl(m.url))
    .slice(0, 3)
    .map((m) => {
      const alt = esc(m.alt?.trim() || defaultAlt || animal.breed);
      return `<figure class="verified-animal-media"><img src="${esc(m.url)}" alt="${alt}" width="800" height="600" loading="lazy" decoding="async" /></figure>`;
    })
    .join("");
  const desc =
    animal.description && String(animal.description).trim()
      ? `<p class="verified-animal-desc">${esc(animal.description.trim())}</p>`
      : "";
  return `<article class="verified-animal" data-animal-id="${esc(animal.id)}">
  ${media ? `<div class="verified-animal-gallery">${media}</div>` : ""}
  <div class="verified-animal-body">
    <h3>${title}</h3>
    ${chips.length ? `<div class="verified-chip-row">${chips.join("")}</div>` : ""}
    ${desc}
  </div>
</article>`;
}

function renderProjectCard(project: ProjectExample): string {
  const chips = [
    project.projectType && `<span class="verified-chip">${esc(project.projectType)}</span>`,
    project.region && `<span class="verified-chip">${esc(project.region)}</span>`,
    project.completedAt && `<span class="verified-chip">${esc(project.completedAt.slice(0, 10))}</span>`,
  ].filter(Boolean);
  const media = (project.media || [])
    .filter((m) => isSafeMediaUrl(m.url))
    .slice(0, 3)
    .map((m) => {
      const alt = esc(m.alt?.trim() || project.title);
      return `<figure class="verified-project-media"><img src="${esc(m.url)}" alt="${alt}" width="800" height="600" loading="lazy" decoding="async" /></figure>`;
    })
    .join("");
  const desc =
    project.description && String(project.description).trim()
      ? `<p class="verified-project-desc">${esc(project.description.trim())}</p>`
      : "";
  return `<article class="verified-project" data-project-id="${esc(project.id)}">
  ${media ? `<div class="verified-project-gallery">${media}</div>` : ""}
  <div class="verified-project-body">
    <h3>${esc(project.title)}</h3>
    ${chips.length ? `<div class="verified-chip-row">${chips.join("")}</div>` : ""}
    ${desc}
  </div>
</article>`;
}

/**
 * Code-rendered Verified blocks.
 * Role split (no duplicate facts across adjacent blocks):
 * - store_information: identity + contact + services/specialty (no hours)
 * - visit_information: hours, consultation, visit policy, parking (no phone/address repeat)
 */
export function renderVerifiedBlockHtml(
  blockKey: string,
  section: PagePlanSection,
  pack: VerifiedPack
): string | null {
  const view = pack.view;
  if (!view) return null;

  switch (blockKey) {
    case "available_animals": {
      if (!pack.matchingAnimals.length) return null;
      const cards = pack.matchingAnimals
        .map((a) => renderAnimalCard(a, view.companyName))
        .join("\n");
      return `<div class="verified-block verified-animals" data-block="${esc(blockKey)}">
${cards}
</div>`;
    }
    case "store_information":
    case "company_information": {
      const rows: string[] = [];
      rows.push(infoRow("상호", view.companyName));
      if (view.address) rows.push(infoRow("주소", view.address));
      if (view.phone) rows.push(infoRow("전화", view.phone));
      if (view.website) rows.push(infoRow("웹사이트", view.website));
      if (view.services.length) {
        rows.push(infoRow("서비스", view.services.join(", ")));
      } else {
        const serviceTypes = view.industryData?.serviceTypes;
        if (Array.isArray(serviceTypes) && serviceTypes.length) {
          rows.push(infoRow("서비스", serviceTypes.map(String).join(", ")));
        }
      }
      if (view.serviceAreas.length) {
        rows.push(infoRow("서비스 지역", view.serviceAreas.join(", ")));
      }
      for (const fact of view.verifiedFacts.slice(0, 8)) {
        rows.push(infoRow(fact.label, factValue(fact.value)));
      }
      const body = rows.filter(Boolean).join("\n");
      if (!body) return null;
      return `<div class="verified-block verified-store" data-block="${esc(blockKey)}">
<dl class="verified-info-list">
${body}
</dl>
</div>`;
    }
    case "visit_information": {
      const rows: string[] = [];
      if (view.businessHours) rows.push(infoRow("영업시간", view.businessHours));
      if (view.consultationMethod) rows.push(infoRow("상담", view.consultationMethod));
      if (view.visitPolicy) rows.push(infoRow("방문", view.visitPolicy));
      const parking = view.industryData?.parking;
      if (parking != null && String(parking).trim()) {
        rows.push(infoRow("주차", String(parking).trim()));
      }
      const body = rows.filter(Boolean).join("\n");
      if (!body) return null;
      return `<div class="verified-block verified-visit" data-block="${esc(blockKey)}">
<dl class="verified-info-list">
${body}
</dl>
</div>`;
    }
    case "consultation": {
      if (!view.consultationMethod) return null;
      return `<div class="verified-block verified-consultation" data-block="${esc(blockKey)}">
<p class="verified-consult-text">${esc(view.consultationMethod)}</p>
</div>`;
    }
    case "project_examples": {
      if (!pack.projects.length) return null;
      return `<div class="verified-block verified-projects" data-block="${esc(blockKey)}">
${pack.projects.map(renderProjectCard).join("\n")}
</div>`;
    }
    default:
      return null;
  }
}

/** Prefer section.heading from plan; never let AI rewrite verified body. */
export function wrapVerifiedSection(heading: string, innerHtml: string): string {
  const h = esc(heading);
  return `<h2 class="verified-section-title">${h}</h2>\n${innerHtml}`;
}
