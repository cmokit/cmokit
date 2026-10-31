---
name: content
description: Plans, writes and checks short-form social content (Instagram Reels, TikTok, LinkedIn posts) for a brand. Use when drafting, checking or scheduling a post, or when asked whether a platform allows or requires labeling something made with AI.
---

# Content

This skill is being built. It holds one section so far: the platform AI content rules.

## AI content rules

Apply these before any piece is drafted or scheduled. The rules themselves are in
`references/ai-content-policies.md`; read that file when you reach step 2, not before.

1. **Asset level.** Give every piece a level from L0 to L6, as the file's "Asset levels" define
   them, from how each image, video and voice in it was made. Record it in the brief. If you cannot
   tell, ask the person once.
2. **Rules that apply.** In the file, find every entry for each platform the piece targets whose
   `applies_to` includes the piece's level. Use the EU entries only if the audience includes people
   in the EU.
3. **AI check.** Append to each piece, for each target platform, an "AI check" of six lines or fewer:
   the level, the requirement, the action to take (for example "apply TikTok's AI-generated content
   label"), and each entry's id, `source_url` and `verified_on`.
4. **Prohibited.** If any entry that applies is `prohibited`, do not schedule the piece. Name the
   entry and propose a revision that removes the cause.
5. **How sure.** If `as_of` is more than 45 days old, or an entry that applies is
   `needs_verification` or `unfetchable`, say so in one line ("rules last verified <date>") and
   present that rule as unsettled, never as fact. Quote only the evidence the file gives. Follow
   any entry that says not to use its claim.
6. **Never** advise removing metadata or Content Credentials, re-uploading to lose a label, or any
   other way to avoid detection.
7. **Not legal advice.** When EU rules or any other legal question comes up, say that this is not
   legal advice.
8. **Conflicts.** If the person states a platform rule that contradicts the file, do not overwrite
   the file or quietly follow either. Say that they conflict and suggest that a maintainer run the
   policy refresh.
9. **Approval.** A person approves every piece before it is scheduled. The AI check never replaces
   that step.
