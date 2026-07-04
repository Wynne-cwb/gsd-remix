/**
 * Tests for gsd-statusline.js display output.
 *
 * Covers:
 * - minimal statusline output shape
 * - context meter normalization
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const hookPath = path.join(__dirname, '..', 'hooks', 'gsd-statusline.js');

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function runStatusline(payload, env = process.env) {
  try {
    return execFileSync(process.execPath, [hookPath], {
      input: JSON.stringify(payload),
      env,
      encoding: 'utf8',
      timeout: 4000,
    });
  } catch (e) {
    return e.stdout || '';
  }
}

// ─── minimal output shape ───────────────────────────────────────────────────

describe('minimal statusline output', () => {
  test('renders model, directory, context, and rate limits without middle status slot', () => {
    const workspaceDir = path.join(os.tmpdir(), 'statusline-project');
    const stdout = runStatusline({
      model: { display_name: 'Claude Test' },
      workspace: { current_dir: workspaceDir },
      session_id: `test-minimal-${Date.now()}`,
      context_window: {
        remaining_percentage: 90,
        total_tokens: 1_000_000,
      },
      rate_limits: {
        five_hour: { used_percentage: 25, resets_at: 1893456000 },
        seven_day: { used_percentage: 60 },
      },
    });

    const clean = stripAnsi(stdout);
    assert.match(clean, /^Claude Test │ statusline-project/);
    assert.match(clean, /\d+%/);
    assert.match(clean, /5h:75%@/);
    assert.match(clean, /7d:40%/);
    assert.equal((clean.match(/│/g) || []).length, 1);
    assert.doesNotMatch(clean, /gsd-update|stale hooks|executing|planning|ph \d+\/\d+/);
  });
});

// ─── CLAUDE_CODE_AUTO_COMPACT_WINDOW context meter (#2219) ──────────────────

describe('context meter respects CLAUDE_CODE_AUTO_COMPACT_WINDOW (#2219)', () => {
  /**
   * Run the statusline hook with a synthetic context_window payload.
   * Returns { normalizedUsed, rawUsedPct } where:
   *   - normalizedUsed: the buffer-adjusted % shown in the statusline bar
   *     (parsed from the hook's stdout ANSI output, e.g. "60%")
   *   - rawUsedPct: the raw value written to the bridge file (100 - remaining,
   *     CC-consistent per #2451 fix)
   */
  function runHook(remainingPct, totalTokens, acwEnv) {
    const sessionId = `test-2219-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = JSON.stringify({
      model: { display_name: 'Claude' },
      workspace: { current_dir: os.tmpdir() },
      session_id: sessionId,
      context_window: {
        remaining_percentage: remainingPct,
        total_tokens: totalTokens,
      },
    });

    const env = { ...process.env };
    if (acwEnv != null) {
      env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(acwEnv);
    } else {
      delete env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    }

    let stdout = '';
    try {
      stdout = runStatusline(JSON.parse(payload), env);
    } catch (e) {
      stdout = e.stdout || '';
    }

    // Parse normalized used% from the statusline bar output (e.g. "60%")
    // Strip ANSI escape codes then extract the percentage digit(s) before "%"
    const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '');
    const match = clean.match(/(\d+)%/);
    const normalizedUsed = match ? parseInt(match[1], 10) : null;

    // Read raw used_pct from the bridge file (#2451: bridge stores raw CC value)
    const bridgePath = path.join(os.tmpdir(), `claude-ctx-${sessionId}.json`);
    let rawUsedPct = null;
    try {
      const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
      rawUsedPct = bridge.used_pct;
      fs.unlinkSync(bridgePath);
    } catch { /* bridge may not exist if hook exited early */ }

    return { normalizedUsed, rawUsedPct };
  }

  test('default buffer (no env var): 50% remaining → ~60% normalized bar display', () => {
    // Default 16.5% buffer: usableRemaining = (50 - 16.5) / (100 - 16.5) * 100 ≈ 40.12%
    // normalized used ≈ 100 - 40.12 = 59.88 → rounded 60 (shown in statusline bar)
    const { normalizedUsed } = runHook(50, 1_000_000, null);
    assert.strictEqual(normalizedUsed, 60);
  });

  test('CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000: 50% remaining → ~83% normalized bar display', () => {
    // With 1M total, 400k window → buffer = 40%. usableRemaining = (50 - 40) / (100 - 40) * 100 ≈ 16.67%
    // normalized used ≈ 100 - 16.67 = 83.33 → rounded 83 (shown in statusline bar)
    const { normalizedUsed } = runHook(50, 1_000_000, 400_000);
    assert.strictEqual(normalizedUsed, 83);
  });

  test('CLAUDE_CODE_AUTO_COMPACT_WINDOW=0 falls back to default buffer', () => {
    // Explicit "0" means unset — should behave like no env var (16.5% buffer)
    const { normalizedUsed } = runHook(50, 1_000_000, 0);
    assert.strictEqual(normalizedUsed, 60);
  });

  test('buffer capped at 100% when ACW exceeds total context', () => {
    // Pathological: ACW > totalCtx → buffer = 100%. With no usable range left,
    // usableRemaining = max(0, (50-100)/(100-100)*100) = max(0, -Inf) = 0,
    // so normalized used = 100 (context reported as completely full in bar).
    const { normalizedUsed } = runHook(50, 1_000_000, 2_000_000);
    assert.strictEqual(normalizedUsed, 100);
  });

  test('bridge used_pct is raw (CC-consistent) regardless of ACW setting (#2451)', () => {
    // Fix for #2451: bridge used_pct must be raw (100 - remaining), not normalized.
    // This ensures gsd-context-monitor warning messages match CC native /context.
    // The ACW normalization only affects the statusline bar display, not the bridge.
    const { rawUsedPct } = runHook(50, 1_000_000, 400_000);
    assert.strictEqual(rawUsedPct, 50,
      'bridge used_pct must be raw (100-50=50) regardless of CLAUDE_CODE_AUTO_COMPACT_WINDOW');
  });
});
