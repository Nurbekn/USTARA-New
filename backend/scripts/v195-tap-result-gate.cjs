'use strict';
// Validate a completed Node TAP report. This file never touches a DB or .env.
const REQUIRED = 'v14: independent PostgreSQL connections enforce customer + barber overlap and atomic modifications';
function validateTapReport(report) {
  if (typeof report !== 'string' || report.length > 4_000_000) throw new Error('v195: invalid or oversized TAP report');
  const lines = report.replace(/\r\n/g, '\n').split('\n');
  if (!lines.some(line => /^TAP version 13\s*$/.test(line))) throw new Error('v195: Node TAP header absent');
  const count = (name) => {
    const matches = lines.filter(line => new RegExp(`^# ${name} (\\d+)\\s*$`).test(line));
    if (matches.length !== 1) throw new Error(`v195: missing or repeated TAP ${name} summary`);
    return Number(matches[0].match(/\d+/)[0]);
  };
  const tests = count('tests');
  const pass = count('pass');
  const fail = count('fail');
  const cancelled = count('cancelled');
  const skipped = count('skipped');
  const todo = count('todo');
  const required = lines.filter(line => line === `ok 1 - ${REQUIRED}`);
  if (required.length !== 1 || tests < 2 || pass !== tests || fail || cancelled || skipped || todo) {
    throw new Error('v195: booking integration did not execute and pass every test');
  }
  // v199: verify the actual TAP body, not just its trailing counters.
  // A fabricated passing summary must never hide a failed or extra top-level test.
  if (lines.filter(line => line === 'TAP version 13').length !== 1 ||
      lines.filter(line => /^1\.\.1\s*$/.test(line)).length !== 1 ||
      lines.some(line => /^\s*not ok\s+\d+\b/.test(line)) ||
      lines.some(line => /^\s*ok\s+\d+\s+-.*#\s*(?:SKIP|TODO)\b/i.test(line))) {
    throw new Error('v199: malformed, failed or skipped TAP assertions');
  }
  const topLevel = lines.filter(line => /^ok \d+ - /.test(line));
  if (topLevel.length !== 1 || topLevel[0] !== `ok 1 - ${REQUIRED}` ||
      !lines.some(line => /^ +ok \d+ - /.test(line))) {
    throw new Error('v199: unexpected top-level suite or missing nested assertions');
  }
  // A TAP stream without an actual nested plan is not a completed subtest.
  // Node's TAP reporter emits these at an indentation level below the suite.
  if (!lines.some(line => /^ +1\.\.[1-9]\d*\s*$/.test(line))) {
    throw new Error('v199: nested test plan absent');
  }
  // v200: reconcile actual nested assertions against the nested plan and
  // the global summary. An attacker or truncated log cannot merely append
  // convincing trailing counters to a partial passing test stream.
  const nestedAssertions = lines.filter(line => /^    (?:ok|not ok) \d+ - /.test(line));
  const nestedPlans = lines.filter(line => /^    1\.\.\d+\s*$/.test(line));
  if (nestedPlans.length !== 1) throw new Error('v200: expected exactly one nested plan');
  const planned = Number(nestedPlans[0].trim().slice(3));
  if (!Number.isSafeInteger(planned) || planned < 1 ||
      nestedAssertions.length !== planned || tests !== planned + 1 ||
      nestedAssertions.some((line, index) => !line.startsWith(`    ok ${index + 1} - `))) {
    throw new Error('v200: nested assertion numbering, plan or global total mismatch');
  }
  // v201/v203: The real Node TAP reporter places an indented diagnostic
  // block AFTER the top-level assertion and BEFORE the final plan. Earlier
  // versions incorrectly required the assertion to immediately precede 1..1.
  const trimmed = lines.at(-1) === '' ? lines.slice(0, -1) : lines;
  if (trimmed[0] !== 'TAP version 13') throw new Error('v201: TAP header must start the report');
  const summaryNames = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const footerStart = trimmed.findIndex(line => /^# tests \d+\s*$/.test(line));
  if (footerStart < 0) throw new Error('v201: TAP footer absent');
  const footer = trimmed.slice(footerStart);
  if (footer.length !== 8 ||
      summaryNames.some((name, i) => !new RegExp(`^# ${name} \\d+\\s*$`).test(footer[i])) ||
      !/^# duration_ms (?:\d+(?:\.\d+)?)\s*$/.test(footer[7]) ||
      footerStart < 2 || trimmed[footerStart - 1] !== '1..1') {
    throw new Error('v201: TAP footer, suite boundaries or order invalid');
  }
  const suiteDoneIndex = trimmed.indexOf(`ok 1 - ${REQUIRED}`);
  const nestedPlanIndex = trimmed.findIndex(line => /^    1\.\.\d+\s*$/.test(line));
  if (suiteDoneIndex < 2 || nestedPlanIndex < 1 || nestedPlanIndex >= suiteDoneIndex) {
    throw new Error('v201: nested plan or top-level completion is misplaced');
  }
  // Accept only the real Node TAP diagnostic syntax, not arbitrary extra
  // control lines after an assertion. This is not an assertion substitute.
  function isDiagnosticBlock(block, spaces) {
    if (!block.length) return true; // Older minimal TAP test fixtures.
    const indent = ' '.repeat(spaces);
    if (block.length < 3 || block[0] !== `${indent}---` ||
        block.at(-1) !== `${indent}...`) return false;
    return block.slice(1, -1).every(line =>
      line.startsWith(indent) && line.length > spaces &&
      !/^\s*(?:ok\s|not ok\s|# Subtest:|1\.\.)/.test(line));
  }
  if (!isDiagnosticBlock(trimmed.slice(suiteDoneIndex + 1, footerStart - 1), 2)) {
    throw new Error('v203: invalid top-level TAP diagnostics');
  }
  // v202/v203: The integration test uses t.test(...) for each child, so Node
  // emits a `    # Subtest:` header BEFORE every nested assertion. Older hand-
  // written unit fixtures have no child headers. Support both, but never a
  // mixture or an unpaired/hidden subtest, and require one top-level suite.
  const suiteHeader = `# Subtest: ${REQUIRED}`;
  const suiteIndex = trimmed.indexOf(suiteHeader);
  if ((suiteIndex !== -1 && suiteIndex !== 1) ||
      trimmed.filter(line => line === suiteHeader).length > 1 ||
      count('suites') !== 0) {
    throw new Error('v202: unexpected top-level suite header or suite count');
  }
  const nestedHeaders = trimmed.filter(line => /^    # Subtest: /.test(line));
  const hasChildHeaders = nestedHeaders.length > 0;
  if (hasChildHeaders && (suiteIndex !== 1 || nestedHeaders.length !== planned)) {
    throw new Error('v202: partial or unexpected nested suite headers');
  }
  // Reject additional suite headings at any other indentation or location.
  if (trimmed.some((line, i) => /^\s*# Subtest: /.test(line) &&
      !(i === suiteIndex || /^    # Subtest: /.test(line) && i > suiteIndex && i < nestedPlanIndex))) {
    throw new Error('v202: out-of-bound suite header');
  }
  let cursor = suiteIndex === 1 ? 2 : 1;
  for (let i = 1; i <= planned; i++) {
    const assertion = trimmed[cursor + (hasChildHeaders ? 1 : 0)] || '';
    const prefix = `    ok ${i} - `;
    if (!assertion.startsWith(prefix)) throw new Error('v202: nested assertion sequence invalid');
    if (hasChildHeaders && trimmed[cursor] !== `    # Subtest: ${assertion.slice(prefix.length)}`) {
      throw new Error('v203: nested heading and assertion name disagree');
    }
    cursor += hasChildHeaders ? 2 : 1;
    if (trimmed[cursor] === '      ---') {
      const end = trimmed.indexOf('      ...', cursor + 1);
      if (end < 0 || !isDiagnosticBlock(trimmed.slice(cursor, end + 1), 6)) {
        throw new Error('v203: malformed nested TAP diagnostics');
      }
      cursor = end + 1;
    }
  }
  if (cursor !== nestedPlanIndex || nestedPlanIndex + 1 !== suiteDoneIndex) {
    throw new Error('v202: extra or relocated nested assertions or plans');
  }
  // Bailouts terminate TAP even if an appended footer pretends all passed.
  if (trimmed.some(line => /^\s*Bail out!/i.test(line))) {
    throw new Error('v203: TAP bailout is not a completed integration run');
  }
  return {tests, pass, skipped};
}
async function main() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 4_000_000) throw new Error('v195: TAP output exceeded safe limit');
    chunks.push(chunk);
    // Keep raw TAP private. It can contain SQL values, identifiers or secrets.
    // The strict v208 runner preserves only an in-memory TAP fingerprint.
  }
  const proof = validateTapReport(Buffer.concat(chunks).toString('utf8'));
  console.log(`v195 booking integration result gate PASS: ${proof.pass}/${proof.tests}, no skips`);
}
if (require.main === module) {
  main().catch(() => {
    console.error('v195 booking integration result gate FAILED (tests failed, skipped or TAP evidence incomplete)');
    process.exitCode = 1;
  });
}
module.exports = { validateTapReport, REQUIRED };
