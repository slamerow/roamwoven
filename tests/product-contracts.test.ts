import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_PATH = path.join(process.cwd(), "docs", "product-contracts.md");
const CONTRACT_HEADING = /^## (RW-[A-Z]+-\d{3}) — .+$/gm;
const ALLOWED_STATUSES = new Set(["LOCKED", "OPEN", "SUPERSEDED"]);
const ALLOWED_ENFORCEMENT = new Set([
  "ENFORCED",
  "PARTIAL",
  "KNOWN_GAP",
  "NOT_APPLICABLE",
]);
// Every backticked `tests/...` path anywhere in an entry, not only the ones
// under `- Tests:`. Entries cite test files in their Evidence prose too
// ("Enforced by `tests/entity-winner.test.ts`"), and a citation to a file that
// does not exist is the same defect wherever it sits: the ledger claiming
// coverage that cannot be run. The scorecard's ledger-defect class, enforced
// here as a unit test.
const CITED_TEST_FILE = /`(tests\/[A-Za-z0-9._/-]+\.test\.(?:ts|mjs))`/g;

function contractSections(source: string) {
  const matches = [...source.matchAll(CONTRACT_HEADING)];

  return matches.map((match, index) => ({
    body: source.slice(
      match.index ?? 0,
      matches[index + 1]?.index ?? source.length
    ),
    id: match[1] ?? "",
  }));
}

function field(section: string, name: string) {
  return section.match(new RegExp("^- " + name + ": `([^`]+)`$", "m"))?.[1];
}

function citedTestFiles(section: string) {
  return [...section.matchAll(CITED_TEST_FILE)].map((match) => match[1] ?? "");
}

export default function run() {
  const source = fs.readFileSync(CONTRACT_PATH, "utf8");
  const sections = contractSections(source);
  const ids = sections.map((section) => section.id);

  assert.ok(sections.length >= 10, "expected the initial contract ledger");
  assert.equal(new Set(ids).size, ids.length, "contract IDs must be unique");

  for (const section of sections) {
    const status = field(section.body, "Status");
    const enforcement = field(section.body, "Enforcement");

    assert.ok(ALLOWED_STATUSES.has(status ?? ""), `${section.id} has a valid status`);
    assert.ok(
      ALLOWED_ENFORCEMENT.has(enforcement ?? ""),
      `${section.id} has a valid enforcement state`
    );
    assert.match(section.body, /^- Decision date: `\d{4}-\d{2}-\d{2}`$/m);
    assert.match(section.body, /^- Evidence: .+/m);
    assert.match(section.body, /^- Tests: `tests\//m);

    if (status === "OPEN") {
      assert.equal(enforcement, "NOT_APPLICABLE");
    } else {
      assert.notEqual(enforcement, "NOT_APPLICABLE");
    }

    // A contract entry may not cite coverage that does not exist. Before this
    // check the ledger could name a test file that had been renamed or never
    // written, and the entry still read as covered — the same "absent is not
    // zero" failure the dockets keep finding in telemetry, applied to the
    // ledger's own evidence.
    const cited = citedTestFiles(section.body);
    assert.ok(
      cited.length > 0,
      `${section.id} must cite at least one test file`
    );

    for (const testFile of new Set(cited)) {
      assert.ok(
        fs.existsSync(path.join(process.cwd(), testFile)),
        `${section.id} cites ${testFile}, which does not exist`
      );
    }
  }

  for (const required of [
    "RW-GOV-001",
    "RW-ORD-001",
    "RW-ING-001",
    "RW-ING-002",
    "RW-QA-001",
    "RW-CAN-001",
    "RW-SRC-001",
    "RW-GRP-001",
    "RW-ASM-001",
    "RW-CLS-001",
    "RW-EVD-001",
    "RW-PLC-001",
    "RW-REV-001",
    "RW-QUE-001",
    "RW-PRI-001",
    "RW-PUB-001",
    "RW-AUD-001",
    "RW-OPS-001",
  ]) {
    assert.ok(ids.includes(required), `missing required contract ${required}`);
  }
}
