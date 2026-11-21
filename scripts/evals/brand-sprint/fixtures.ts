// The founder's side of the brand-sprint evals: CMO Kit's own brand sprint, with Geoff as the
// founder. Every line Geoff "says" is copied word for word from CMO Kit's brand context, version 5
// (2026-11-21), which holds what its sprint saved so far, the roadmap included, and the lines Geoff
// approved as his own voice. Nothing here is written for him. A test checks that every line marked
// `real` still appears in SAVED, so an edit cannot slip a made-up quote in.
//
// Where CMO Kit's sprint has no real answer for an exercise, the exercise is listed in PENDING and
// the founder skips it, so the skill is tested on leaving it empty. When those answers are saved,
// add them to SAVED and to LINES, and take the exercise out of PENDING.
//
// Lines marked `planted` are not Geoff's. They are test variants, written to see whether the skill
// pushes back on a generic value, names a contradiction and asks a team for its decider. Lines
// marked `harness` only move the conversation along (confirming, skipping), and say nothing about
// the brand.

/** CMO Kit's saved brand context, verbatim: the sections the sprint fills, and the approved-lines part of examples. */
export const SAVED = {
  positioning: `CMO Kit is a marketing loop that runs in one conversation with Claude, for people who create content for a living.

**What:** it plans posts and ads backwards from what you sell, gives each one a tracked link, runs landing page experiments, measures conversions on the third-party pages where people buy (like a Luma event page or a product page), analyzes results and recommends improvements each week.

**How:** it learns from your results and keeps improving what it knows about your business. It shows its work, so every recommendation traces back to your own results. That context is fully exportable, so there's no vendor lock-in and switching agents doesn't mean starting over. It's open source, so you can self-host, and it connects to the tools you already use.

**Why:** AI lets anyone make and optimize endless content, your competitors included, so what stands out is what AI can't commoditize: your humanity. CMO Kit takes care of the busywork, so your time and attention can go to strategy and creative expression. CMO Kit is a test of the Kindness Flywheel hypothesis.

**20-year roadmap (directional, not a plan):**
- 5 years: the marketing partner for creators, owner-run shops and startup teams.
- 10 years: trusted by growing companies.
- 15 years: trusted by large enterprises.
- 20 years: ubiquitous, the agent humans and agents alike go to to grow through kindness, not growth at all costs.

**Now:** private beta. The goal is waitlist signups at cmokit.ai.

**Site lines:** "Take control of your content strategy." "Less busywork. More room to create."`,
  audiences: `1. **Primary: independent spiritual practitioners and life coaches** who sell paid experiences (circles, sessions, events, retreats), found mostly through Instagram. They need to believe CMO Kit fills the room with content that looks and sounds like them, with no hype, and protects clients who appear in their footage. Conversion: a paid seat or a booking.
2. **Secondary: influencers with personal brands** who use content for affiliate sales and paid sponsorships. They need to believe CMO Kit shows which posts earn commission and gives sponsors real numbers, without making them sound like an ad. Conversion: an affiliate sale, plus reach and clicks for sponsors.
3. **Third: technical founders who self-host** from the open source repo. They need to believe the code is open, nothing is hosted-only, and they can leave with their data.

In copy, address "people who create content for a living", not "practitioners".`,
  values: `- **Yours to keep:** you can leave with everything, any time, with no vendor relationship needed. Your brand strategy and what CMO Kit learns are portable, exportable and self-hostable.
- **Care over code:** the value of the code is zero. The name and the trust behind it are the asset, so CMO Kit competes on the humanity AI can't copy, not on volume.
- **Open by default:** open source, and anyone can work on it. The hosted version includes no AI inference.
- **Someone accountable:** a person stays accountable for what goes out. Nothing posts, sends or spends without your yes, and CMO Kit never invents a quote, result or deadline.`,
  voice: `**Personality (1 to 10):** Friend 2 (Authority 10); Mass appeal 3 (Elite 10); Young 1 to Mature 10: 6; Playful 1 to Serious 10: 7; Hype 1 to Proof 10: 9.

**We are:** warm, grounded and plain-spoken, a trusted peer, never an authority telling them what to do. Honest about what isn't proven yet, careful with clients' privacy, and we show the numbers. We say plainly what the product does.

**We are not:** marketing bro. No funnel, scale, growth hack or conversion talk in customer copy, no hype, no fake urgency or scarcity, no vague or cute phrasing, and no copy that sounds like AI.

**Words to avoid:** "your people", "practitioners" in copy.

**For influencers:** the same voice; only the goal words change (earnings and sponsors instead of seats).`,
  examples: `Approved lines in Geoff's own voice (Nov 15):
- "I don't like making content."
- "Especially everything around the filming."
- "It makes the busywork easy enough that I actually film."
- "For me, the busywork is what kept the filming from happening."`,
} as const;

export type Source = keyof typeof SAVED;
export type Kind = 'real' | 'planted' | 'harness';
export type Mode = 'spoken' | 'typed';

export interface Line {
  id: string;
  /** What the founder says. A real line is a passage of SAVED[from], markdown bold removed. */
  text: string;
  kind: Kind;
  /** Spoken lines are Geoff's approved lines in his own voice; the saved sections were written. */
  mode: Mode;
  from?: Source;
  /** What the line answers, so the founder model can pick it. */
  answers: string;
}

const real = (id: string, from: Source, mode: Mode, answers: string, text: string): Line => ({ id, text, kind: 'real', mode, from, answers });
const planted = (id: string, mode: Mode, answers: string, text: string): Line => ({ id, text, kind: 'planted', mode, answers });
const harness = (id: string, answers: string, text: string): Line => ({ id, text, kind: 'harness', mode: 'typed', answers });

export const LINES: Line[] = [
  real('one-liner', 'positioning', 'typed', 'what the brand is, in a line',
    'CMO Kit is a marketing loop that runs in one conversation with Claude, for people who create content for a living.'),
  real('now', 'positioning', 'typed', 'what prompted the sprint, where the brand is now',
    'Now: private beta. The goal is waitlist signups at cmokit.ai.'),
  real('what', 'positioning', 'typed', 'what it makes or does',
    'What: it plans posts and ads backwards from what you sell, gives each one a tracked link, runs landing page experiments, measures conversions on the third-party pages where people buy (like a Luma event page or a product page), analyzes results and recommends improvements each week.'),
  real('how', 'positioning', 'typed', 'how it does it differently',
    "How: it learns from your results and keeps improving what it knows about your business. It shows its work, so every recommendation traces back to your own results. That context is fully exportable, so there's no vendor lock-in and switching agents doesn't mean starting over. It's open source, so you can self-host, and it connects to the tools you already use."),
  real('why-humanity', 'positioning', 'typed', 'why it exists',
    "Why: AI lets anyone make and optimize endless content, your competitors included, so what stands out is what AI can't commoditize: your humanity."),
  real('why-busywork', 'positioning', 'typed', 'why it exists, what it frees people for',
    'CMO Kit takes care of the busywork, so your time and attention can go to strategy and creative expression.'),
  real('why-flywheel', 'positioning', 'typed', 'why it exists, the deeper reason',
    'CMO Kit is a test of the Kindness Flywheel hypothesis.'),
  real('site-lines', 'positioning', 'typed', 'how the brand says it on its site',
    'Site lines: "Take control of your content strategy." "Less busywork. More room to create."'),

  real('roadmap-framing', 'positioning', 'typed', 'how firm the 20-year roadmap is',
    '20-year roadmap (directional, not a plan):'),
  real('roadmap-5', 'positioning', 'typed', 'where the brand is in 5 years',
    '5 years: the marketing partner for creators, owner-run shops and startup teams.'),
  real('roadmap-10', 'positioning', 'typed', 'where the brand is in 10 years',
    '10 years: trusted by growing companies.'),
  real('roadmap-15', 'positioning', 'typed', 'where the brand is in 15 years',
    '15 years: trusted by large enterprises.'),
  real('roadmap-20', 'positioning', 'typed', 'where the brand is in 20 years',
    '20 years: ubiquitous, the agent humans and agents alike go to to grow through kindness, not growth at all costs.'),

  real('dont-like', 'examples', 'spoken', 'why it matters to him personally; how he feels about making content',
    "I don't like making content."),
  real('filming', 'examples', 'spoken', 'which part of making content he dislikes',
    'Especially everything around the filming.'),
  real('busywork-kept', 'examples', 'spoken', 'why it matters to him personally; a story of what got in the way',
    'For me, the busywork is what kept the filming from happening.'),
  real('actually-film', 'examples', 'spoken', 'what changes for him with CMO Kit',
    'It makes the busywork easy enough that I actually film.'),

  real('value-keep', 'values', 'typed', 'a value',
    'Yours to keep: you can leave with everything, any time, with no vendor relationship needed. Your brand strategy and what CMO Kit learns are portable, exportable and self-hostable.'),
  real('value-care', 'values', 'typed', 'a value',
    "Care over code: the value of the code is zero. The name and the trust behind it are the asset, so CMO Kit competes on the humanity AI can't copy, not on volume."),
  real('value-open', 'values', 'typed', 'a value',
    'Open by default: open source, and anyone can work on it. The hosted version includes no AI inference.'),
  real('value-accountable', 'values', 'typed', 'a value',
    'Someone accountable: a person stays accountable for what goes out. Nothing posts, sends or spends without your yes, and CMO Kit never invents a quote, result or deadline.'),

  real('audience-practitioners', 'audiences', 'typed', 'an audience, and what they need to believe',
    'Primary: independent spiritual practitioners and life coaches who sell paid experiences (circles, sessions, events, retreats), found mostly through Instagram. They need to believe CMO Kit fills the room with content that looks and sounds like them, with no hype, and protects clients who appear in their footage. Conversion: a paid seat or a booking.'),
  real('audience-influencers', 'audiences', 'typed', 'an audience, and what they need to believe',
    'Secondary: influencers with personal brands who use content for affiliate sales and paid sponsorships. They need to believe CMO Kit shows which posts earn commission and gives sponsors real numbers, without making them sound like an ad. Conversion: an affiliate sale, plus reach and clicks for sponsors.'),
  real('audience-self-hosters', 'audiences', 'typed', 'an audience, and what they need to believe',
    'Third: technical founders who self-host from the open source repo. They need to believe the code is open, nothing is hosted-only, and they can leave with their data.'),
  real('audience-copy', 'audiences', 'typed', 'how to address the audiences in copy',
    'In copy, address "people who create content for a living", not "practitioners".'),

  real('slider-friend', 'voice', 'typed', 'the friend (1) to authority (10) slider, the number only', 'Friend 2 (Authority 10)'),
  real('slider-mass', 'voice', 'typed', 'the mass appeal (1) to elite (10) slider, the number only', 'Mass appeal 3 (Elite 10)'),
  real('slider-mature', 'voice', 'typed', 'the young (1) to mature (10) slider, the number only', 'Young 1 to Mature 10: 6'),
  real('slider-serious', 'voice', 'typed', 'the playful (1) to serious (10) slider, the number only', 'Playful 1 to Serious 10: 7'),
  real('slider-proof', 'voice', 'typed', 'a slider pair of his own: hype (1) to proof (10), the number only', 'Hype 1 to Proof 10: 9'),
  real('we-are', 'voice', 'typed', 'what the slider positions mean: what we are',
    "We are: warm, grounded and plain-spoken, a trusted peer, never an authority telling them what to do. Honest about what isn't proven yet, careful with clients' privacy, and we show the numbers. We say plainly what the product does."),
  real('we-are-not', 'voice', 'typed', 'what the slider positions mean: what we are not',
    'We are not: marketing bro. No funnel, scale, growth hack or conversion talk in customer copy, no hype, no fake urgency or scarcity, no vague or cute phrasing, and no copy that sounds like AI.'),
  real('words-to-avoid', 'voice', 'typed', 'words to avoid',
    'Words to avoid: "your people", "practitioners" in copy.'),

  harness('solo', 'who is doing the sprint: him alone, self-guided', 'Just me, working through it with you.'),

  planted('planted-generic-values', 'spoken', 'a first list of candidate values (PLANTED: generic on purpose)',
    'Quality, innovation and being customer-focused.'),
  planted('planted-auto-post', 'spoken', 'what an audience needs to believe (PLANTED: contradicts value-accountable)',
    'They need to believe it posts for them automatically, so they never have to approve anything.'),
  planted('planted-team', 'typed', 'who is doing the sprint (PLANTED: a team, with no decider named)',
    "There are three of us on the founding team, and we're doing it together."),
];

/** Fixed replies the founder model can choose instead of lines. */
export const REPLIES = {
  confirm: 'Yes, that captures it.',
  confirm_save: 'Yes, save it.',
  skip: "I don't have an answer for that yet. Leave it empty for now.",
  correct: "That isn't what I said. Use only my own words.",
  stop: "Let's stop here for today.",
} as const;

export type Reply = keyof typeof REPLIES;

/**
 * Exercises with no real answer from CMO Kit's sprint yet. The founder skips each, and the save
 * check confirms nothing was made up for it. Being filled in, in the cmokit-marketing channel.
 */
export const PENDING = [
  'what must be true at year 5 for year 20 to happen (the skill on PR 54 is dropping this question)',
  'narrowing the four values to three',
  'narrowing the three audiences to one primary and at most one secondary',
  'a "this means we..." line for each slider (the saved voice has one "We are" and one "We are not" for all of them)',
  'competitive landscape: six to ten comparable brands placed on two axes, and the space CMO Kit claims',
  "the backwards press release: CMO Kit's next big moment, its headline and a customer quote",
];

/** CMO Kit's brand context before its sprint, as saved on 2026-11-13: no sections, one offer. */
export const BEFORE = {
  offers: [{ id: 'waitlist', name: 'CMO Kit private beta waitlist', pattern: 'launch' as const, destination: 'https://cmokit.ai/' }],
};

export const line = (id: string): Line => {
  const found = LINES.find((l) => l.id === id);
  if (!found) throw new Error(`No fixture line ${id}`);
  return found;
};
