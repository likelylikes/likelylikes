---
name: Re-derive a rule before defending it
description: When asked why a design rule exists, re-read the source it cites and test the threat before answering
type: feedback
---

**Event (2026-10-28, image metadata).** Asked why served images had their
metadata stripped, the assistant spent several turns on rationales that did
not hold: "the game must not let anyone learn an image's parameters", then
"labels let players pick by trait instead of taste". The user had to push
back repeatedly ("I have no clue what problem you are trying to solve", "you
cannot force them to pick by taste"). Re-reading scoring.md §4.3 and §9
showed the rule protected nothing: the side-channel rule covers cues a player
can act on without judging the images (position, load order), players never
see metadata, and a script can tell images apart by their pixels anyway. The
rule was dropped.

**Hypothesis.** Challenged on a rule it had written, the assistant produced
justifications from memory instead of re-reading the source the rule cites
and stating the concrete threat. A mid-thread switch to a smaller model made
it worse, but the pattern does not depend on the model.

**Test.** The next time a user asks why a rule exists: does the first answer
quote the cited source and name the threat, or say plainly that the rule does
not hold? Count the corrective rounds.
