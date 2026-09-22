/**
 * Brand isolation (SPEC §0).
 *
 * All product name, domain, tagline, and social handle references for UI, OG,
 * email, and legal pages should import from this module (or env that mirrors it).
 * Gate G1 failure swaps ACTIVE_BRAND to FALLBACK_BRAND — one deploy, not a redesign.
 * Public report URLs use /r/{slug}-{shortId}; slugs must never contain the brand name.
 */

export type BrandConfig = {
  /** Display name shown in chrome, OG titles, and legal placeholders */
  name: string;
  /** Primary public hostname without protocol */
  domain: string;
  /** One-line hook; must read correctly under either brand */
  tagline: string;
  /** Short name for tight UI (nav, share cards) */
  shortName: string;
  social: {
    /** Optional handles; empty until cleared for public use */
    tiktok?: string;
    x?: string;
    instagram?: string;
  };
};

/** Working title — not a cleared brand or available domain (SPEC header / §0). */
export const PRIMARY_BRAND: BrandConfig = {
  name: "Mamdani, Fix This",
  domain: "mamdanifixthis.example",
  tagline: "Tag Mamdani. Put it on the map.",
  shortName: "Fix This",
  social: {},
};

/**
 * Neutral fallback reserved before public promotion.
 * Used when G1 name clearance fails; describe the trend editorially in About.
 */
export const FALLBACK_BRAND: BrandConfig = {
  name: "NYC Public Fix Map",
  domain: "nycpublicfixmap.example",
  tagline: "See what needs fixing. Put it on the map.",
  shortName: "Fix Map",
  social: {},
};

/**
 * Active brand for this build. Flip to FALLBACK_BRAND (or drive from env in the
 * API/web apps) when counsel writes a no-go on the primary name.
 */
export const ACTIVE_BRAND: BrandConfig = PRIMARY_BRAND;

/** Persistent unofficial disclaimer (SPEC §3). */
export const UNOFFICIAL_DISCLAIMER =
  "Unofficial community project. Not affiliated with NYC government or Mamdani’s office.";

/**
 * Disclaimer text that still works under the fallback brand (no personal name).
 * Prefer this when ACTIVE_BRAND === FALLBACK_BRAND.
 */
export const UNOFFICIAL_DISCLAIMER_NEUTRAL =
  "Unofficial community project. Not affiliated with NYC government.";

export function disclaimerFor(brand: BrandConfig = ACTIVE_BRAND): string {
  return brand === FALLBACK_BRAND || brand.name === FALLBACK_BRAND.name
    ? UNOFFICIAL_DISCLAIMER_NEUTRAL
    : UNOFFICIAL_DISCLAIMER;
}
