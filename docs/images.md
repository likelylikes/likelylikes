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
- Images are generated at the size they are served and served exactly as
  generated, metadata included: one size and one file format per pool.
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
  so byte size cannot order the reveal. Embedded metadata is not such a
  channel. Players never see it, and a prompt in the file would tell a script
  nothing the pixels do not, since every accepted image shows its parameters
  (§4, step 3); any rule on content is open to a script anyway (scoring §9).
  Files are served as generated, metadata included (§4, step 5).
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
| image | a candidate accepted in curation; immutable, named by the SHA-256 of its file, which is served as generated |
| pool | every image of one template version |
| filter | for each parameter, the values allowed; a parameter left out allows all |
| set | a filter, a size N, and the N pool images it selected; keyed by `set_id` |

## 3. Templates

A template version fixes everything that is not a parameter: the question,
the prompt text, the model and its version, the settings, and the image's
size and file format. Changing any of them makes a new version with a new
pool; a version that has generated nothing may be amended in place. Images
from different template versions never share a set, because their style
differs.

Images are generated at the size they are served and never converted, so the
size must be one the model produces exactly, and the format is the one the
model and settings return. The template states both, to check against.

Some models take no seed and carry no version in their ID; Grok Imagine
through Workers AI is one (§9). Then nothing can regenerate an image: the
generator's file is the only record of it, which is why §4 keeps it. And the
model can change without notice, so a pool is generated in one run, by one
provider and one model.

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
2. **Generate.** Two candidates per subject, with the template's model,
   settings and size, numbered in the order generated. Record each file's
   width, height and format, and the seed or request ID when the model gives
   one.
3. **Curate.** Look at each candidate alone, then in a grid with the rest of
   the pool. Reject it if:
   - it has a defect: anatomy, stray text, artefacts, cropping, or a size or
     format other than the template's, which the tools reject before the
     curator sees it;
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
5. **Keep as generated.** The accepted candidate's file is the image, byte
   for byte. Nothing decodes, resizes or re-encodes it, so the generator's
   provenance metadata, such as FLUX's signed C2PA manifest, stays valid.
   BFL's terms forbid removing it
   ([image-variability.md](image-variability.md) §5).
6. **Store.** Upload the file to R2 under its SHA-256 and add the image to the
   pool manifest (§7).

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

Generated and served at 640 × 640, in the file format the model returns. That
needs a model that takes a width and height: FLUX 3 Image and FLUX 3 Image
Klein on BFL's API, or FLUX.2. The FLUX MCP server used for the trials offers
FLUX 3 only at preset sizes, the smallest square being 768 × 768, and
FLUX1.1 [pro] Ultra takes only an aspect ratio. Grok Imagine, the first model
to try (§9), generates only at fixed resolutions (`1k` and `2k` on Workers AI,
also `1.5k` on xAI's API; `2k` is an upscaled `1k`), whose pixel sizes are
unmeasured. The v1 template pairs Grok with 640 × 640 and names no format. v1
has generated nothing, so its model or its size is amended in place before it
does, and its format set to what that model returns.

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
| template | id, version, question, prompt, parameters (name → values with fragments), exclusions, tags (name → allowed values), model (provider, id, version if any), settings, size (width, height, file format) |
| pool design | template id and version, the parameter subjects are drawn per value of, subjects per value, the parameters balanced within each value, shuffle seed |
| subject | subject ID, parameter values, rendered prompt |
| generation log | subject ID, candidate number, SHA-256, width, height and format of the file, provider, model, settings, seed or request ID if any, time |
| curation log | subject ID, candidate number, decision, reason, note, time |
| image | SHA-256 of the file, template id and version, subject ID, candidate number, parameter values, tags, width, height, format, bytes |
| set | `set_id`, template id and version, filter, N, selection seed, image hashes, publication date |

The R2 key is `image/<sha256>`, and the object carries its content type, set
at upload from the image's format. The key never reaches the client (§1).

## 8. The check

Offline, as part of `npm run check`, from the manifests:

- every set has 12 ≤ N ≤ 16 distinct images, all from one pool;
- re-running a set's filter and selection seed on its pool reproduces its
  image list;
- every image's parameter values are in its template's lists and not
  excluded;
- every `age` value is at least 25;
- every image has its template's width, height and format;
- every image's SHA-256 is the one the generation log recorded for its
  candidate, so the image is the file that was generated;
- every generation in a pool has the same provider, model and settings;
- every subject has at most one accepted candidate, and it is the
  lowest-numbered candidate not rejected (§4, step 3);
- every image has an accept in the curation log, every accept has an image,
  and every tag value is one its template allows.

Online, before deploy, on every served file of every published set fetched
from R2:

- its SHA-256 matches its key;
- its decoded size and format match the manifest;
- where the pool's model writes a C2PA manifest, the manifest validates with
  no hash-binding error, which proves the bytes are the ones the generator
  signed. Only the binding is checked, not trust in the signer: some
  generators sign with certificates no trust list holds.

After deploy, one image of every published set, fetched through the Worker as
a client fetches it, has the SHA-256 of its key. Nothing between R2 and the
player may change the bytes. Cloudflare's
[Polish](https://developers.cloudflare.com/images/polish/), for one, strips
metadata, so no image optimisation applies to the image route.

## 9. Open questions

- **Model and output terms.** The model must hold one style across subjects
  and allow this use of its output. First to try: Grok Imagine through
  Workers AI, `xai/grok-imagine-image`, listed at $0.02 per image, about $5
  for the first pool's 252 candidates. It takes `n` up to 10, `aspect_ratio`
  `1:1` and `resolution` `1k`, but no seed, and its ID names no version (§3).
  On xAI's own API it is `grok-imagine-image`, which xAI calls version 1.0,
  with the dated alias `grok-imagine-image-2026-03-02`;
  `grok-imagine-image-2.0` is a separate model at $0.04. nytime5 uses Flux
  1.1 Pro on Replicate. None is tested here. The output terms found so far
  are in [image-variability.md](image-variability.md) §5.
- **Parameter values.** The lists in §6.3, ethnicity especially, are
  provisional.
- **Facial variation.** §6.3 assumes faces differ by the model's own
  variation. Six FLUX 3 trials, judged by eye, came out alike, and published
  measurements of earlier models, FLUX.1 [dev] above all, find generated faces
  less varied than real ones; FLUX 3 and Grok Imagine are unmeasured.
  [image-variability.md](image-variability.md) proposes declared colour and
  face-shape parameters, a look-alike reject rule and apparent-age
  measurement.
- **Privacy.** A prerequisite for the first template (§6.5).
- **Sharing counts between sets.** Pairwise counts belong to a pair of images,
  not to a set, so a player's counts from a single-ethnicity set could
  warm-start the mixed set. That would change the per-set rule in
  [requirements.md](requirements.md) and the comparability of scores
  (scoring §9).
- **AI disclosure.** FLUX 3's output carries a signed C2PA manifest naming
  the generator and model, with an AI-disclosure assertion but not the
  prompt. Files are served as generated (§4, step 5), so players receive it
  intact, as BFL's Developer Terms require. Cloudflare's Grok 1.0 examples
  carry no manifest. The terms found forbid presenting output as human-made;
  whether law requires a label on the page is unchecked
  ([image-variability.md](image-variability.md) §5).
- **Fresh sets for revocation.** A leaked template is revoked by enrolling on
  a fresh set, assuming tastes in different sets are independent
  ([entropy.md](entropy.md) §7). A new batch of subjects under the same
  template makes a fresh set cheaply, but the same player likely favours the
  same features in it, so the assumption is weakest exactly there.
- **Served size and format.** 640 × 640 is a default, not a measurement.
  Files are served as the model returns them. FLUX 3 Image takes no output
  format and returned PNG in the trials; at 640 × 640 that would be roughly
  0.6 MB a file *(inference, scaled from the 1.6 MB trials at 1024 px)*.
  Per-round URLs keep the browser from caching, so each round downloads four
  files, and sessions are timed, so download time costs picks. Either the
  client fetches the next round while the current one is shown, where the
  selection rule allows it, or the pool uses a model with a lossy
  `output_format` (FLUX 3 Klein: JPEG; FLUX.2: JPEG or WebP). A third way
  would give up byte-for-byte serving: Cloudflare Images, with
  [Preserve Content Credentials](https://developers.cloudflare.com/images/optimization/hosted-images/preserve-content-credentials/)
  on, keeps a source image's C2PA manifest and signs an added record of its
  own resizing or format conversion. Whether that satisfies BFL's terms, and
  whether it covers images served from R2 through a Worker, is unchecked.
