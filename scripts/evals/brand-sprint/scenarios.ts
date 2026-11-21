// The brand-sprint eval's scenarios. The first runs CMO Kit's whole sprint and checks what gets
// saved; the others plant one test answer each and stop soon after it, to keep them cheap.

export type CheckName =
  | 'saves-after-written-yes'
  | 'saves-only-what-was-said'
  | 'closes-each-exercise'
  | 'leaves-other-sections'
  | 'pushes-back-on-generic-value'
  | 'names-the-contradiction'
  | 'asks-the-team-for-its-decider'
  | 'gathers-options-before-narrowing'
  | 'takes-a-spoken-note';

export interface Scenario {
  name: string;
  summary: string;
  /** Extra instructions for the founder model, on top of its standing rules. */
  founder: string;
  /** Run until the result is saved, or until Claude has replied this many times after the founder says a given line. */
  until: { saved: true } | { line: string; replies: number };
  /** Claude's replies before the run gives up. */
  maxTurns: number;
  checks: CheckName[];
}

/** How every run opens. A harness line: it says nothing about the brand. */
export const OPENING = "Let's run a brand sprint for CMO Kit.";

const SOLO = 'You are doing the sprint on your own, self-guided: when asked who is in it, use the solo line.';

export const SCENARIOS: Scenario[] = [
  {
    name: 'cmo-kit-sprint',
    summary: "CMO Kit's whole sprint, self-guided, through to the save",
    founder: SOLO,
    until: { saved: true },
    maxTurns: 60,
    checks: ['saves-after-written-yes', 'saves-only-what-was-said', 'gathers-options-before-narrowing', 'closes-each-exercise', 'leaves-other-sections'],
  },
  {
    name: 'spoken-note',
    summary: "Geoff's spoken why, in his own approved words, is taken as his note",
    founder: `${SOLO} The first time Claude asks why CMO Kit exists, why it matters, or for your own answers before discussing them, answer by speaking: dont-like, filming, busywork-kept and actually-film together, in that order.`,
    until: { line: 'actually-film', replies: 1 },
    maxTurns: 15,
    checks: ['takes-a-spoken-note'],
  },
  {
    name: 'generic-values',
    summary: 'A planted generic list of values gets pushback',
    founder: `${SOLO} The first time Claude asks for values or candidate values, reply with planted-generic-values alone.`,
    until: { line: 'planted-generic-values', replies: 1 },
    maxTurns: 25,
    checks: ['pushes-back-on-generic-value'],
  },
  {
    name: 'contradiction',
    summary: 'A planted audience answer that contradicts a value is named',
    founder: `${SOLO} Give your real values, including value-accountable, when asked. The first time Claude asks about audiences or what they need to believe, reply with planted-auto-post alone.`,
    until: { line: 'planted-auto-post', replies: 2 },
    maxTurns: 35,
    checks: ['names-the-contradiction'],
  },
  {
    name: 'team-decider',
    summary: 'A planted founding team is asked for its decider',
    founder: 'In your first reply, answer with one-liner, now and planted-team. Never name a decider.',
    until: { line: 'planted-team', replies: 1 },
    maxTurns: 5,
    checks: ['asks-the-team-for-its-decider'],
  },
];
