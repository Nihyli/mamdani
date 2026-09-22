/**
 * Legal / operator launch fields (SPEC §23–26, M3).
 *
 * Terms and Privacy remain DRAFT until counsel review. Product fields
 * (version, contact, takedown path) come from env; counsel-only clauses stay marked.
 * Production readiness fails when required operator/contact fields are missing.
 */

export type LegalOperatorConfig = {
  /** Policy version string shown on Terms/Privacy */
  policyVersion: string;
  effectiveDate: string | null;
  operatorName: string | null;
  operatorAddress: string | null;
  supportEmail: string | null;
  privacyEmail: string | null;
  appealEmail: string | null;
  /** Public path for safety intake (always /report-content when enabled) */
  safetyPath: string;
  privacyRequestPath: string;
  copyrightPath: string;
  /** Hosting/storage/auth wording for Privacy Notice (honest local/dev defaults OK) */
  hostingProviders: string | null;
  analysisProviders: string | null;
  analyticsDescription: string | null;
  dntResponse: string | null;
};

export type CopyrightAgentConfig = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export type ProductionReadinessResult = {
  ok: boolean;
  missing: string[];
  copyrightRouteVisible: boolean;
  draftLegalPages: true;
};

const REQUIRED_FOR_PRODUCTION = [
  "LEGAL_EFFECTIVE_DATE",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_OPERATOR_ADDRESS",
  "LEGAL_SUPPORT_EMAIL",
  "LEGAL_PRIVACY_EMAIL",
] as const;

export function legalFromEnv(
  env: Record<string, string | undefined> = {},
): LegalOperatorConfig {
  return {
    policyVersion: env.LEGAL_POLICY_VERSION?.trim() || "0.1.0-draft",
    effectiveDate: emptyToNull(env.LEGAL_EFFECTIVE_DATE),
    operatorName: emptyToNull(env.LEGAL_OPERATOR_NAME),
    operatorAddress: emptyToNull(env.LEGAL_OPERATOR_ADDRESS),
    supportEmail: emptyToNull(env.LEGAL_SUPPORT_EMAIL),
    privacyEmail: emptyToNull(env.LEGAL_PRIVACY_EMAIL),
    appealEmail:
      emptyToNull(env.LEGAL_APPEAL_EMAIL) ?? emptyToNull(env.LEGAL_SUPPORT_EMAIL),
    safetyPath: "/report-content",
    privacyRequestPath: "/report-content",
    copyrightPath: "/copyright",
    hostingProviders: emptyToNull(env.LEGAL_HOSTING_PROVIDERS),
    analysisProviders: emptyToNull(env.LEGAL_ANALYSIS_PROVIDERS),
    analyticsDescription:
      emptyToNull(env.LEGAL_ANALYTICS_DESCRIPTION) ??
      "None — essential session/security storage and interface preferences only.",
    dntResponse:
      emptyToNull(env.LEGAL_DNT_RESPONSE) ??
      "Honored where feasible; no advertising trackers in the launch design.",
  };
}

/** Returns agent details only when every required field is present. */
export function copyrightAgentFromEnv(
  env: Record<string, string | undefined> = {},
): CopyrightAgentConfig | null {
  const name = emptyToNull(env.COPYRIGHT_AGENT_NAME);
  const address = emptyToNull(env.COPYRIGHT_AGENT_ADDRESS);
  const phone = emptyToNull(env.COPYRIGHT_AGENT_PHONE);
  const email = emptyToNull(env.COPYRIGHT_AGENT_EMAIL);
  if (!name || !address || !phone || !email) return null;
  return { name, address, phone, email };
}

export function evaluateProductionReadiness(
  env: Record<string, string | undefined> = {},
): ProductionReadinessResult {
  const missing: string[] = [];
  for (const key of REQUIRED_FOR_PRODUCTION) {
    if (!emptyToNull(env[key])) missing.push(key);
  }
  const agent = copyrightAgentFromEnv(env);
  if (!agent) {
    missing.push(
      "COPYRIGHT_AGENT_NAME+ADDRESS+PHONE+EMAIL (or keep /copyright hidden; still required before claiming DMCA safe harbor)",
    );
  }
  return {
    ok: missing.length === 0,
    missing,
    copyrightRouteVisible: agent !== null,
    draftLegalPages: true,
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("your-") || trimmed === "REPLACE_ME") {
    return null;
  }
  return trimmed;
}
