import {
  ACTIVE_BRAND,
  disclaimerFor,
  type BrandConfig,
} from "@mamdani-ticketer/contracts";

export const brand: BrandConfig = ACTIVE_BRAND;
export const disclaimer = disclaimerFor(brand);
