export type { HubBoardTemplate, HubBoardTemplateDraft, HubBoardTemplateBuildInput } from "./types";
export type { HubTemplateDef, HubTemplateKind, TopicCopy } from "./topic-copy";
export { HUB_TEMPLATE_CATALOG, getHubTemplateDef } from "./catalog";
export { listHubBoardTemplates, getHubBoardTemplate, defaultHubBoardTemplateId } from "./registry";
/** Server-side only — import from `./render` in API/cron paths, not from client components. */
export { renderHubBoardTemplateArticle } from "./render";
