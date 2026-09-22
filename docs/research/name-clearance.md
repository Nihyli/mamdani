# Name clearance research packet — “Mamdani, Fix This”

**Check date:** 2026-09-21 (lookups completed into 2026-09-22 UTC)  
**Product (per `docs/SPEC.md`):** Unofficial NYC community web app mapping public-space problems people want Zohran Mamdani (NYC mayor / public figure as of the Sept 2026 spec date) to fix.  
**Gate:** Spec §0 gate **G1**; branding / §§50–51 context also in §§23 and 28 (L1).  
**Purpose:** Factual inputs so counsel can perform a real clearance review.

> **This document is not a legal opinion, not legal advice, and not a go/no-go.** It does not conclude whether the proposed brand, domain, or product is lawful, registrable, or non-infringing. Counsel must independently verify every citation and status.

---

## 1. USPTO / federal trademark knockout search

### Access limitations (important)

| System | Result |
|---|---|
| Legacy **TESS** (`tess2.uspto.gov`) | Not used as a live interactive search endpoint in this packet (legacy TESS has been superseded; USPTO directs searchers to Trademark Search). |
| USPTO **Trademark Search** (`tmsearch.uspto.gov`) | Official search UI is a client-side app behind USPTO WAF/login flows. Automated fetch of search-result pages did **not** return usable hit lists in this research pass. |
| USPTO **TSDR** (`tsdr.uspto.gov`) | **Used successfully** for serial-number status pages (official status, owner, classes, live/dead). |
| USPTO **TSDR bulk/XML API** | Returned a registration/API-key notice; bulk download was **not** completed without a developer key. |
| Secondary sources | Web search + TrademarkElite / Markinton / Furm pages used to **discover candidate serials**, then confirmed against TSDR where possible. |

**Counsel should re-run an expert-mode clearance search on [USPTO Trademark Search](https://tmsearch.uspto.gov/) (and state / common-law sources) before relying on this knockout.**

**Search strings attempted (knockout / discovery):**  
`"Mamdani Fix This"`, `Mamdani Fix This`, `MAMDANI FIX THIS`, `"Fix This"`, `FIX THIS`, `FIXTHIS`, plus close civic variants (`JUSTFIX.NYC`, `IFIX NEW YORK`) and Mamdani-containing marks found via aggregator search.

### Marks recorded

#### A. Exact / near-exact product name

| Query | Finding | Sources |
|---|---|---|
| “Mamdani Fix This” / “Mamdani, Fix This” | **No USPTO application or registration identified** in discovery search (web + aggregator pages). | Web search; TrademarkElite detail pages for related marks; no TSDR serial located for this exact phrase. |
| “Mamdani” + “Fix” as a combined mark | No live combined mark matching the product name found. | Same |

*Absence of a discovery hit is not proof of absence. Counsel must confirm on Trademark Search.*

#### B. “FIX THIS” (exact standard-character mark) — **LIVE**

| Field | Value |
|---|---|
| Mark | **FIX THIS** |
| Serial | **88703093** |
| Registration | **6069455** |
| Owner | Amazon Technologies, Inc. (Seattle, WA) |
| Status | **LIVE / REGISTERED** (Principal Register) — TSDR: “LIVE/REGISTRATION/Issued and Active”; Registered 2020-06-02 |
| Classes / goods | **IC 009** — Downloadable podcasts in the fields of technology and societal change (**ACTIVE**) · **IC 041** — Entertainment services, namely, providing podcasts in the fields of technology and societal change (**ACTIVE**) |
| Official record | https://tsdr.uspto.gov/statusview/sn88703093 |
| Secondary | https://www.trademarkelite.com/trademark/trademark-detail/88703093/FIX-THIS |

**Packet note (factual, not a confusion analysis):** This is a **live** federal registration of the exact phrase “FIX THIS,” but in **podcast** goods/services. Overlap with a civic mapping web app is a counsel question (relatedness of goods/services, channels, strength, etc.), not answered here.

#### C. Other close / civic “fix” marks reviewed

| Mark | Serial / Reg | Owner | Classes (summary) | Status (TSDR or cited source) | URL |
|---|---|---|---|---|---|
| **JUSTFIX.NYC** | SN **87477348** / RN **5991536** | JustFix, Inc. (Brooklyn, NY) | IC 035 (association / tenant-housing advocacy); IC 045 (tenant/housing legal-info website) | **DEAD** — Registration cancelled Section 8 (status date **2026-08-28**) | https://tsdr.uspto.gov/statusview/sn87477348 |
| **M4M: MAGA FOR MAMDANI** | SN **99549171** | Horace GOROSITO (Whitestone, NY) | IC 025 — T-shirts | **DEAD** — Abandoned for failure to respond (abandoned ~2026-07-30; status 2026-08-14) | https://tsdr.uspto.gov/statusview/sn99549171 |
| **IFIX NEW YORK** | SN **85161892** / RN **4001620** | Avshalumov, Danil (per secondary sources) | IC 035 / 037 / 042 (computer/phone hardware repair retail, etc.) | **DEAD** — Cancelled Section 8 (2022-01-28) per secondary USPTO summary sites; **not re-verified live on TSDR in this pass** | https://furm.com/trademarks/ifix-new-york-85161892 · Markinton listing |

**Common-law / corporate uses (not federal registrations):** Business names such as “FIX THIS! MUSICAL INSTRUMENT REPAIR, INC.” appear in corporate directories; not treated as USPTO marks here.

### Trademark bottom line for counsel (factual)

- **Exact product string “Mamdani Fix This”:** no federal hit found in this knockout.  
- **Live federal mark sharing “FIX THIS” wording:** Amazon **Reg. 6069455** (podcasts).  
- **No live federal “Mamdani …” mark** was confirmed that matches the product name; one Mamdani-containing clothing application is **dead**.

---

## 2. Domain availability (no purchases made)

Method: registry WHOIS (`whois`) plus DNS `A`/`NS` where useful. Privacy-redacted WHOIS does not identify the registrant person/entity.

| Domain | Status | Evidence (2026-09-21/22) |
|---|---|---|
| **mamdanifixthis.com** | **Registered** | Created **2026-09-12**; Registrar **NameCheap, Inc.**; expiry **2027-09-12**; privacy redacted; Namecheap parking / auction lander (“has been recently registered with namecheap.com”). DNS A → `192.64.119.209`. |
| **fixthis.nyc** | **Registered** + **active site** | Created **2026-08-11**; Registrar **NameCheap, Inc.**; expiry **2027-08-11**; privacy redacted; site live: “Fixthis.nyc — tell the city what's broken” (public-space reporting product, not this repo’s brand). DNS points at Railway (`*.up.railway.app`). https://fixthis.nyc |
| **mamdanifixthis.nyc** | **Appears available** | `.nyc` WHOIS: **“No Data Found”**; no `A`/`NS` records. |
| **nycfixthis.com** | **Appears available** | Verisign: **“No match for domain”**; empty DNS. |
| **fixthisnyc.com** | **Appears available** | **“No match”**; empty DNS. |
| **mamdani-fixthis.com** | **Appears available** | **“No match”**; empty DNS. |
| **nycpublicfix.com** | **Appears available** | **“No match”**; empty DNS. |
| **fixthisnyc.org** | **Appears available** | PIR: **“Domain not found.”**; empty DNS. |
| **opennycfix.com** | **Appears available** | **“No match”**; empty DNS. |
| **nycfixmap.com** | **Appears available** | **“No match”**; empty DNS. |
| **publicfix.nyc** | **Appears available** | **“No Data Found”**; empty DNS. |
| **openfix.nyc** | **Appears available** | **“No Data Found”**; empty DNS. |
| **civicfix.nyc** | **Appears available** | **“No Data Found”**; empty DNS. |

**Primary-name domain takeaway:** The natural `.com` for the working title (**mamdanifixthis.com**) is **already registered** (parking page; registrant unknown). The short civic domain **fixthis.nyc** is **taken by an existing reporting product**.

---

## 3. Existing public uses of the phrase / trend

These are editorial / social uses of tagging Mamdani about repairs, “fix this,” or adjacent civic branding—not evidence of trademark ownership by this project.

| Use | What it is | URL |
|---|---|---|
| Viral TikTok → same-day pothole repair narrative | News coverage of @swiperdm tagging Mayor Mamdani about potholes; repair reportedly same day; widely copied framing | https://www.complex.com/pop-culture/a/treyalston/mamdani-pothole-tiktok-nyc-viral · https://www.themirror.com/news/nyc-teen-tagged-mamdani-tiktok-1970572 · https://www.ibtimes.co.uk/nyc-tiktok-pothole-repair-1813005 |
| Vox “pothole politics” | Describes TikTok complaints and viral asks including “Zohran, what are you gonna do to fix this?” | https://www.vox.com/future-perfect/500652/zohran-mamdani-pothole-politics |
| BuzzFeed roundup | Social posts tagging the mayor about fountains/potholes | https://www.buzzfeed.com/mjs538/zohran-speaking-chinese |
| UWS elevator TikTok → mayor’s office comment | Mom addresses Mayor Mamdani to “fix” MTA elevator; administration quoted | https://www.ilovetheupperwestside.com/upper-west-side-moms-viral-tiktok-plea-hits-15-million-views-and-the-mayors-office/ |
| Vital City “Just Fix It” | Editorial governance agenda aimed at the Mamdani administration (not this app) | https://www.vitalcitynyc.org/government-improvements-mamdani-can-tackle-in-the-first-100-days/ |
| ReviewMamdani.com | Separate “accountability dashboard” civic site using the mayor’s name in the domain/product | https://reviewmamdani.com/ |
| fixthis.nyc | Live independent “tell the city what's broken” reporting site on the short domain | https://fixthis.nyc |
| Exact product title as a shipped consumer app | **Not found** under “Mamdani, Fix This” / mamdanifixthis as an established app brand in this pass (beyond parking of mamdanifixthis.com) | — |

---

## 4. NY Civil Rights Law §§50–51 — high-level summary (not an opinion)

**Again: this is not a legal opinion on whether this app’s branding is permitted.**

### Statute text (primary links from SPEC §28 L1)

- **§50 — Right of privacy:** https://www.nysenate.gov/legislation/laws/CVR/50  
- **§51 — Action for injunction and for damages:** https://www.nysenate.gov/legislation/laws/CVR/51  
- Article index: https://www.nysenate.gov/legislation/laws/CVR/A5  
- Secondary reprint (FindLaw §50): https://codes.findlaw.com/ny/civil-rights-law/cvr-sect-50/

**High-level description (paraphrase of publicly available statutory text / case commentary):**

- **§50** makes it a **misdemeanor** to use a living person’s **name, portrait, picture, likeness, or voice** for **advertising** or **trade** purposes without prior **written consent** (parent/guardian if a minor).  
- **§51** provides a **civil** cause of action for **injunction** and **damages**, and may allow **exemplary damages** if the use was knowing.  
- New York’s privacy/publicity protection in this area is **statutory** (historically responding to *Roberson*); courts repeatedly describe the statute as covering **commercial appropriation** for advertising/trade, with a significant body of case law on what counts as **newsworthy / public-interest** use versus trade/advertising use.  
- Spec §23 already flags that **civic commentary vs. app branding**, merchandise, monetization, and implied endorsement need **context-specific counsel review**; an “unofficial” disclaimer is not treated here as a safe harbor.

### Well-known cases illustrating how name/likeness-for-trade is treated

| Case | Citation | Illustrative holding (high level) | Source |
|---|---|---|---|
| **Arrington v. New York Times Co.** | 55 N.Y.2d 433, 449 N.Y.S.2d 941, 434 N.E.2d 1319 (1982) | §§50–51 target advertising/trade use; use of a photo to illustrate a **newsworthy / public-interest** magazine article generally falls outside the statute’s advertising/trade prohibition when the image has a real relationship to the article (and is not an ad in disguise). Court also discusses limits of common-law/constitutional privacy theories in NY. | e.g. https://www.studicata.com/case-briefs/case/arrington-v-n-y-times-co · https://hallapproved.com/ny/cases/supreme/1982/5685425/ |
| **Stephano v. News Group Publications, Inc.** | 64 N.Y.2d 174, 485 N.Y.S.2d 220, 474 N.E.2d 580 (1984) | Fashion-news use of a model’s photo not “advertising/trade” merely because the magazine profits or lists stores/prices; newsworthiness exception applied; NY right of publicity claims of this type are **statutory**, not a separate common-law publicity tort. | e.g. https://casetext.com/case/stephano-v-news-group-pub · https://hallapproved.com/ny/cases/supreme/1984/5687623/ |
| **Messenger v. Gruner + Jahr Printing & Publishing** | 94 N.Y.2d 436, 727 N.E.2d 549 (2000) | Reaffirms narrow statutory privacy scheme and the **newsworthiness** framework (including discussion of *Arrington*); useful on how courts treat alleged “false” implications when an image illustrates editorial content. | e.g. https://hallapproved.com/ny/cases/supreme/2000/2098534/ |

**Questions reserved for counsel (examples only — not answered here):** whether product branding that incorporates a living public figure’s surname is “advertising” or “trade”; how disclaimers and lack of likeness imagery affect the analysis; interaction with First Amendment / public-figure commentary; and whether promotional OG cards, share cards, or future monetization change the analysis.

---

## 5. Neutral fallback brand proposals (SPEC §0)

Per gate G1 fail path: switch `BRAND_NAME`, domain, and OG assets; **describe the Mamdani repair trend editorially on About**; no redesign. Fallbacks below **omit the mayor’s name from the brand**.

| # | Proposed brand | Why it fits | Candidate domains that **appeared available** in WHOIS this check |
|---|---|---|---|
| 1 | **NYC Fix Map** | Neutral, describes map + repair focus; works with hook reframed as “Put it on the map.” | `nycfixmap.com`, `fixthisnyc.org` |
| 2 | **Public Fix NYC** | Civic / infrastructure tone; no personal name; About can explain the TikTok tagging trend. | `nycpublicfix.com`, `publicfix.nyc` |
| 3 | **Open Fix NYC** | Emphasizes unofficial community map / open reporting; distinct from official 311 and from `fixthis.nyc`. | `opennycfix.com`, `openfix.nyc` |

Reserve one fallback + matching domain **before** public promotion (SPEC §0 brand isolation). Re-check WHOIS immediately before any purchase; status can change hourly.

---

## 6. Source index & methods

| Topic | Primary sources |
|---|---|
| Spec gates / branding | `/Users/nihyli/MamdaniTicketer/docs/SPEC.md` §§0, 23, 28 |
| USPTO status | TSDR serial pages linked above; USPTO Trademark Search portal https://tmsearch.uspto.gov/ · https://www.uspto.gov/trademarks/search |
| Domains | Registry WHOIS; DNS; live site fetches for fixthis.nyc and mamdanifixthis.com parking page |
| Public uses | News URLs in §3 |
| §§50–51 | NY Senate statute URLs (L1) |

**Not done in this packet:** state trademark databases, full common-law / social-handle clearance, USPTO examiner-style coordinated-class search inside Trademark Search UI, purchase of any domain, or legal conclusions.

---

## 7. One-page facts for counsel intake

1. **Working title:** “Mamdani, Fix This” (uncleared).  
2. **Federal TM knockout:** No exact-match registration found; **live** Amazon **FIX THIS** Reg. **6069455** (podcasts).  
3. **Primary domains:** `mamdanifixthis.com` **registered** (parked); `fixthis.nyc` **registered** and operating a similar-category civic report site.  
4. **Public cultural use:** Strong 2026 TikTok/news “tag Mamdani / fix this” repair trend; separate sites already use Mamdani or “fix” civic framing.  
5. **§§50–51:** Living-person name/likeness for advertising/trade is the statutory focus; newsworthiness cases (*Arrington*, *Stephano*, *Messenger*) are starting points—**apply to this product only after counsel review**.  
6. **Fallback ideation ready:** NYC Fix Map / Public Fix NYC / Open Fix NYC with apparently free domains listed above.
