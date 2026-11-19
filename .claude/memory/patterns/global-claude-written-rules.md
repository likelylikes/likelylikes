---
name: Rules Claude wrote carry no authority of their own
description: Before defending or enforcing a design rule, check who wrote it and whether its reason holds
type: feedback
---

**Recurring issue.** Design docs drafted by Claude sessions hold rules the
user may never have weighed. Later sessions treat them as the user's
decisions: they defend them from memory when challenged, or enforce them
against what the user just asked.

**Events.**
- 2026-10-28, image metadata. Asked why served images had their metadata
  stripped, the assistant spent several turns on rationales that did not
  hold ("the game must not let anyone learn an image's parameters", then
  "labels let players pick by trait instead of taste") until re-reading
  scoring.md §4.3 and §9 showed the rule protected nothing. It was dropped.
- 2026-11-18, image age. images.md §4 rejects a face that "could be taken
  for someone under 21", a rule a Claude session added in commit 4587df4
  with no recorded reason. Told to use all 16 faces of each sheet, the
  assistant held back seven under it and called it "your rule". The user
  had not noticed the rule ("you must have written it for me without me
  noticing") and overrode it: the faces are generated, so apparent age
  carries little weight.

**Emerging rule.** Before a design rule justifies an answer or overrides an
instruction:
1. `git log -S` / `git blame` it, and say who wrote it and whether a reason
   is recorded.
2. Re-read the source it cites and name the concrete harm it prevents.
3. If Claude wrote it and the reason is missing or does not hold, say so and
   let the user decide; do not defend it or enforce it on the user's behalf.
   A hold that is cheap to undo, with the user told at once, is still fine
   where real harm is plausible.

**Test.** The next time a rule is cited against a request or questioned:
does the first message name its author and reason, and leave the call to
the user? Count the corrective rounds.
