# likelylikes — requirements

Status: draft, MVP scope. Decisions marked *(MVP)* are the simplest choice and
are expected to change; each sits behind an interface so it can.

## Product

A preference game. Each round shows four images from one image set; the player
picks the best. Points come from choosing consistently over time.

- **Game first.** Identifying/verifying individuals from choice patterns is a
  secondary use. Core primitives (pairwise counts, likelihoods, orderings) must
  serve both.

## Core model

- A **match** (one round) is a best-of-four pick. It yields a partial ordering:
  the chosen image beats each of the other three.
- Accumulated matches converge toward a **total ordering** of the set, per
  player.
- Players are noisy: usually A over B, occasionally B over A. Per player × set,
  pairwise outcome counts form a **confusion matrix**, from which the
  likelihood of any particular pick is computed.
- **Scoring:** pairwise log₂ likelihood ratios read off the counts,
  L_ij = log₂((n_ij+1)/(n_ji+1)). A pick of x from quad Q scores
  s = 2 − log₂(1 + Σ_j 2^(−L_xj)) bits against random clicking, summed over
  the three rivals j: at most 2 bits per pick. The cumulative LLR is the sum
  of s. See [scoring.md](scoring.md). The estimator that supplies L is a
  pluggable module.
- Per player × set:
  - a **consistency score**;
  - a **cumulative log likelihood ratio** (LLR).

## Gameplay

- The player aims to increase cumulative LLR as fast as possible, trading speed
  against accuracy.
- *(MVP)* Fixed-length timed session (e.g. 60 s); score = cumulative LLR gained
  in the session. Timer is server-authoritative.
- *(MVP)* Response time is recorded per pick but not used by the model.
- *(MVP)* Feedback: per-round points; consistency score and cumulative LLR shown.

## Image sets and sources

- Multiple themed **image sets**. Every match draws from a single set; orderings
  are per player × set. `set_id` is a first-class key throughout.
- **Image source is maximally decoupled** from the rest of the code (an
  interface; nothing else knows where images come from).
- Each set carries the question the player answers, e.g. "Who do you find
  most beautiful?"
- *(MVP)* Source: AI-generated images from parameterised templates, curated
  and frozen into sets of 12–16. See [images.md](images.md).

## Selection

- Quad selection is behind an interface.
- *(MVP)* Uniform random four from the set.
- Later: adaptive (max information), exact repeats, identity-discriminating
  selection.

## Players

- Anonymous first (browser-held ID), with an optional account later that
  inherits the anonymous history.

## Stack

- Cloudflare Worker with static assets; D1 for state; R2 for images.
- `wrangler.jsonc` with `$schema`, `observability.enabled`, apex domain via
  `routes` + `custom_domain`, matching sibling sites.
- **Gate:** `npm run check` — typecheck + unit tests (scoring, ordering,
  selection) + image manifests ([images.md](images.md) §8) — must pass before
  deploy.

## Interfaces (summary)

| Interface      | MVP implementation         |
|----------------|----------------------------|
| ImageSource    | frozen set manifests, files in R2 ([images.md](images.md)) |
| QuadSelector   | uniform random             |
| Scorer         | pairwise LLRs from counts, log₂ LR vs random ([scoring.md](scoring.md) §3) |

## Open questions

- ~~Exact LLR formulation, priors/smoothing for unseen pairs~~: see
  [scoring.md](scoring.md).
- Definition of the consistency score: proposal in [scoring.md](scoring.md) §7.
- Account mechanism (magic link vs OAuth) and anonymous → account linking.
- Privacy and data retention, especially given the identity use case.
- ~~Image curation workflow and set metadata (tags?)~~: see
  [images.md](images.md).
- Ranking/leaderboard (deferred), anti-cheat.
- Use of response time in the model.
- Identity verification: profile matching, thresholds (SPRT-style). Ceiling
  on what it can certify: [entropy.md](entropy.md).
