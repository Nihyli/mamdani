import { Link } from "react-router-dom";
import { brand, disclaimer } from "../lib/brand";
import { Page } from "../components/Layout";

export function TermsPage() {
  return (
    <Page title="Terms of Use" narrow>
      <DraftBanner />
      <p className="mb-4 text-muted">
        This is a short DRAFT placeholder for {brand.name}. Full Terms copy
        remains unpublished until operator fields (legal entity, contact,
        jurisdiction) are filled and reviewed. Do not treat this page as binding.
      </p>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-sm">
        <li>You must be 18+ to create an account or submit material.</li>
        <li>
          Publishing here does not file a NYC 311 request or guarantee official
          action.
        </li>
        <li>
          You must have rights to upload evidence; a public TikTok is not an
          automatic license to rehost media.
        </li>
      </ul>
      <p className="text-sm text-muted">{disclaimer}</p>
      <p className="mt-4">
        <Link to="/privacy" className="text-cobalt underline-offset-2 hover:underline">
          Privacy Notice
        </Link>
      </p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Notice" narrow>
      <DraftBanner />
      <p className="mb-4 text-muted">
        This is a short DRAFT placeholder for {brand.name}. Detailed data
        inventory, vendor disclosures, and retention tables stay unpublished
        until operator fields are filled to match the deployed app.
      </p>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-sm">
        <li>Account email is used for sign-in; it is not published on reports.</li>
        <li>
          Approved locations, evidence, and source links can become public after
          review.
        </li>
        <li>
          External players (e.g. TikTok) are click-to-load and may receive your IP
          when you choose to load them.
        </li>
      </ul>
      <p className="text-sm text-muted">{disclaimer}</p>
      <p className="mt-4">
        <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
          Terms of Use
        </Link>
      </p>
    </Page>
  );
}

function DraftBanner() {
  return (
    <div
      role="status"
      className="mb-4 rounded-md border border-orange/50 bg-orange/10 px-3 py-2 text-sm font-semibold text-orange"
    >
      DRAFT — unpublished until operator fields are filled
    </div>
  );
}
