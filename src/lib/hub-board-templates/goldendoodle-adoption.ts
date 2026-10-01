import { getHubTemplateDef } from "./catalog";
import { buildRegionalSeoTemplate } from "./builders/regional-seo";
import { HUB_TEMPLATE_COPIES } from "./copies";
import { GOLDENDOODLE_BREED_COPY } from "./goldendoodle-breed-copy";
import type { HubBoardTemplate } from "./types";
import type { TopicCopy } from "./topic-copy";

const def = getHubTemplateDef("goldendoodle-adoption")!;
const copy = (HUB_TEMPLATE_COPIES["goldendoodle-adoption"] || GOLDENDOODLE_BREED_COPY) as TopicCopy;

/** @deprecated Prefer registry list; kept for direct imports. */
export const goldendoodleAdoptionTemplate: HubBoardTemplate = buildRegionalSeoTemplate(def, copy);
