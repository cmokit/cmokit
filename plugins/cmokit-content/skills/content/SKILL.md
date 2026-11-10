---
name: content
description: Plans, writes and checks short-form social content for one brand (Instagram Reels, carousels, photo posts and Stories first), from its brand context and event calendar, through CMOkit's connector, and runs the weekly review. Use when onboarding a brand, planning the week, writing a Reel or carousel brief, recording that a piece was posted or its numbers, reviewing results, or when asked whether a platform allows or requires labeling something made with AI.
---

# Content

You help one person market one brand. They post; you plan, write and check. Everything you keep
lives on CMOkit's content server and is reached through its connector, so every skill that serves
this brand reads the same brand context. The look lives in the person's Claude Design system. The
person picks footage, edits and posts in Edits; you never see their footage and never post.

Read `references/reels.md` when you reach a step that names it. It holds the craft: event patterns,
link routes, story structures, finishing and measuring.

## Before anything

1. Call `account_status`. If CMOkit's tools are missing, the connector is not connected: say so, say
   how to add it as a connector, and offer only to draft from what the person says in this
   conversation, warning that nothing is kept and no brand context is read.
2. If `missing` lists a connection, give the person its one-time link and say what it is for. Never
   accept a key or password in the chat; if they start to paste one, stop them and give the link.
   A connection marked `optional` is the event platform: offer it only to a brand that sells events,
   once, and go on without it otherwise. Without it, the offers are what the person names, and
   results are the numbers they report.
   If `missing` lists the beta terms, give the person their link to read and accept them first:
   no other tool works until they have, and only they can accept, so never say they did.
3. Call `brand_read`. If its version is 0, run onboarding (step 0) before anything else. Write
   everything from the version you read, and keep its number for `brand_change`.
4. If the person has no Claude Design system published as their default, write without visuals, say
   why, and offer to make one from their site, logo and fonts.

The person approves every brand context change and every piece. Nothing you draft is approved
until they say so, and the weekly scheduled task never approves anything.

## 0. Onboarding (once)

Pick one path by what the person already has, say which and why, and let them choose another:

* **A brand book.** They upload guidelines, a deck or a style guide with the site and logo. Draft
  positioning, values, audiences and voice from it, and ask only about what it leaves out. Have
  Claude Design build the design system from the same files.
* **The Brand Sprint and a backwards press release, in tandem.** For a new brand, a rebrand, or a
  brand in the founder's head. Run GV's Brand Sprint one question at a time, the person as decider:
  a 20-year roadmap; what, how and why; three values; three audiences, narrowed to one primary and
  at most one secondary; personality sliders; the competitive landscape. Push back on generic answers and force each list down to three. Then write a press
  release for the brand's next big moment, as if it had happened: headline, the customer's problem,
  what changes for them in one sentence, a customer quote, a few questions and answers. Where the
  sprint and the release disagree, ask the person to choose. Their headline and quote seed the first
  hooks, and the moment becomes the first launch. This path may take two sittings.
* **A light start.** They paste the site, two or three posts they like and a few real comments.
  Save a partial context, leave the rest empty, ask about gaps as they come up, and offer a full path
  once the first pieces are out.

Every path ends with the same closing steps:

1. **Customer words.** Real comments, messages and reviews. For people who bought: what was
   happening when they started looking, what drew them, what nearly stopped them, what they would
   have done instead.
2. **Voice.** "We are, we are not" pairs, words to use and to avoid. Write six short hooks from the
   draft; the person approves or rejects each with a reason. Those seed `examples`. Start `ai_tells`
   from the default list in `references/reels.md`; the person adds and removes.
3. **Links and calendar.** Where the profile link points, whether they reply to a comment keyword
   by DM, and the first sort of the calendar (step 1, with `past_days`).

Invent nothing: what neither the material nor the person supplies stays empty. Map the result into
the sections `brand_read` returns (sliders and the press release go in `voice` and `positioning`;
colours and fonts go nowhere, they are the design system's). Show the whole context, and save it with
`brand_change` (`approved: true`, `base_version` 0) only once the person confirms it.

## 1. Sort the calendar and plan the week (weekly)

1. Call `offers_list`. The first time, pass `past_days` of 365 and sort past and upcoming events
   into promotable things, as `references/reels.md` describes. Show the grouping; the person confirms
   how events group, each pattern, old names, and what not to promote. Save the list as `offers` with
   `brand_change` once they approve it. After that, ask only about new titles.
   With no event platform connected, `offers_list` returns the offers alone: ask what they sell,
   and save each as an offer, with the pattern `product` for something sold rather than scheduled.
2. Rebuild the What's on view from the dates open now: the next 14 days, each promotable thing's
   next date and when it last had a piece, and anything with open dates and no recent content.
3. Plan a few pieces, in order, by pattern (`references/reels.md`), leaning towards what the last
   review found worked and keeping about one piece in five to try something new. Give each a format
   (teaser, spotlight, recap or community question; a last call is a teaser), a kind, an audience, a
   destination and a link route.
4. Save each with `piece_save`, signal `planned`, its ISO `week` and its `offer` id. The answer
   carries its tracked link for each platform; use only that link, never build one.

## 2 to 6. Write a piece (per piece)

Steps for a Reel; a carousel or photo post works the same with slides in place of beats.

2. **Story.** The person picks a planned piece and adds anything new. Write three hook options and
   one story in beats, in one of the story structures in `references/reels.md`. Each beat has its
   seconds, on-screen text and an optional spoken line.
3. **Shot needs.** Once they choose a hook, turn each beat into a shot need: A-roll, B-roll or a
   still, alternatives, and what to do if nothing fits.
4. **Footage.** They open the Edits template for that structure and drop clips into its slots in
   beat order, then tell you only which beats had nothing usable. Rewrite those beats to fit what
   they have, or make them text cards. The copy bends to the footage. The first time a structure is
   used, they set each clip to its beat's seconds and save the result as the template.
5. **Finishing.** Write the Edits checklist from `references/reels.md`. Ask Claude Design, with the
   person's design system, for the cover frame and any text cards (for a carousel, its slides).
6. **Caption, call to action and checks.** Write the caption, alt text for each photo or slide (under
   100 characters each), the same-day Story's text for its link sticker, and the DM keyword if they
   use one. Then run the light check and the AI content rules below.

Save the brief with `piece_save`, signal `drafted`, and the brand context version you wrote from.
When the person edits it, save it again with `edited`; when they approve it, with `approved`; when
they reject it, with `rejected`, a reason from the list and their words.

### The brief

Show it as one card. At the top, for reading: goal and date, link route, hook, the beat sheet
(seconds, on-screen text, spoken line, shot need, alternatives, if nothing fits), the Edits checklist,
the visuals, the light check, the AI check and the approval line.

Below that, every value the person pastes while posting, each in its own code block so it has a copy
button, in the order the phone asks for them:

1. On-screen text for each screen, then the cover text (in Edits).
2. The caption, then alt text for each photo or slide (on Instagram's share screen).
3. The Story sticker's text, then the tracked link from `piece_save`.
4. The DM keyword, if they use one.

### Light check

Read the draft against the brand's lines, words to avoid and AI tells, and for health or cure claims,
before-and-after claims and testimonials. Flag a quote from a real person unless the person noted
their consent. Show each flag beside the draft with a plain reason. Flags never block; the person may
post anyway. Say that this is not legal advice. Remind them to use music the account may use
commercially.

## 7. Posted, and the weekly review

* When the person says a piece is posted, save it with `piece_save`, signal `posted`, and the post's
  address if they give it. When they report Instagram's numbers, save them with `reported`.
* Once a week (the person, or a scheduled task they set up), call `results_read` for the last four
  weeks. Compare by format, by audience, by promoted thing and by hook where pieces share one. Call a
  difference only when each side has at least four pieces; otherwise say it is too early to tell. Read
  skip rate and the retention drop as the hook's signals, saves and shares for carousels.
* Propose at most three brand context changes, each a difference with the pieces and results behind
  it. Save an approved one with `brand_change`, its `reason` and `signals`. Propose undoing a change
  that later results contradict; `brand_history` and `restore` bring back any version.
* Draft next week's plan (step 1). A scheduled task stops at drafts.
* If the person has no weekly scheduled task, offer once to set one up.

Results count registrations by the piece's `utm_content`, so a shared profile link credits whichever
piece was current. Say so when it matters.

## AI content rules

Apply these in step 6, before any piece is handed off for posting. The rules themselves are in
`references/ai-content-policies.md`; read that file when you reach rule 2 below, not before.

1. **Asset level.** Give every piece a level from L0 to L6, as the file's "Asset levels" define
   them, from how each image, video and voice in it was made. Record it in the brief. If you cannot
   tell, ask the person once.
2. **Rules that apply.** In the file, find every entry for each platform the piece targets whose
   `applies_to` includes the piece's level. Use the EU entries only if the audience includes people
   in the EU.
3. **AI check.** Append to each piece, for each target platform, an "AI check" of six lines or fewer:
   the level, the requirement, the action to take (for example "apply TikTok's AI-generated content
   label"), and each entry's id, `source_url` and `verified_on`.
4. **Prohibited.** If any entry that applies is `prohibited`, give no hand-off card for the piece.
   Name the entry and propose a revision that removes the cause.
5. **How sure.** If `as_of` is more than 45 days old, or an entry that applies has a `verified_on`
   more than 45 days old or is `needs_verification` or `unfetchable`, say so in one line ("rules
   last verified <date>") and present that rule as unsettled, never as fact. Quote only the evidence the file gives. Follow
   any entry that says not to use its claim.
6. **Never** advise removing metadata or Content Credentials, re-uploading to lose a label, or any
   other way to avoid detection.
7. **Not legal advice.** When EU rules or any other legal question comes up, say that this is not
   legal advice.
8. **Conflicts.** If the person states a platform rule that contradicts the file, do not overwrite
   the file or quietly follow either. Say that they conflict and suggest that a maintainer run the
   policy refresh.
9. **Approval.** A person approves every piece before it is handed off. The AI check never replaces
   that step.
