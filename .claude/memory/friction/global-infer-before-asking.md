---
name: Infer before asking
description: Facts derivable from the evidence were asked of the user instead of recorded as inferences
type: feedback
---

Importing three AI Studio sheets, I listed as "gaps only you can fill": a prompt file reading "Irish" for a
plainly Italian sheet, the aspect ratio and resolution of a 4096×4096 image, and the model (which I had
already guessed). The user confirmed all three and said "I thought you could have guessed."

Hypothesis: I treat "flag inference" (Paul's CLAUDE.md) as "ask", when it means record the inference, label
it as inference, and let the user correct it. Test: next time a fact follows from the files (dimensions,
an obvious copy-paste slip), write it in and mark it inferred; ask only what the evidence cannot settle.
