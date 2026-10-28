# likelylikes — images

Status: design. Resolves *Image sets and sources* and the open question on
the image curation workflow and set metadata in
[requirements.md](requirements.md). Defines the first template, portraits of
women (§6). The tools that carry it out are specified in
[image-pipeline.md](image-pipeline.md).

## Summary

- Images are generated offline, curated, and frozen into sets. Nothing is
  generated at request time.
- A **template** is a fixed style with named parameter slots. Every image is
  one template version filled with one value per parameter. Candidates of
  the same subject are numbered in the order the model returns them.
- The accepted images of one template version form a **pool**. A **set** is a
  filter over a pool, frozen into a list of 12 to 16 images.
- Any parameter can be filtered, ethnicity included. One template serves a
  mixed set and sets narrowed to specific ethnicities.
- No image in a set may be clearly worse than the rest. Only the parameters
  vary; curation rejects defects, style outliers and images that do not show
  their parameters.
- Served images carry nothing but pixels: one size, one format, no metadata.
- Manifests live in git, image files in R2 under their content hash. A check
  fails the build on a set that breaks these rules (§8).

## 1. Constraints from scoring

Each rule follows from [scoring.md](scoring.md).

- **Sets are frozen.** Counts are kept per image, and scores compare only
  within one set size (scoring §9). A set's images never change; changing one
  makes a new set.
- **Sets are small.** A consistent player needs about 1.8 N² picks before the
  guaranteed average reaches 1 bit per pick (scoring §4.5):

  | N | 10 | 12 | 14 | 16 | 20 |
  |---|---|---|---|---|---|
  | picks | 149 | 223 | 312 | 414 | 662 |

  Sets hold 12 to 16 images. That is a game-first choice. Identity pulls the
  other way: a set of N images can certify at most log₂(N!/3!) bits, 26 at
  N = 12 and 42 at N = 16, and one large set holds more than several small
  ones ([entropy.md](entropy.md) §3, §7). Raising N changes the check's bounds
  (§8) and the pool design (§6.3), nothing else.
- **No clearly worse image.** An image everyone rejects, such as one with a
  mangled hand, is a fixed rule on content (scoring §9). It makes every player
  look consistent, and it adds nothing to identity because the whole
  population picks the same way (scoring §8). The pick must turn on taste.
- **Nothing leaks but content.** Screen position, load order, URL and DOM
  order must not depend on the image (scoring §4.3). The Worker serves opaque
  per-round URLs and the client reveals all four images together (scoring §9),
  so byte size cannot order the reveal. Embedded metadata goes further: some
  generators write the prompt into the file, handing a script each image's
  parameters.
- **Similarity comes free.** Ordering the bottom of a player's list needs
  quads of similar images (scoring §6). Parameter values and curation tags
  (§4) give a similarity measure without extra work.

## 2. Terms

| Term | Meaning |
|---|---|
| template | a question, a prompt with parameter slots, a model and its settings; versioned |
| parameter | a named slot with a finite list of values, each with the prompt fragment it inserts |
| subject | one value for every parameter of a template version |
| candidate | one generated image of a subject, numbered `c1`, `c2`, … in the order generated |
| image | a candidate accepted in curation; immutable, named by the SHA-256 of its served file |
| pool | every image of one template version |
| filter | for each parameter, the values allowed; a parameter left out allows all |
| set | a filter, a size N, and the N pool images it selected; keyed by `set_id` |

## 3. Templates

A template version fixes everything that is not a parameter: the question,
the prompt text, the model and its version, the settings and the served size.
Changing any of them makes a new version with a new pool. Images from
different template versions never share a set, because their style differs.

Some models take no seed and carry no version in their ID; Grok Imagine is
one (§9). Then nothing can regenerate an image: the generator's original
file is the only record of it, which is why §4 keeps it. And the model can
change without notice, so a pool is generated in one run, by one provider
and one model.

Parameters are the only things that vary. Each value carries the fragment it
puts into the prompt. A template may exclude combinations of values that the
model renders badly or that make no sense.

No parameter is special. Ethnicity is an ordinary parameter, and whether a
set fixes or mixes it is the set's choice (§5).

The prompt never names a real person, and no template takes a reference image
of one.

## 4. Pools: generation and curation

1. **Draw subjects.** For every value a set will filter on, draw at least the
   largest N subjects plus a margin for rejects. Spread the other parameters
   evenly within each value. §6.3 gives the first template's design.
2. **Generate.** Two candidates per subject, with the template's model and
   settings, numbered in the order the model returns them. Record the seed or
   request ID when the model gives one.
3. **Curate.** Look at each candidate alone, then in a grid with the rest of
   the pool. Reject it if:
   - it has a defect: anatomy, stray text, artefacts, cropping;
   - it is a style outlier: lighting, colour, background, clothing or framing
     differ from the pool;
   - it does not show its parameters, so a filter on them would mislabel it;
   - the subject could be taken for someone under 21, whatever the prompt
     said;
   - it resembles a real, recognisable person.

   Accept the **first** candidate in number order that passes, never the
   better of two. Choosing between passing candidates would put the curator's
   taste into the set. A subject whose candidates both fail gets two more
   (`c3`, `c4`).
4. **Tag.** Record what the image shows that the prompt left open, such as
   hair colour, from the tags the template declares. Tags feed similarity;
   filters use parameters only, because parameters are controlled and checked
   in curation.
5. **Encode.** Decode the accepted candidate to pixels and re-encode it at the
   template's served size and format. Re-encoding drops all metadata. Keep the
   generator's original as well.
6. **Store.** Upload both files to R2 under their SHA-256 and add the image to
   the pool manifest (§7).

Rejected candidates are logged with their reason. Their files are not kept.

## 5. Sets

A set is a filter, a size N with 12 ≤ N ≤ 16, and the N pool images it
selected.

- When the filter matches more than N images, choose N spread as evenly as N
  allows over the values of the parameters the filter leaves free. The choice
  uses a recorded seed, so it can be reproduced.
- A set is frozen when published. Different images or a different filter make
  a new set.
- One image can belong to several sets. Counts are kept per player × set
  ([requirements.md](requirements.md)), so its record in one set does not
  carry over to another.
- The author publishes sets, and the player chooses among them. Players do
  not compose their own filters: every distinct filter is a separate set with
  its own counts, so free composition would scatter one player's history
  across many small sets.

## 6. First template: portraits of women

### 6.1 Question

"Who do you find most beautiful?" It asks about the player's own taste, which
is what the score measures (scoring §4.7).

### 6.2 Prompt

Adapted from nytime5's headshot template. Everything outside the four slots
is fixed. Framing, expression, makeup, clothing, background and lighting
would otherwise decide the pick ahead of the face.

```
Head-and-shoulders portrait photograph of a {age}-year-old {ethnicity} woman
with {hair_length} {hair_texture} hair, facing the camera at eye level,
relaxed expression with a slight closed-mouth smile,
minimal natural makeup, no jewellery, no glasses,
plain heather-grey crew-neck t-shirt,
plain off-white background, soft even frontal lighting,
natural skin texture, not retouched, 85mm lens,
centred with a small margin above the hair
```

The prompt does not say "beautiful". The word pulls every face toward the
model's one idea of beauty and narrows the variation the set exists to
measure. If it is wanted, it goes in the fixed text, the same for every
image.

Generated square; served at 640 × 640 as WebP. The first model to try is
Grok Imagine through Workers AI (§9).

### 6.3 Parameters

Provisional values:

| Parameter | Values |
|---|---|
| `ethnicity` | East Asian, Southeast Asian, South Asian, Middle Eastern, Black, European, Latina |
| `age` | 27, 33, 39 |
| `hair_length` | short, shoulder-length, long |
| `hair_texture` | straight, wavy, curly |

Every `age` value is at least 25, and the check enforces it (§8). Facial
differences come from the model's own variation. Hair colour is left to the
model and recorded as the tag `hair_colour`: black, dark brown, light brown,
blonde, red or grey.

**Design.** Per ethnicity, 18 subjects: each of the 9 hair combinations twice,
at two different ages, so that each age occurs 6 times. That is 126 subjects
and at most 252 candidates before replacements. 18 per ethnicity leaves a
margin of 2 rejects for a 16-image set.

### 6.4 Sets

- **Mixed:** N = 14, two images per ethnicity.
- **One ethnicity:** N = 16 from that ethnicity's images.

Other filters, such as two ethnicities or one age, follow §5.

### 6.5 What a player's record says

- Picks among women's faces bear on the player's sexual orientation. Choosing
  to play this template at all says something before any pick.
- In a mixed set, a player with a strong preference for one ethnicity mostly
  records that preference, and the score rewards it as consistency. A coarse
  trait swamps fine taste. *(inference, untested)*
- In a filtered set, the filter is part of the record.

The privacy question in [requirements.md](requirements.md) is therefore a
prerequisite for launching this template, not a later refinement.

## 7. Records

Manifests are JSON files in git under `images/`; their layout is in
[image-pipeline.md](image-pipeline.md) §1. Image files are in R2.

| Record | Fields |
|---|---|
| template | id, version, question, prompt, parameters (name → values with fragments), exclusions, tags (name → allowed values), model (provider, id, version if any), settings, served width, height and format |
| pool design | template id and version, the parameter subjects are drawn per value of, subjects per value, the parameters balanced within each value, shuffle seed |
| subject | subject ID, parameter values, rendered prompt |
| generation log | subject ID, candidate number, SHA-256 of the original, provider, model, settings, seed or request ID if any, time |
| curation log | subject ID, candidate number, decision, reason, note, time |
| image | SHA-256 of the served file, SHA-256 of the original, template id and version, subject ID, candidate number, parameter values, tags, width, height, format, bytes |
| set | `set_id`, template id and version, filter, N, selection seed, image hashes, publication date |

R2 keys are `served/<sha256>.webp` and `original/<sha256>.<ext>`. The key never
reaches the client (§1).

## 8. The check

Offline, as part of `npm run check`, from the manifests:

- every set has 12 ≤ N ≤ 16 distinct images, all from one pool;
- re-running a set's filter and selection seed on its pool reproduces its
  image list;
- every image's parameter values are in its template's lists and not
  excluded;
- every `age` value is at least 25;
- every image in a pool has the template's served width, height and format;
- every generation in a pool has the same provider, model and settings;
- every subject has at most one accepted candidate, and it is the
  lowest-numbered candidate not rejected (§4, step 3);
- every image has an accept in the curation log, and every tag value is one
  its template allows.

Online, before deploy, on every served file of every published set fetched
from R2:

- its SHA-256 matches its key;
- it contains no EXIF, XMP, ICC or C2PA data;
- its decoded size and format match the manifest.

## 9. Open questions

- **Model and output terms.** The model must hold one style across subjects
  and allow this use of its output. First to try: Grok Imagine through
  Workers AI, `xai/grok-imagine-image`, listed at $0.02 per image, about $5
  for the first pool's 252 candidates. It takes `n` up to 10, `aspect_ratio`
  `1:1` and `resolution` `1k`, but no seed, and its ID names no version (§3).
  The same model is on xAI's own API as `grok-imagine-image-2.0`. nytime5
  uses Flux 1.1 Pro on Replicate. None is tested here, and no output terms
  are checked.
- **Parameter values.** The lists in §6.3, ethnicity especially, are
  provisional.
- **Privacy.** A prerequisite for the first template (§6.5).
- **Sharing counts between sets.** Pairwise counts belong to a pair of images,
  not to a set, so a player's counts from a single-ethnicity set could
  warm-start the mixed set. That would change the per-set rule in
  [requirements.md](requirements.md) and the comparability of scores
  (scoring §9).
- **AI disclosure.** FLUX 3's output carries a signed C2PA manifest naming
  the generator and model, with an AI-disclosure assertion but not the
  prompt. Re-encoding (§4, step 5) removes it, and a re-encoded file could
  not keep it valid anyway, since the manifest is bound to the original's
  bytes. The originals in R2 keep it. Whether the game must disclose AI
  generation some other way, such as on the page, is unchecked.
- **Fresh sets for revocation.** A leaked template is revoked by enrolling on
  a fresh set, assuming tastes in different sets are independent
  ([entropy.md](entropy.md) §7). A new batch of subjects under the same
  template makes a fresh set cheaply, but the same player likely favours the
  same features in it, so the assumption is weakest exactly there.
- **Served size and format.** 640 × 640 WebP is a default, not a measurement.
