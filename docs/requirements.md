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
- **Scoring:** a product of log likelihood ratios (exact formulation TBD; to be
  analysed later). Scoring is a pluggable module.
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
- *(MVP)* Source: a curated list of AI-generated images.

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
  selection) — must pass before deploy.

## Interfaces (summary)

| Interface      | MVP implementation         |
|----------------|----------------------------|
| ImageSource    | curated AI-image list      |
| QuadSelector   | uniform random             |
| Scorer         | LLR product (TBD formula)  |

## Open questions

- Exact LLR formulation, priors/smoothing for unseen pairs.
- Definition of the consistency score.
- Account mechanism (magic link vs OAuth) and anonymous → account linking.
- Privacy and data retention, especially given the identity use case.
- Image curation workflow and set metadata (tags?).
- Ranking/leaderboard (deferred), anti-cheat.
- Use of response time in the model.
- Identity verification: profile matching, thresholds (SPRT-style).
