---
description: Refresh the content skill's platform AI content rules by hand, as the monthly workflow does.
---

Run `node scripts/policy-refresh.ts --report policy-refresh-report.md`. If it says no model step is
needed, say so and stop. Otherwise follow
`plugins/cmokit-content/skills/content/references/REFRESH.md`, then show me the diff of
`ai-content-policies.md` and `policy-sources.json` and the pull request body you wrote. Do not
commit, push or open a pull request unless I ask.

To run the same refresh in GitHub Actions instead, start the `policy-refresh` workflow from the
Actions tab, or run `gh workflow run policy-refresh.yml`.
