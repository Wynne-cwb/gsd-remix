/**
 * High-risk surface scanner for the size-axis router (`route.risk-scan`).
 *
 * Design: `.plans/gsd-final-form-design.md` → "高危扫描(单一 helper,R2 M2)".
 * ONE helper shared by router / fast / quick so the risk lexicon never drifts
 * across three call sites.
 *
 * Deterministic and cheap. Scans ONLY the user description + the candidate path
 * strings — never a full-repo grep, never a subagent, never semantic judgment.
 * It emits *evidence* (hits with a hard/soft/noise strength); the lane decision
 * belongs to the LLM judgment layer in `gsd-do` (R2 C1).
 *
 * Strength semantics (R2 H1):
 *   - hard  : the risky logic/data itself is being touched → gsd-do force-escalates.
 *   - soft  : proximity to a risky surface (adjacent/formatting) → noteworthy, not forced.
 *   - noise : a risky word in a non-risky context (docs/marketing/comment) → ignore for escalation.
 */

import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

export type RiskStrength = 'none' | 'noise' | 'soft' | 'hard';

export interface RiskHit {
  surface: string;
  strength: RiskStrength;
  term: string;
}

const STRENGTH_RANK: Record<RiskStrength, number> = { none: 0, noise: 1, soft: 2, hard: 3 };

/** Highest strength among hits (`none` when empty). */
export function dominantStrength(hits: RiskHit[]): RiskStrength {
  return hits.reduce<RiskStrength>(
    (max, h) => (STRENGTH_RANK[h.strength] > STRENGTH_RANK[max] ? h.strength : max),
    'none',
  );
}

interface SurfaceRule {
  /** Canonical high-risk surface name (matches design list). */
  name: string;
  /** Description patterns that indicate the risky logic/data is touched. */
  hard: RegExp[];
  /** Description patterns for adjacent/proximity concerns (formatting, naming). */
  soft: RegExp[];
  /** Candidate-path patterns that force `hard` regardless of wording. */
  hardPaths: RegExp[];
  /**
   * When set, the surface only fires if a hardPath matched OR one of these
   * context words is present — guards broad nouns (e.g. "column"/"table") that
   * are innocuous outside a DB context.
   */
  requiresContext?: RegExp[];
}

// Lexicon initial set — seeded from the design's high-risk surface list.
// Widen deliberately (edit this + the acceptance matrix together), never ad hoc.
const LEXICON: SurfaceRule[] = [
  {
    name: 'auth/session/token',
    hard: [
      /\bjwt\b/, /\boauth\b/, /\bsso\b/, /\bsessions?\b/, /\blogin\b/,
      /\b(stay |keep .*)?logged[- ]in\b/, /\bsign(ed|ing)?[- ]in\b/,
      /\bpassword\b/, /\bcredential/, /\bauthenticat/, /\baccess token\b/,
      /\brefresh token\b/, /\bauth token\b/, /\btokens?\b/,
    ],
    soft: [/\bauthoriz/],
    hardPaths: [/(^|\/)(auth|session|sessions|login|oauth)(\/|\.|$)/i],
  },
  {
    name: 'payment/billing',
    hard: [/\bstripe\b/, /\bpayments?\b/, /\bbilling\b/, /\bcharges?\b/, /\brefunds?\b/, /\binvoices?\b/, /\bsubscription/],
    soft: [/\bcheckout\b/, /\bcart\b/, /\bpricing?\b/],
    hardPaths: [/(^|\/)(payments?|billing)(\/|\.|$)/i],
  },
  {
    name: 'migration/schema',
    hard: [/\bbackfill\b/, /\b(add|drop|rename|alter|remove)\b[^.]*\b(column|table|index|constraint)\b/, /\bschema\b/, /\bcolumns?\b/, /\btables?\b/],
    soft: [],
    hardPaths: [/(^|\/)migrations?(\/|$)/i],
    requiresContext: [/(^|\/)migrations?(\/|$)/i, /\b(schema|migration|backfill|sql|postgres|mysql|sqlite|database|db)\b/i],
  },
  {
    name: 'public API',
    hard: [/\bpublic api\b/, /\/v\d+\//, /\bapi (contract|endpoint|response shape)\b/],
    soft: [/\bendpoint\b/],
    hardPaths: [],
  },
  {
    name: 'webhook',
    hard: [/\bwebhooks?\b/],
    soft: [],
    hardPaths: [/(^|\/)webhooks?(\/|\.|$)/i],
  },
  {
    name: 'tenant/org boundary',
    hard: [/\borg_id\b/, /\btenants?\b/, /\bmulti-?tenant/, /\bper-tenant\b/, /\borganization boundary\b/, /\bworkspace isolation\b/],
    soft: [],
    hardPaths: [],
  },
  {
    name: 'PII/logging',
    // Sensitive data + a logging verb in EITHER order ("log the request body" and
    // "add request body logging"); also matches `logger`.
    hard: [
      /\blog(ging|ged|s|ger)?\b[^.]*\b(request|body|payload|pii|personal|email|ssn|credit ?card|password|token)\b/,
      /\b(request|body|payload|pii|personal|email|ssn|credit ?card|password|token)\b[^.]*\blog(ging|ged|s|ger)?\b/,
      /\b(pii|personally identifiable)\b/,
    ],
    soft: [],
    hardPaths: [],
  },
  {
    name: 'CORS/cookie/redirect',
    hard: [/\bcookies?\b/, /\bsame-?site\b/, /\bcors\b/, /\bset-cookie\b/, /\bredirect uri\b/, /\bopen redirect\b/],
    soft: [],
    hardPaths: [/(^|\/)cookies?(\/|\.|$)/i],
  },
  {
    name: 'unsafe HTML',
    hard: [/\bdangerouslysetinnerhtml\b/i, /\binnerhtml\b/i, /\bv-html\b/, /\bsanitiz/, /\bxss\b/i],
    soft: [],
    hardPaths: [],
  },
  {
    name: 'BFF outbound',
    hard: [/\bbff\b/i, /\boutbound (request|call|fetch)\b/, /\bserver-side (fetch|request)\b/, /\bproxy(ing)? (request|to|the)\b/],
    soft: [],
    hardPaths: [],
  },
];

// A risky word sitting in a non-risky context downgrades to noise (R2 H1).
const NOISE_SIGNALS = /\b(typo|readme|changelog|marketing|documentation|docs?|wording|reword|comment|copy|spelling|grammar)\b/i;
const DOC_PATH = /\.(md|mdx|txt|rst)$|(^|\/)docs?\//i;
// Words that signal a real code/structure change (not pure copy). If any of these
// appear, a docs/comment word must NOT downgrade the hit even without candidate paths.
const CODE_SIGNAL = /\b(logic|handler|middleware|endpoint|function|module|component|service|schema|migration|validate|validation|sanitiz|parse|serialize|serialise|implement|wire|enforce|refactor|filter|store|hook|guard|interceptor|resolver|controller|integrat)\b/i;

// Noise downgrade requires *positive evidence the change is docs-only*. A stray
// "docs"/"README"/"comment" word must NOT downgrade a real code change — that would
// let a mixed "update the docs and change token validation" task slip past the
// Escalation 铁律 (R2 H1, hardened twice after review). Rule:
//   - any non-docs (code) candidate path present  → NOT noise (real code is touched)
//   - candidate paths present and ALL docs         → noise
//   - no candidate paths: noise ONLY when the wording is clearly copy-only —
//     a docs signal AND no code/structure signal ("fix a typo in the billing copy"
//     is noise; "change token validation logic" with no path stays hard)
function isNoiseContext(text: string, paths: string[]): boolean {
  if (paths.length > 0) {
    const codePaths = paths.filter(p => !DOC_PATH.test(p));
    return codePaths.length === 0;
  }
  return NOISE_SIGNALS.test(text) && !CODE_SIGNAL.test(text);
}

function firstMatch(patterns: RegExp[], text: string): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}

/**
 * Core risk scan — pure, deterministic. Shared by the CLI handler,
 * `route.size-classify`, and the fast/quick preflight.
 */
export function scanRisk(description: string, candidatePaths: string[]): RiskHit[] {
  const text = ` ${description.toLowerCase()} `;
  const paths = candidatePaths.filter(Boolean);
  const noise = isNoiseContext(text, paths);
  const hits: RiskHit[] = [];

  for (const rule of LEXICON) {
    const pathHard = rule.hardPaths.some(pp => paths.some(path => pp.test(path)));
    const hardTerm = firstMatch(rule.hard, text);
    const softTerm = firstMatch(rule.soft, text);

    // Base match?
    if (!pathHard && !hardTerm && !softTerm) continue;

    // Context gate for broad-noun surfaces (e.g. migration "column"/"table").
    if (rule.requiresContext && !pathHard) {
      const ctxOk = rule.requiresContext.some(rx => rx.test(text) || paths.some(p => rx.test(p)));
      if (!ctxOk) continue;
    }

    const term = pathHard
      ? (paths.find(path => rule.hardPaths.some(pp => pp.test(path))) as string)
      : (hardTerm ?? softTerm ?? '').trim();

    let strength: RiskStrength;
    if (pathHard) {
      strength = 'hard';
    } else if (noise) {
      // risky word but non-risky context, and the sensitive path is NOT touched
      strength = 'noise';
    } else if (hardTerm) {
      strength = 'hard';
    } else {
      strength = 'soft';
    }

    hits.push({ surface: rule.name, strength, term });
  }

  return hits;
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

/** Parse `<description...> [--paths a,b,c]` into `{ description, paths }`. */
export function parseRiskArgs(args: string[]): { description: string; paths: string[] } {
  const descParts: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--paths' || a === '--files') {
      const val = args[++i] ?? '';
      paths.push(...val.split(',').map(s => s.trim()).filter(Boolean));
    } else if (a.startsWith('--paths=') || a.startsWith('--files=')) {
      const val = a.slice(a.indexOf('=') + 1);
      paths.push(...val.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      descParts.push(a);
    }
  }
  return { description: descParts.join(' '), paths };
}

export const routeRiskScan: QueryHandler = async (args, _projectDir) => {
  const { description, paths } = parseRiskArgs(args);
  if (!description && paths.length === 0) {
    throw new GSDError(
      'route.risk-scan requires a description and/or --paths',
      ErrorClassification.Validation,
    );
  }
  const hits = scanRisk(description, paths);
  return {
    data: {
      hits,
      max_strength: dominantStrength(hits),
      candidate_paths: paths,
      description,
    },
  };
};
