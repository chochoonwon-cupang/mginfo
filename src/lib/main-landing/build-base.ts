import { buildDemolitionV1Base } from "./designs/demolition-v1";
import { buildScalpTattooV1Base } from "./designs/scalp-tattoo-v1";
import type { MainLandingConfig, MainLandingCopy, MainLandingVendor } from "./types";

export function buildMainLandingDesignBase(
  config: MainLandingConfig,
  siteName: string
): Omit<MainLandingCopy, "accent" | "theme" | "sectionOrder"> {
  if (config.designId === "demolition-v1") {
    return buildDemolitionV1Base(config.vendor, siteName);
  }
  return buildScalpTattooV1Base(config.vendor, siteName);
}

