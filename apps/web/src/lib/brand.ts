import {
  disclaimerFor,
  resolveBrand,
  type BrandConfig,
} from "@mamdani-ticketer/contracts";

/** VITE_BRAND=primary|fallback (default primary). Rebuild/restart Vite after flip. */
export const brand: BrandConfig = resolveBrand(import.meta.env.VITE_BRAND);
export const disclaimer = disclaimerFor(brand);
