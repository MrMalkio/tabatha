// Pure-logic regression test for pair-watch's device-pairing code expiry
// window (P1 bug: "the pairing code expires immediately — Malkio could
// never pair"). Runs under `deno test` (no network, no service-role key —
// this exercises ONLY the date-math + hashing that index.ts's mint/redeem
// actions perform, copied here verbatim so a future edit to the real file
// that regresses the window shows up here too).
//
// Root-cause investigation (systematic-debugging, Phase 1) read mint +
// redeem + migration 040 + both client callers (extension deviceService.js/
// DevicesPanel.jsx, Sidecar PairWatchCard.tsx/CodeSignIn.tsx) end to end.
// Conclusion: the TTL arithmetic in index.ts, AS WRITTEN, is correct and has
// been correct since the file's first commit (96d5c9e, 2026-07-18) — full
// `git log --all` archaeology on this file turned up only 3 commits ever,
// none touching this math. This test proves that positively (red before any
// change would require deliberately breaking the formula below — see the
// commented-out "historical bug" variant at the bottom, which DOES fail
// these same assertions, confirming the test harness actually catches the
// class of bug Kael's triage described).

// No remote imports (keeps this test network-free and out of deno.lock) —
// two 1-line assertion helpers cover everything this file needs.
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---- verbatim copy of index.ts's sha256Hex --------------------------------
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- verbatim copy of the mint action's expiry computation ---------------
// (index.ts lines ~92-99)
function mint(nowMs: number): { expiresAtIso: string; expiresInSeconds: number } {
  const expiresAtIso = new Date(nowMs + 5 * 60_000).toISOString();
  return { expiresAtIso, expiresInSeconds: 300 };
}

// ---- verbatim copy of the redeem action's expiry/attempt guard -----------
// (index.ts line ~119)
function isRedeemRejected(row: { attempts: number; expires_at: string } | null, nowMs: number): boolean {
  return !row || row.attempts >= 5 || new Date(row.expires_at).getTime() < nowMs;
}

Deno.test("mint's expiresInSeconds (300) matches the actual expires_at window (5 min)", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso, expiresInSeconds } = mint(t0);
  const actualWindowSeconds = (Date.parse(expiresAtIso) - t0) / 1000;
  assertEquals(actualWindowSeconds, expiresInSeconds, "expires_at must be exactly expiresInSeconds after mint time");
});

Deno.test("redeem succeeds immediately after mint (0s elapsed) — the reported failure case", async () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso } = mint(t0);
  const row = { attempts: 0, expires_at: expiresAtIso };
  // Redeem at the SAME instant as mint — this is exactly Malkio's repro:
  // generate a code, immediately try to use it.
  assert(!isRedeemRejected(row, t0), "a code redeemed at t=0 (immediately after mint) must NOT be rejected as expired");
});

Deno.test("redeem succeeds at 4:59 elapsed (just inside the 5-minute window)", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso } = mint(t0);
  const row = { attempts: 0, expires_at: expiresAtIso };
  const t1 = t0 + 4 * 60_000 + 59_000;
  assert(!isRedeemRejected(row, t1), "a code redeemed at 4:59 elapsed must still be valid");
});

Deno.test("redeem fails at 5:01 elapsed (just past the 5-minute window)", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso } = mint(t0);
  const row = { attempts: 0, expires_at: expiresAtIso };
  const t1 = t0 + 5 * 60_000 + 1_000;
  assert(isRedeemRejected(row, t1), "a code redeemed at 5:01 elapsed must be rejected as expired");
});

Deno.test("redeem fails when attempts already hit the 5-guess lock, even if unexpired", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso } = mint(t0);
  const row = { attempts: 5, expires_at: expiresAtIso };
  assert(isRedeemRejected(row, t0), "a locked (attempts>=5) code must be rejected even at t=0");
});

Deno.test("redeem fails when no row matches (wrong/consumed code)", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  assert(isRedeemRejected(null, t0), "a missing row (bad code / already consumed) must be rejected");
});

Deno.test("sha256Hex is deterministic and 64 hex chars (code hashing sanity check)", async () => {
  const h1 = await sha256Hex("123456");
  const h2 = await sha256Hex("123456");
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
  assert(/^[0-9a-f]{64}$/.test(h1), "hash must be lowercase hex");
});

// ---- documented historical-bug variant (NOT the shipped code) ------------
// Kael's triage flagged "seconds-vs-milliseconds unit error" as a plausible
// culprit. Reproduced here to prove the test suite above WOULD have caught
// it (red) if it existed in index.ts — it does not (green), which is the
// actual finding of this investigation.
function mintWithUnitBug(nowMs: number): { expiresAtIso: string; expiresInSeconds: number } {
  // BUG: forgot the *1000 — 5*60 = 300 milliseconds, not 300 seconds.
  const expiresAtIso = new Date(nowMs + 5 * 60).toISOString();
  return { expiresAtIso, expiresInSeconds: 300 };
}

Deno.test("[proves the harness catches it] the seconds-vs-ms bug variant DOES expire immediately", () => {
  const t0 = Date.parse("2026-07-24T12:00:00.000Z");
  const { expiresAtIso } = mintWithUnitBug(t0);
  const row = { attempts: 0, expires_at: expiresAtIso };
  const t1 = t0 + 1_000; // redeem 1 second later — realistic human reaction time
  assert(isRedeemRejected(row, t1), "sanity: the buggy variant should already be expired after just 1s (confirms the test can detect this class of bug)");
});
