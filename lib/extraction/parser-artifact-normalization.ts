import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import {
  comparableTokens,
  foldComparableText,
  PRICE_SIGNAL_PATTERN,
} from "@/lib/extraction/traveler-text";
import {
  isHeadingFragmentTitle,
  tripCityTokenSet,
} from "@/lib/extraction/entity-winner";

// Deterministic parser-artifact normalization (wave 2, live-run 7.18.0/7.18.1
// shapes; docs/assembly-defect-docket-2026-07-17-run3.md addendum and
// docs/assembly-defect-docket-2026-07-18-run4.md). The extraction model
// re-emits a small set of recognizable artifact families run over run:
// degenerate time pairs (Borkonyha 20:00-20:00), bare opening-hours endTimes
// (Mumok 19:00 with no startTime), provider text-bleed ("PM Delta",
// "Delta flight FR8331" on a Ryanair ticket page), day-title cards
// ("We Explore Budapest"), standalone cost-line cards ("Vienna lodging note /
// $72 (private room-ensuite)"), split "X or Y" disjunctions (Mumok +
// Natural History as two cards), and ticket-page re-emissions carrying
// booking codes as new dated activities.
//
// This stage repairs exactly those observed families, deterministically and
// silently (CEO decision 2026-07-17: hallucination suppression is silent),
// BEFORE canonical clustering. Demotions keep the observation in evidence
// lineage via evidenceRole context/accessory_detail — nothing is deleted.
// Per RW-QA-001 this is bounded deterministic repair of parser output, not an
// audit mutation; every repair is recorded for internal telemetry
// (RW-OPS-001). Stages without sourceText (the spine stage, synthetic
// fixtures) are never judged against source support, mirroring the
// source-truth verification posture in evidence clustering.

export type ParserArtifactRepair = {
  detail: string;
  kind:
    | "carrier_without_source_support"
    | "cost_line_card"
    | "day_title_card"
    | "degenerate_end_time"
    | "disjunction_split"
    | "heading_fragment_card"
    | "opening_hours_end_time"
    | "provider_text_bleed"
    | "ticket_page_activity";
  stageLabel: string;
  title: string;
};

export type ParserArtifactNormalizationResult = {
  repairs: ParserArtifactRepair[];
  stages: EvidenceStageInput[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Phase 1 (audit B5): the comparable fold and tokenizer now come from the
// shared text module \u2014 this file previously carried its own NFKD copies.
function foldText(value: string) {
  return foldComparableText(value);
}

function normalizeComparable(value: string) {
  return comparableTokens(value).join(" ");
}

function tokensOf(value: string) {
  return comparableTokens(value);
}

const DAY_HEADING_MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_HEADING_WEEKDAY =
  "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const DAY_HEADING_ORDINAL = "\\d{1,2}(?:st|nd|rd|th)?";
const DAY_HEADING_PATTERNS = [
  new RegExp(
    `^${DAY_HEADING_WEEKDAY},?\\s+${DAY_HEADING_MONTH}\\s+${DAY_HEADING_ORDINAL}\\b`,
    "i"
  ),
  new RegExp(
    `^day\\s+\\d+\\b.*\\b${DAY_HEADING_MONTH}\\s+${DAY_HEADING_ORDINAL}\\b`,
    "i"
  ),
  new RegExp(`^${DAY_HEADING_MONTH}\\s+${DAY_HEADING_ORDINAL}\\b`, "i"),
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
];

export function isDayHeadingLine(line: string) {
  // Bullet/list prefixes are stripped before matching (Phase 1, audit B5:
  // bullet-prefixed and starred day headings split chunking vs coverage vs
  // repair differently because only some detectors stripped them).
  const trimmed = line
    .replace(/\s+/g, " ")
    .replace(/^[-*•●▪◦>·]+\s*/, "")
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .trim();

  if (!trimmed || trimmed.length > 140) {
    return false;
  }

  return DAY_HEADING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// The non-date remainder of a day heading ("Wednesday, January 16th //
// Lesser Town & Prague Castle" -> "Lesser Town & Prague Castle"). A card
// whose title covers the WHOLE remainder is a day-title card; a card that
// merely names one venue from the remainder (bare "Prague Castle") is not.
function dayHeadingRemainder(line: string) {
  const trimmed = line.replace(/\s+/g, " ").trim();
  const separated = trimmed.split(/\s*(?:\/\/|—|–|::|:|-{2,})\s*/);

  if (separated.length >= 2 && isDayHeadingLine(separated[0])) {
    return separated.slice(1).join(" ").trim() || null;
  }

  const dateMatch = trimmed.match(
    new RegExp(
      `^(?:${DAY_HEADING_WEEKDAY},?\\s+)?${DAY_HEADING_MONTH}\\s+${DAY_HEADING_ORDINAL},?\\s*(?:\\d{4})?\\s*(.*)$`,
      "i"
    )
  );

  if (dateMatch && dateMatch[1]) {
    return dateMatch[1].replace(/^[\s:/-]+/, "").trim() || null;
  }

  return null;
}

function sourceLines(stage: EvidenceStageInput) {
  return (stage.sourceText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function activityText(activity: Record<string, unknown>) {
  return [stringValue(activity, "title"), stringValue(activity, "description")]
    .filter(Boolean)
    .join(" ");
}

// --- Rule 1: degenerate time pairs -----------------------------------------

function repairDegenerateTimes(
  activity: Record<string, unknown>,
  stageLabel: string,
  repairs: ParserArtifactRepair[]
) {
  const title = stringValue(activity, "title") ?? "(untitled)";
  const startTime = stringValue(activity, "startTime");
  const endTime = stringValue(activity, "endTime");

  if (startTime && endTime && normalizeComparable(startTime) === normalizeComparable(endTime)) {
    activity.endTime = null;
    repairs.push({
      detail: `endTime equal to startTime (${startTime}) cleared — a zero-length window is a parser artifact, not a plan.`,
      kind: "degenerate_end_time",
      stageLabel,
      title,
    });
    return;
  }

  const itemType = stringValue(activity, "itemType");
  const category = stringValue(activity, "category");

  // Bare endTimes are opening-hours contamination only for browse-a-place
  // sightseeing cards (Mumok 19:00, Natural History 08:30). An action card
  // with a real deadline ("return the car at 20:00", arrival_departure)
  // legitimately carries endTime without startTime.
  if (
    !startTime &&
    endTime &&
    (itemType === "activity" || itemType === "social") &&
    (category === "art_culture" || category === "tours_tickets")
  ) {
    activity.endTime = null;
    repairs.push({
      detail: `Bare endTime (${endTime}) with no startTime cleared — opening-hours contamination (live-run 7.18.0: Mumok 19:00, Natural History 08:30). Hours stay in the description.`,
      kind: "opening_hours_end_time",
      stageLabel,
      title,
    });
  }
}

// --- Rule 2: provider text-bleed and unsupported carrier labels -------------

const PROVIDER_BLEED_TOKEN = /^(?:am|pm|home|za|eat|some|depart(?:s|ure)?|arriv(?:es|al)?)$/i;
const CARRIER_TITLE_PATTERN =
  /^([A-Za-z][A-Za-z&]+)\s+(flight|train|bus|ferry)\b/i;

function repairTransportProvider(
  transport: Record<string, unknown>,
  stage: EvidenceStageInput,
  repairs: ParserArtifactRepair[]
) {
  const title = stringValue(transport, "title") ?? "(untitled)";
  const provider = stringValue(transport, "provider");
  const sourceCorpus = stage.sourceText ? foldText(stage.sourceText) : null;

  if (provider) {
    const originalTokens = provider.split(/\s+/).filter(Boolean);
    let tokens = originalTokens.filter(
      (token) => !PROVIDER_BLEED_TOKEN.test(token)
    );

    // Leading short-token shards ("Za Wizz Air", "D 143") evade the
    // vocabulary list AND the >=3-letter source-support gate — the source
    // text legitimately contains "'Za" (live-run 7.18.3 PB-5). A 1-2
    // letter leading token in front of a real carrier word is bleed.
    while (
      tokens.length > 1 &&
      tokens[0].replace(/[^A-Za-z]/g, "").length <= 2 &&
      tokens.slice(1).some((token) => token.replace(/[^A-Za-z]/g, "").length >= 3)
    ) {
      tokens = tokens.slice(1);
    }

    // A provider that is a bare transport-number shape ("D 143", "143") is
    // a number, never a carrier.
    if (tokens.length > 0 && /^[A-Za-z]{0,4}\s?\d{2,5}$/.test(tokens.join(" "))) {
      tokens = [];
    }

    if (tokens.length !== originalTokens.length) {
      repairs.push({
        detail: `Provider "${provider}" carried adjacent layout words or number shards — text-bleed family (live-runs 7.18.0/7.18.3: "PM Delta", "Home Delta", "Za Wizz Air", "D 143").`,
        kind: "provider_text_bleed",
        stageLabel: stage.label,
        title,
      });
    }

    if (sourceCorpus) {
      const unsupported = tokens.filter(
        (token) =>
          /^[a-z]{3,}$/i.test(token.replace(/[.,]/g, "")) &&
          !sourceCorpus.includes(foldText(token.replace(/[.,]/g, "")))
      );

      if (unsupported.length > 0) {
        tokens = tokens.filter((token) => !unsupported.includes(token));
        repairs.push({
          detail: `Provider token(s) ${unsupported.map((token) => `"${token}"`).join(", ")} do not appear in this chunk's source text and were scrubbed (source-truth posture, RW-EVD-001).`,
          kind: "carrier_without_source_support",
          stageLabel: stage.label,
          title,
        });
      }
    }

    transport.provider = tokens.length > 0 ? tokens.join(" ") : null;
  }

  if (!sourceCorpus) {
    return;
  }

  const carrierMatch = title.match(CARRIER_TITLE_PATTERN);

  if (
    carrierMatch &&
    !sourceCorpus.includes(foldText(carrierMatch[1]))
  ) {
    const stripped = title.slice(carrierMatch[1].length).trim();
    transport.title =
      stripped.charAt(0).toUpperCase() + stripped.slice(1);
    repairs.push({
      detail: `Title carrier "${carrierMatch[1]}" does not appear in this chunk's source text and was removed (live-run 7.18.1: Ryanair FR8331 mislabeled "Delta flight FR8331").`,
      kind: "carrier_without_source_support",
      stageLabel: stage.label,
      title,
    });
  }
}

// Shared with the audit's provider-field check (PB-5 audit gap: the 7.18.3
// audit read titles only and missed four corrupted provider FIELDS).
export function providerFieldLooksCorrupted(provider: string | null | undefined) {
  if (!provider) return false;
  const tokens = provider.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => PROVIDER_BLEED_TOKEN.test(token))) return true;
  if (/^[A-Za-z]{0,4}\s?\d{2,5}$/.test(provider.trim())) return true;
  if (
    tokens.length > 1 &&
    tokens[0].replace(/[^A-Za-z]/g, "").length <= 2 &&
    tokens.slice(1).some((token) => token.replace(/[^A-Za-z]/g, "").length >= 3)
  ) {
    return true;
  }
  return false;
}

// --- Rule 3: day-title cards ------------------------------------------------

function repairDayTitleCard(
  activity: Record<string, unknown>,
  headingRemainders: string[],
  tripCityNames: string[],
  stageLabel: string,
  repairs: ParserArtifactRepair[]
) {
  const itemType = stringValue(activity, "itemType");

  if (itemType === "note" || itemType === "placeholder") {
    return;
  }

  const title = stringValue(activity, "title");

  if (!title) {
    return;
  }

  const normalizedTitle = normalizeComparable(title);

  if (normalizedTitle.length < 6) {
    return;
  }

  // Heading-fragment demotion (run5 PB-3, shared predicate): a card whose
  // title is a day-arc phrase ("Explore Vienna", "We Explore Budapest") or
  // one verb+city segment of its OWN day heading is heading noise, never a
  // traveler card — even when it ships on a different day than its heading
  // (live run 7.18.2 shipped "Explore Vienna" on Jan 19). A venue named
  // inside a multi-part heading keeps its own content tokens and survives
  // ("Prague Castle" under "Lesser Town & Prague Castle").
  const cityTokens = tripCityTokenSet([
    ...tripCityNames,
    stringValue(activity, "city"),
  ]);
  const activityHeadingTexts = [
    ...headingRemainders,
    stringValue(activity, "sourceSectionLabel"),
    ...asArray(activity.sourceHeadingPath).filter(
      (value): value is string => typeof value === "string"
    ),
  ];

  if (isHeadingFragmentTitle(title, activityHeadingTexts, cityTokens)) {
    activity.evidenceRole = "context";
    repairs.push({
      detail: `Title "${title}" is a day-arc/heading fragment of its own day heading, not a traveler card (live-run 7.18.2: "Explore Vienna" from the Jan 18 heading shipped as a Jan 19 card). Demoted to context evidence.`,
      kind: "heading_fragment_card",
      stageLabel,
      title,
    });
    return;
  }

  const titleTokens = new Set(tokensOf(title));
  const slack = new Set(["a", "an", "and", "of", "the"]);

  for (const remainder of headingRemainders) {
    const remainderTokens = tokensOf(remainder);

    if (remainderTokens.length === 0) {
      continue;
    }

    const remainderSet = new Set(remainderTokens);
    const covered = remainderTokens.filter((token) => titleTokens.has(token));
    const titleExtras = [...titleTokens].filter(
      (token) => !remainderSet.has(token) && !slack.has(token)
    );
    const requiredCoverage =
      remainderTokens.length >= 4
        ? remainderTokens.length - 1
        : remainderTokens.length;

    // The card is a day-title card only when its title IS essentially the
    // heading remainder: the remainder is fully covered and the title adds
    // no content of its own. A card that merely contains one heading token
    // ("Vienna Card pickup" under "April 2 - Vienna") or names one venue
    // from a multi-part heading ("Prague Castle" under "Lesser Town &
    // Prague Castle") stays a real card.
    if (titleExtras.length === 0 && covered.length >= requiredCoverage) {
      activity.evidenceRole = "context";
      repairs.push({
        detail: `Title matches the day heading "${remainder}" — a day title is never an activity card (live-run 7.18.1: "We Explore Budapest"). Demoted to context evidence.`,
        kind: "day_title_card",
        stageLabel,
        title,
      });
      return;
    }
  }
}

// --- Rule 4: standalone cost-line cards -------------------------------------

// Phase 1 (audit B5): delegate to the shared price detector — the private
// copy here was missing the forint "Ft" and koruna "Kc" markers.
const COST_PATTERN = PRICE_SIGNAL_PATTERN;
const COST_VOCABULARY = new Set([
  "airbnb",
  "amount",
  "apartment",
  "bed",
  "booking",
  "budget",
  "cost",
  "costs",
  // Currency and payment tokens (live-run 7.18.3 smaller item: the
  // "Prague lodging cost note" escaped because a bare currency code
  // counted as distinctive venue content).
  "crowns",
  "czk",
  "deposit",
  "dorm",
  "double",
  "ensuite",
  "eur",
  "euro",
  "euros",
  "fee",
  "fees",
  "forint",
  "forints",
  "gbp",
  "hostel",
  "hotel",
  "huf",
  "koruna",
  "lodging",
  "night",
  "nights",
  "note",
  "notes",
  "paid",
  "per",
  "prepaid",
  "price",
  "private",
  "room",
  "single",
  "stay",
  "total",
  "usd",
  "via",
]);

function repairCostLineCard(
  activity: Record<string, unknown>,
  stageLabel: string,
  repairs: ParserArtifactRepair[]
) {
  const text = activityText(activity);

  if (!text || !COST_PATTERN.test(text)) {
    return;
  }

  const city = stringValue(activity, "city");
  const cityTokens = new Set(city ? tokensOf(city) : []);
  const distinctive = tokensOf(text).filter(
    (token) =>
      token.length >= 3 &&
      !/^\d+$/.test(token) &&
      !COST_VOCABULARY.has(token) &&
      !cityTokens.has(token)
  );

  if (distinctive.length > 0) {
    return;
  }

  const title = stringValue(activity, "title") ?? "(untitled)";

  activity.evidenceRole = "context";
  repairs.push({
    detail: `Card text is a lodging/price fragment with no venue content (live-run 7.18.1: "Vienna lodging note / $72 (private room-ensuite)"). Cost lines never ship as traveler cards.`,
    kind: "cost_line_card",
    stageLabel,
    title,
  });
}

// --- Rule 5: split "X or Y" disjunctions ------------------------------------

type DisjunctionSides = { left: string; right: string };

function disjunctionSidesFromLine(line: string): DisjunctionSides | null {
  const match = line.match(/^(.*?[a-z].*?)\s+or\s+(?:the\s+)?(.*?[a-z].*)$/i);

  if (!match) {
    return null;
  }

  const left = match[1].replace(/^.*?\bat\b/i, "").trim() || match[1].trim();
  const right = match[2].trim();

  if (tokensOf(left).length === 0 || tokensOf(right).length === 0) {
    return null;
  }

  return { left, right };
}

function sideMatchesTitle(side: string, title: string) {
  const normalizedSide = normalizeComparable(side);
  const normalizedTitle = normalizeComparable(title);

  if (normalizedTitle.length < 4) {
    return false;
  }

  return (
    normalizedSide.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedSide)
  );
}

function repairSplitDisjunctions(
  activities: Array<Record<string, unknown>>,
  stage: EvidenceStageInput,
  repairs: ParserArtifactRepair[]
) {
  const lines = sourceLines(stage);

  if (lines.length === 0) {
    return;
  }

  for (const line of lines) {
    const sides = disjunctionSidesFromLine(line);

    if (!sides) {
      continue;
    }

    const candidates = activities.filter((activity) => {
      const itemType = stringValue(activity, "itemType");
      return (
        (itemType === "activity" || itemType === "social" || !itemType) &&
        stringValue(activity, "evidenceRole") !== "context" &&
        Boolean(stringValue(activity, "title"))
      );
    });
    const leftCard = candidates.find((activity) =>
      sideMatchesTitle(sides.left, stringValue(activity, "title") ?? "")
    );
    const rightCard = candidates.find(
      (activity) =>
        activity !== leftCard &&
        sideMatchesTitle(sides.right, stringValue(activity, "title") ?? "")
    );

    if (!leftCard || !rightCard) {
      continue;
    }

    if (stringValue(leftCard, "date") !== stringValue(rightCard, "date")) {
      continue;
    }

    // If an or-carrying copy already exists for this pair, wave-1.1
    // alternative-slot collapse in assembly owns the fold — leave it alone.
    const orCopyExists = candidates.some((activity) => {
      const text = normalizeComparable(activityText(activity));
      return (
        / or /.test(` ${text} `) &&
        sideMatchesTitle(sides.left, text) &&
        sideMatchesTitle(sides.right, text)
      );
    });

    if (orCopyExists) {
      continue;
    }

    const leftTitle = stringValue(leftCard, "title") ?? sides.left;
    const rightTitle = stringValue(rightCard, "title") ?? sides.right;
    const rightDescription = stringValue(rightCard, "description");

    leftCard.title = `${leftTitle} or ${rightTitle}`;
    leftCard.description = [
      stringValue(leftCard, "description"),
      `Alternative option: ${rightTitle}${rightDescription ? ` — ${rightDescription}` : ""}.`,
    ]
      .filter(Boolean)
      .join(" ");
    rightCard.evidenceRole = "context";
    repairs.push({
      detail: `Source line "${line.slice(0, 100)}" offers one slot with alternatives; the split cards were folded into one "X or Y" card (RW-QUE-001 disjunction rule; live-run 7.18.0: Mumok + Natural History as two cards).`,
      kind: "disjunction_split",
      stageLabel: stage.label,
      title: leftCard.title as string,
    });
  }
}

// --- Rule 6: ticket-page re-emission ----------------------------------------

const TICKET_PAGE_SOURCE_PATTERN =
  /\b(?:ticketcode|e-?ticket|booking\s+(?:number|code|reference)|travel\s+code|reservation\s+(?:number|code)|tickets?\s+(?:number|no\.?|#))\b/i;
const TICKET_COPY_TEXT_PATTERN =
  /\b(?:ticketcode|booking\s+(?:number|code|reference)|travel\s+code|reservation\s+(?:number|code)|tickets?\s+(?:number|no\.?|#)\s*:?\s*\d{4,})\b/i;
const TRANSPORT_TITLE_PATTERN = /\b(?:flight|train|bus|ferry)\b/i;

// The ACTIVITY-shaped ticket-page family (live-run 7.18.3 PB-1(c): "Skip
// the Line ticket, 1 x 380.00 Kč, ticket number 19183727" shipped as a
// Jan 15 activity — the run5 docket marked this family "uncovered"). A card
// whose title is pure ticket vocabulary and whose text is quantity/price/
// ticket-number boilerplate is a ticket page re-emission, never a planned
// stop. A ticket-titled card naming a real venue ("Prague Castle ticket")
// keeps its distinctive tokens and stays untouched.
const TICKET_TITLE_VOCABULARY = new Set([
  "a", "admission", "adult", "child", "concession", "day", "e-ticket",
  "entry", "eticket", "fast", "line", "one", "pass", "priority", "senior",
  "skip", "skip-the-line", "student", "the", "ticket", "tickets", "track",
  "x",
]);
const TICKET_QUANTITY_PATTERN =
  /\b\d+\s*x\s*\d+(?:[.,]\d{2})?|\btickets?\s*(?:number|no\.?|#)\s*:?\s*\d{4,}/i;

function isTicketVocabularyTitle(title: string) {
  const tokens = title
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }
  return tokens.every(
    (token) => TICKET_TITLE_VOCABULARY.has(token) || /^\d+$/.test(token)
  );
}

function repairTicketPageActivity(
  activity: Record<string, unknown>,
  stage: EvidenceStageInput,
  repairs: ParserArtifactRepair[]
) {
  const title = stringValue(activity, "title");
  const text = activityText(activity);

  if (!title || !text) {
    return;
  }

  const sectionType = stringValue(activity, "sourceSectionType");
  const ticketPageSource = Boolean(
    stage.sourceText && TICKET_PAGE_SOURCE_PATTERN.test(stage.sourceText)
  );

  const transportTicketCopy =
    (sectionType === "booking_detail" || ticketPageSource) &&
    TRANSPORT_TITLE_PATTERN.test(title) &&
    TICKET_COPY_TEXT_PATTERN.test(text);

  // Activity-shaped branch: an all-ticket-vocabulary title plus explicit
  // quantity-x-price or ticket-number boilerplate is self-evident ticket
  // copy even without a booking_detail section tag.
  const activityTicketCopy =
    isTicketVocabularyTitle(title) &&
    (TICKET_QUANTITY_PATTERN.test(text) ||
      ((sectionType === "booking_detail" || ticketPageSource) &&
        TICKET_COPY_TEXT_PATTERN.test(text)));

  if (!transportTicketCopy && !activityTicketCopy) {
    return;
  }

  activity.evidenceRole = "accessory_detail";
  repairs.push({
    detail: transportTicketCopy
      ? `Transport-titled card carrying booking/ticket codes from a ticket page is booking evidence for the transport record, never a new dated activity (live-run 7.18.0: RegioJet and ÖBB tickets re-emitted as Jan 24 cards).`
      : `Ticket-vocabulary card carrying quantity/price/ticket-number boilerplate is a ticket-page re-emission, never a new dated activity (live-run 7.18.3 PB-1(c): "Skip the Line ticket, 1 x 380.00 Kč, ticket number 19183727" shipped as a Jan 15 activity).`,
    kind: "ticket_page_activity",
    stageLabel: stage.label,
    title,
  });
}

// --- Entry point ------------------------------------------------------------

export function normalizeParserStageArtifacts(
  stages: EvidenceStageInput[]
): ParserArtifactNormalizationResult {
  const repairs: ParserArtifactRepair[] = [];
  // Trip city names across ALL stages (spine places included) feed the
  // day-arc predicate: "Explore Vienna" is only heading noise because Vienna
  // is a trip city.
  const tripCityNames: string[] = [];
  for (const stageInput of stages) {
    const stage = asRecord(stageInput.stage);
    for (const place of asArray(stage.places)) {
      const record = asRecord(place);
      for (const key of ["city", "name", "title"]) {
        const value = stringValue(record, key);
        if (value) tripCityNames.push(value);
      }
    }
    for (const collection of [stage.activities, stage.stays]) {
      for (const item of asArray(collection)) {
        const value = stringValue(asRecord(item), "city");
        if (value) tripCityNames.push(value);
      }
    }
  }
  const nextStages = stages.map((stageInput) => {
    const stage = asRecord(stageInput.stage);
    const rawActivities = asArray(stage.activities);
    const rawTransport = asArray(stage.transport);

    if (rawActivities.length === 0 && rawTransport.length === 0) {
      return stageInput;
    }

    const cloneRecord = (item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? { ...(item as Record<string, unknown>) }
        : item;
    const activities = rawActivities.map(cloneRecord) as Array<
      Record<string, unknown>
    >;
    const transport = rawTransport.map(cloneRecord) as Array<
      Record<string, unknown>
    >;
    const headingRemainders = [
      stageInput.label,
      ...sourceLines(stageInput).filter(isDayHeadingLine),
    ]
      .map((line) => dayHeadingRemainder(line))
      .filter((value): value is string => Boolean(value));

    for (const activity of activities) {
      repairDegenerateTimes(activity, stageInput.label, repairs);
      repairDayTitleCard(
        activity,
        headingRemainders,
        tripCityNames,
        stageInput.label,
        repairs
      );
      repairCostLineCard(activity, stageInput.label, repairs);
      repairTicketPageActivity(activity, stageInput, repairs);
    }

    repairSplitDisjunctions(activities, stageInput, repairs);

    for (const item of transport) {
      repairTransportProvider(item, stageInput, repairs);
    }

    return {
      ...stageInput,
      stage: {
        ...stage,
        activities,
        transport,
      },
    };
  });

  return { repairs, stages: nextStages };
}
