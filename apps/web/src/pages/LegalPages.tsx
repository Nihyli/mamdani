import { Link } from "react-router-dom";
import { brand, disclaimer } from "../lib/brand";
import { Page } from "../components/Layout";

export function AboutPage() {
  return (
    <Page title={`About ${brand.name}`} narrow>
      <p className="mb-4 text-ink">
        {brand.name} is an unofficial map of public-space problems in New York
        City, and a record of what got fixed. {brand.tagline}
      </p>
      <p className="mb-4 text-sm text-muted">{disclaimer}</p>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-sm text-ink">
        <li>Publishing here does not submit a request to NYC 311.</li>
        <li>
          For immediate danger, call 911. This site is not monitored as an
          emergency service.
        </li>
        <li>
          Verified fixed means reviewers accepted evidence as of the displayed
          date — not a guarantee the repair will last, and not proof of who
          did the work.
        </li>
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to="/terms" className="text-cobalt underline-offset-2 hover:underline">
          Terms
        </Link>
        <Link to="/privacy" className="text-cobalt underline-offset-2 hover:underline">
          Privacy
        </Link>
      </p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms of Use" narrow>
      <DraftBanner />
      <p className="mb-4 text-sm text-muted">
        Effective date: [DATE]. Operator: [LEGAL OPERATOR NAME], [APPROPRIATE
        BUSINESS ADDRESS]. Contact: [SUPPORT EMAIL]. Service: {brand.name} at{" "}
        {brand.domain}.
      </p>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">The service</h2>
        <p>
          {brand.name} is an independent community service for reporting and
          reviewing public-space conditions in New York City. We are not
          affiliated with, authorized by, or endorsed by Zohran Mamdani, his
          office, the City of New York, TikTok, or any government agency.
          Publishing here does not file a government service request.
        </p>
        <p>
          This is not an emergency service. For immediate danger in the United
          States, call 911. Use official NYC 311 channels for ordinary
          government service requests.
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Accounts and agreement</h2>
        <p>
          You must be at least 18 to create an account or submit material.
          Selecting the agreement checkbox and creating an account signifies
          agreement to these Terms. Public reports can be browsed without an
          account.
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Your content and permission</h2>
        <p>
          You retain your rights in submitted material. You must own it or have
          adequate permission for its submission and our permitted use. A
          publicly viewable TikTok is not automatically licensed for
          downloading or rehosting.
        </p>
        <p>
          You grant [OPERATOR] a nonexclusive, worldwide, royalty-free license
          to store, process, resize, redact and display submitted material as
          needed to operate the service and provide report-specific sharing.
          This is not an ownership transfer.
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Accuracy and moderation</h2>
        <p>
          Human review does not guarantee accuracy, current conditions, or
          safety. “Verified fixed” means evidence was accepted as of the
          displayed date. Neither label is government certification.
        </p>
        <p>
          We may request clarification, redact, decline, hide, merge or remove
          material and restrict accounts. Appeals: [APPEAL FORM].
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">External services and removal</h2>
        <p>
          Third-party links and players have their own terms. Use [PRIVACY
          FORM] for data requests, [COPYRIGHT PAGE] for ownership claims and
          [SAFETY PAGE] for urgent harmful content.
        </p>
      </section>
      <p className="mb-4 text-sm text-muted">
        [COUNSEL TO COMPLETE: liability limitation and governing law/venue
        based on the real operator.]
      </p>
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
      <p className="mb-4 text-sm text-muted">
        Effective date [DATE]. Operator [LEGAL OPERATOR]. Contact [PRIVACY
        EMAIL]. This DRAFT describes proposed controls for {brand.name}; reconcile
        every statement with the deployed app and vendors before publishing.
      </p>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Data and purpose</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Email / login identifier / display name — accounts; only the chosen
            published display name is public.
          </li>
          <li>
            Text, links, photos/video and observation dates — review reports;
            approved portions may become public.
          </li>
          <li>
            Issue coordinates — locate infrastructure; reviewed locations can
            be public. Optional device location is never automatically public.
          </li>
          <li>
            Supports and preferences — save choices; aggregate counts only.
          </li>
          <li>
            IP, browser/device and security events — delivery and abuse
            prevention; private.
          </li>
        </ul>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Providers</h2>
        <p>
          We use [ACTUAL HOSTING/STORAGE/AUTH PROVIDERS] to operate the service
          and may use [ACTUAL AI/TRANSCRIPTION/LOCATION PROVIDERS] when analysis
          is enabled. Describe retention, training settings, regions and
          recipients: [PROVIDER DETAILS].
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Cookies and sharing</h2>
        <p>
          The proposed launch uses essential session/security storage and
          interface preferences. [DESCRIBE ACTUAL ANALYTICS; SAY NONE ONLY IF
          TRUE.] No targeted-advertising trackers or personal-data sales in the
          launch design. Do Not Track: [DNT RESPONSE].
        </p>
      </section>
      <section className="mb-6 space-y-2 text-sm text-ink">
        <h2 className="text-base font-semibold">Retention (proposed targets)</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Abandoned uploads — delete after 24 hours.</li>
          <li>
            Raw uploads — delete 7 days after terminal processing unless a
            documented exception applies.
          </li>
          <li>Normal security logs — 30 days.</li>
          <li>
            Approved evidence — while needed for report history, subject to
            rights requests.
          </li>
        </ul>
      </section>
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
      DRAFT — unpublished until bracketed operator fields are filled
    </div>
  );
}
