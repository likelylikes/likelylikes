# likelylikes — image variability

Status: research, sources read 2026-10-28. Why the first trial portraits came
out alike, and what is known about getting faces that differ. Proposals only:
[images.md](images.md) and [image-pipeline.md](image-pipeline.md) change when
one is adopted. Claims marked *(inference)* are not in any source. "No study
found" means none turned up in searches that were limited; it does not mean
none exists. Sources are listed by section at the end.

## Summary

- Six FLUX 3 trials of European subjects ([images.md](images.md) §6) looked
  like near-twins, all with brown hair and brown or hazel eyes. That was
  judged by eye; nothing has been measured yet (§6). Three likely causes add
  up, and the first is ours:
  1. **The design repeats prompts.** Within one ethnicity the template has 27
     distinct prompts, and 9 once age is set aside. The 32 European subjects
     include 5 pairs of identical prompts. The pair that looked most alike,
     s002 and s005, differ only in age; so do s003 and s004.
  2. **The planner probably fills open slots the same way** *(inference,
     §1.2)*. FLUX 3 rewrites each prompt before rendering. Its published
     sibling decodes greedily and settles everything left open as "ONE
     concrete, consistent plan", so the same prompt gets the same hair colour,
     eye colour and face shape where the template leaves them open.
  3. **Earlier FLUX models collapse identity anyway.** Measured FLUX.1 [dev]
     faces are less varied than real people even when attributes are sampled
     per prompt. FLUX 3 and Grok Imagine are unmeasured.
- The template assumes facial differences "come from the model's own
  variation" (images.md §6.3). The trials and the measurements of earlier
  models say that does not hold. Work that needs many distinct synthetic people
  declares the variation and checks it mechanically. Recommended, in order:
  1. Declare more of the face: hair colour, eye colour and a few face-shape
     values, set from population data, drawn so that no two subjects share
     all their values (§4.1, §4.2).
  2. Reject look-alikes with a face-recognition embedding, as one more
     objective reject reason, with a threshold calibrated on human judgements
     of our own images (§4.3).
  3. Measure apparent age with two estimators, and test the fixed text that
     may add age, the smile above all (§4.4).
  4. Choose the model by a pilot on this template; no published ranking
     covers the models in play (§4.5).
- Sampling-level methods need open weights and a GPU. CADS, DiverseFlow and
  plain particle guidance cost prompt adherence or image quality on FLUX; the
  cheaper ones were measured only on generic diversity within one prompt,
  never on face identity across subjects. Not recommended (§3).
- Two findings outside variability, both now handled (§5). BFL's Developer
  Terms forbid removing the C2PA credentials its API output carries, which
  the design used to strip; images are now generated at the size they are
  served and served unchanged, so the credentials stay. And images.md §9
  named the wrong Grok model; now corrected.

## 1. Why the trials look alike

### 1.1 The design repeats prompts

Within an ethnicity the template varies age (3 values), hair length (3) and
hair texture (3): 27 combinations. The pool design draws 32 European subjects,
so five combinations come twice, as byte-identical prompts: s002/s008,
s006/s021, s009/s026, s011/s032 and s019/s029. Every hair combination is shared
by three or four subjects whose prompts differ only in the age number. Two of
the six trials are such pairs: s002/s005 (short straight, 39 and 33) and
s003/s004 (shoulder-length curly, 27 and 39). The 18-per-ethnicity design of
images.md §6.3 pairs each hair combination at two ages by construction, so any
16-image single-ethnicity set holds at least seven pairs that differ only in
age.

*(inference)* With no seed, and if the planner turns one prompt into one plan
(§1.2), two identical prompts differ only by the image noise, and two that
differ in one number differ in little else. Re-rolling (`c3`, `c4`) would then
return much the same face. BFL says two runs of the same prompt can differ, so
how much is untested (§6 step 2). New declared values help either way.

### 1.2 The planner fills open slots

FLUX 3 Image expands every prompt into a long caption before it renders, and
returns the caption in `result.prompt`. It takes no seed, guidance or
upsampling switch, and rejects unknown fields with HTTP 422. A `grounding`
flag, on by default, runs web and image search.

BFL publishes the planner only for FLUX 3 Image Klein: a 9B language model run
with greedy decoding. Its text-to-image instructions say "keep every explicit
subject, attribute, count, spatial constraint, style cue and piece of wording;
never contradict, substitute, drop or narrow the request", and "Decide
everything left open as ONE concrete, consistent plan". Every person in focus
gets at least "ethnicity, gender, age range, skin tone ... hair and clothing".
Nothing mentions eyes or face structure, and the only age wording is "age
range": whether an explicit "33" survives as a number or becomes "in her
thirties" is untested. BFL's two upsampling examples, rendered at seeds 1 and
2, carry byte-identical captions.

*(inference)* If the hosted FLUX 3 planner works the same way, each prompt's
unstated hair colour, eye colour and face shape get one fixed choice, and
similar prompts plausibly get the same choices. That would fit six
brown-haired women with brown or hazel eyes. It is untested. The FLUX MCP
server used for the trials lists only the submitted prompt in its history,
and the one C2PA manifest inspected (s001's) holds no prompt, so the rewrites
were not kept.
Klein's planner keeps stated attributes, so whatever the template declares
should survive, and `result.prompt` shows whether it did.

Grok Imagine has rewritten prompts on the server: a now-deprecated field of
xAI's SDK is documented as "The actual prompt used to generate the image ...
prompts get rewritten by the system". Since 2026-02-10 the API returns no
rewrite, and whether version 1.0 still rewrites at a fixed 1:1 aspect ratio is
unknown. Grok's adherence can only be checked on the pixels.

### 1.3 Earlier models collapse identity

- FLUX.1 [dev], prompted with age, ethnicity and gender plus randomly sampled
  hairstyle, hair colour, glasses and lighting, still gave identities less
  separated than real faces, FLUX furthest of the generators tested
  (FairFaceGen). FLUXSynID, using FLUX.1 [dev] with a LoRA trained on Chicago
  Face Database portraits, removed female identities more often and concludes
  that "FLUX.1 [dev] generates less diverse female faces"; guidance above 2.5
  gave "visually similar faces".
- The one cross-model count of distinct identities found (DisCo: scenes of 2
  to 7 people, all faces of the test set clustered by a face-recognition
  model) found FLUX.1 [dev] produced 50.5 distinct identities per 100 people
  requested, SD3.5 72.5 and GPT-Image-1 89.8. A second benchmark gave
  different figures, and whether any of this carries over to single portraits
  is untested. GPT-Image-1 was shut down on 2026-10-23.
- Prompts that name only a demographic group give identities that "look quite
  similar" (Rosenberg et al.).
- Post-training narrows output. An aesthetic reward cut one face model's Vendi
  score from 10.34 to 4.55, and preference-tuned FLUX.1 [dev] checkpoints gave
  "near-identical faces". Distilled models fix an image's structure in the
  first step and lose diversity (Gandikota and Bau); BFL says its undistilled
  FLUX.2 [klein] Base models have "higher output diversity than the distilled
  models".
- Generated faces sit nearer the centre of face space than real ones (Dunn et
  al. 2026). In a preprint, human raters scored every generator with at least
  10 rated images above real photographs, on face-only oval crops (Alvero et
  al. 2026: photographs 3.10 of 7; Grok Imagine 4.62 from 23 images; FLUX.1
  [dev] 5.03 from 29). Attractive faces are more tightly clustered than
  unattractive ones in perceived face space (Potter et al. 2007).
  *(inference)* A model pulled toward attractiveness may converge on few
  faces, and spreading identities apart may cost parity.

Declaring attributes does not close the gap, and no source found measures how
far it narrows it: curated SDXL identity descriptions that specified facial
structure still gave identities that "tend to be overly similar".
Distinctness has to be checked, not assumed.

### 1.4 The age skew may be partly the judge

The trial ages (33-year-olds reading late 30s) were judged by eye, without an
instrument, from six images. In Ganel's studies, people and age estimators
both overestimate young adults, more so when they smile:

- Smiling faces are judged older than neutral photos of the same people, by
  one to two years for adults of 20 to 39 (Ganel 2015; Ganel and Goodale 2021).
- 21 commercial AI estimators added 2.4 years for a smile on young adults,
  against 1.1 for human raters. Young women of real mean age 24.9 were
  estimated at 26.8 neutral and 29.9 smiling (Ganel, Sofer and Goodale 2022).

Other data disagree. In APPA-REAL, women's apparent age falls below their real
age from about 20 on, and Voelkle et al. 2012 found happy faces the most often
underestimated. All of these studies agree that neutral faces are judged most
accurately.

- Makeup's effect depends on age: women of 20 look older with it, of 30 no
  different, of 40 and 50 younger (Russell et al. 2019). Lower contrast around
  eyes, brows and lips reads older (Porcheron et al. 2013).
- No study found tests whether "natural skin texture, not retouched" adds age.
  Wrinkling is a strong cue to perceived age in real faces (Gunn et al. 2009).
  *(inference)*

The generator may add its own error. In one study, age estimated by a single
proprietary estimator (JAM, by three of the paper's four authors) tracked the
requested age only weakly within a decade on Flux, taken to be FLUX.1 [dev]:
r = 0.38 at 20–29 and 0.20 at 30–39. Both figures include the estimator's
error and are held down by the narrow range. FLUX 3 is unmeasured. Measure
before changing the template (§4.4).

## 2. The variation the game needs

The literature on facial attractiveness says what to vary and what to hold
still.

- **A third to a half of taste is private.** When people rate the same faces
  twice, private taste (rater × face) makes up a third to a half of the stable
  variance: Kramer et al. 2018, bi1 .31 for unfamiliar faces; Leder et al.
  2016, about 36–40% for women rating men; Hönekopp 2006, bi1 .44–.56 in three
  experiments; Germine et al. 2015, 52% individual against 48% common, from
  the 60 of 200 faces rated twice; Hehman et al. 2017, 34.1% personal against
  31.6% shared on a combined youthful-attractive dimension, over 50 Chicago
  Face Database portraits. A person's own ratings retest at about .75–.80 over
  a week to a year (Leder .80, Kramer .78, Kościński .78), and in Kościński
  2010 a year apart was no worse than a month.
- **Parity raises the private share but adds no taste.** Private variance
  stays nearly constant whatever the faces (0.64–0.68 on a 7-point scale in
  Hönekopp's reanalysis); shared variance grows with the spread of consensus
  attractiveness (0.13 to 1.26). Faces from the middle two quartiles gave bi1
  .84, from the outer quartiles .35. "No clearly worse image" makes picks turn
  on taste, as images.md §1 intends. *(inference)* Distinct faces are what
  give that taste something to choose between.
- **Where tastes differ.** Modelling 80 men's preferences over random 3D faces,
  Zhan et al. 2021 found a shared preference for a smaller face with a
  prominent forehead, and individual and cultural differences on face width,
  chin pointiness, mouth fullness, nose size, nose-bridge height and
  complexion (lightness, redness). Eight shape and three complexion components
  captured nearly all the variation between individuals. The raters were young
  heterosexual men and the faces 25-year-old synthetic women; nothing
  comparable was found for women or other raters.
- **What to hold at parity.** Cues that move nearly every rater the same way:
  apparent age (youthfulness and attractiveness load on one dimension, Hehman
  et al.), skin redness and oxygenation (92–100% of raters moved 51 Caucasian
  faces the same way to make them look healthy, Stephen et al. 2009), and
  facial contrast (Porcheron et al.).
- **Colouring is a lever of uncertain parity.** Hair and eye colour carry
  rater-specific preferences: blue-eyed men prefer blue-eyed women (Laeng et
  al. 2007, replicated with a smaller effect, and not seen in women raters);
  partners resemble the opposite-sex parent's colouring (Little et al. 2003).
  They also carry shared effects of unsettled size: men rate blond hair most
  sexually attractive (Janif et al. 2015); young German women rated darker
  rendered hair above blonde, η² = .30 (Fink et al. 2016, industry-funded);
  bluer irises are rated more attractive in women (Fiala et al. 2026).
- **Distinctness costs little within the natural range.** Each standard
  deviation of shape distinctiveness lowered attractiveness by 0.28 points on
  a 7-point scale, explaining 16% of its variance, with no face beyond 3 SD
  (Lee et al. 2026). In one set of female faces, measured averageness and
  attractiveness were unrelated (Foo et al. 2017, r = −0.01).
- **Mixing ethnicities is a weak lever.** Hönekopp's racially mixed set had
  bi1 about seven points higher, in a comparison across experiments with
  different judges, and same-race judges rated faces more favourably (3.5
  against 3.3). This bears on images.md §6.5's mixed sets.

Two gaps matter. No study found splits private from shared taste in a forced
choice among several faces, the game's format. The nearest is an abstract
(Albohn, Martinez and Todorov 2024, face judgements in general, attractiveness
not mentioned): a yes/no format gave more shared variance than rating scales,
and more diverse face images also increased shared variance. And no study
found tests whether distinctive faces draw more divided ratings.

*(inference)* The binding problem is the generator's identity collapse, not a
shortage of dimensions on which tastes differ. Vary identity and colouring;
hold age, expression, skin condition and contrast fixed, so the added variety
does not come with a spread in the shared cues.

## 3. Methods compared

| Method | Fit | Why |
|---|---|---|
| Declare hair colour, eye colour and face shape (§4.1) | high | Klein's published planner keeps stated attributes; colour binds better than shape (FLUX.1: 0.74 against 0.57 on T2I-CompBench++) and can be measured; values against the model's default fail more often, so pilot both |
| Subjects that never share all their values (§4.2) | high | Removes the prompt twins of §1.1; free; checkable |
| Look-alike reject rule on face embeddings (§4.3) | high | The only mechanical test of identity, once calibrated on human judgements; fits "accept the first that passes"; runs on CPU |
| Apparent age from two estimators; fixed text tested (§4.4) | high | Age is a shared cue; estimators err by about 5 years, so check pools, not single images |
| Model chosen by pilot (§4.5) | high | No ranking covers FLUX 3, Grok Imagine or single portraits; a few dollars per model |
| Undistilled base model, FLUX.2 [klein] Base 4B | medium | Vendor claims more diversity, without numbers; Apache-2.0; needs a GPU with about 13 GB |
| FLUX1.1 [pro] Ultra raw mode | medium | Vendor: raw mode "significantly increases diversity in human subjects" compared with other models; seeded; its candid look may break the style |
| Lower guidance | low | Exposed by FLUX.2 [flex], a few Workers AI models and local models, not by FLUX 3 or Grok; small gain; costs adherence |
| Personal names in the prompt | low | Unknown names add only demographic cues, and famous names are memorised (NAMESAKES); a real-likeness risk |
| A nationality or region under each ethnicity | low | Cannot be checked; shifts apparent age; stereotype risk |
| Candid, amateur or filename cues | low | Vary quality by design, which breaks parity |
| LLM-written free descriptions | low | Undeclared variation that drifts with the LLM; LLMs reach for flattering and stereotyped words (Marked Personas) |
| Sampling methods: CADS, particle guidance, DiverseFlow, noise optimisation, feature self-guidance | low | Open weights and a GPU only, and every gain was measured on generic image features over one prompt, never on face identity across subjects. On FLUX.1 [dev], CADS cut CLIPScore from 32.4 to 18.1 ("Don't Settle at the Mode") and particle guidance raised FID from 20.5 to 30.8 (EDDY's comparison) |
| Choosing the most varied of many candidates | low | Breaks "accept the first that passes"; recast as a reject rule (§4.3) |
| Identity adapters fed synthetic faces: PuLID, InfiniteYou, Arc2Face | low | Two stages; mostly non-commercial weights; real training identities leaked into every synthetic face dataset audited; separation after transfer unmeasured |
| Negative-weight "SameFace Fix" LoRA | low | FLUX.1 [dev] only; users report masculinised faces and quality loss |
| Fairness methods: ITI-GEN (tokens learned from reference images), Fair Diffusion (guidance at inference) | low | Open weights only; they balance category proportions, not identities |

The words "unique" or "diverse" in a prompt: no source found tests them.
*(inference)* A single-image prompt has nothing to differ from.

## 4. Recommended methods

### 4.1 Declare more of the face

**Hair colour** becomes a parameter, with values per ethnicity set from
population data rather than impressions. Data found:

| Population | Black | Dark brown | Light brown | Blond | Red |
|---|---|---|---|---|---|
| UK Biobank, 343,234 participants | 4% | 38% | 42% | 12% | 5% |
| Spain, 380 people | 26% | 64% (brown) | | 10% | 0.3% |
| Five Latin American countries, 6,357 people | about 80% black or brown | | | | |

The UK Biobank shares are computed from the paper's five category counts.
Nothing comparable was found for Asian, Middle Eastern or African populations.

**Eye colour** becomes a parameter with three coarse values (brown; hazel or
green; blue or grey). Which values each ethnicity allows can follow the
frequency of the G allele of rs12913832, the main locus separating blue from
brown eyes, which is common exactly where blue eyes are (Ensembl): Finnish
0.91, British 0.82, Tuscan 0.42, Iberian 0.32, Middle Eastern 0.21, South
Asian 0.07, all African samples 0.03 (West African samples 0 to 0.02), East
Asian 0.002. It predicts blue against brown well and hazel or green poorly:
66% of intermediate eyes were misassigned in a Spanish sample. *(inference)*
Light eyes are plausible for most northern Europeans, a minority of southern
Europeans and almost no East Asians.

Hair and eye colour correlate at r = 0.50 in 6,357 Latin Americans. No joint
hair × eye table was found, so pair the values from the marginals and that
correlation rather than crossing them. *(inference)* A rare combination may
read as unusual, which would confound a measure of taste.

**Red hair** brings fair skin with it. 92% of red-haired UK Biobank
participants carry two MC1R variants, and MC1R also lightens skin
*(general genetics, not re-checked here)*. A red-haired subject would differ
in more than her declared value. Leave red out of the first template, or
accept the coupling.

**Skin tone** stays undeclared: text cannot set it reliably (ITI-GEN: skin
tones are "typically hard to specify by text"). It is measured instead
(§4.3).

**Face shape**, on the axes where tastes differ (§2), as a few neutral values:
for example face width {narrow, medium, wide}, chin {pointed, rounded}, nose
{small, medium, prominent}, lips {thin, medium, full}. Shape is the riskiest
attribute to render. Shape binds worst in object benchmarks (T2I-CompBench++
on FLUX.1: shape 0.57, colour 0.74), and prompt fidelity falls with each added
concept (ConceptMix: DALL-E 3 rendered every requested concept in 83% of
images with one, 17% with five). FLUXSynID found nose shape "inconsistently
realized" on FLUX.1 [dev], and SD 2.1 could not render freckles at all
(SDFD). No benchmark found tests face shape on current models. Pilot each
value; promote to a filterable parameter only values that render at the
template's size, and use at most two face descriptors per subject.

Wording: neutral, measurable words, never evaluative ones ("plain",
"striking", "petite") and nothing that reads as youth ("young", "youthful",
"girl"). Watch bundles that echo a famous look: descriptors alone, with no
name, produced images approximating one celebrity in 8% of SD1.5 outputs
(Fraser 2026: 9 of 111; one model, one target, judged by the author).

### 4.2 Spread the subjects

No two subjects of a pool share all their values, and within an ethnicity two
subjects with the same hair length and texture differ in at least two other
declared values. *(inference: a max-min design rule, not from a source)* With
hair colour, eye colour and two shape slots, each ethnicity has hundreds of
combinations, so 18 subjects can all differ. The check can verify the rule
from `subjects.jsonl`, as image-pipeline.md §3 already has it verify balance.

### 4.3 Reject look-alikes mechanically

**Rule.** Detect and align the face, embed it with a face-recognition model,
and compare it with every image already accepted in the pool. Above a
threshold τ, reject it as a look-alike of that image. Subjects are processed
in their recorded order and candidates in number order, so "accept the first
that passes" still holds, and the check can replay every decision from stored
embeddings. Synthetic face datasets use rules of the same form: DCFace keeps
generated faces only if all are below 0.3 cosine of each other, and Vec2Face
caps sampled identity vectors at 0.3.

**Encoder and licence.** InsightFace's models (buffalo_l, antelopev2) are for
non-commercial research only; commercial licences are on request.
Licence-clean options:

- AuraFace-v1's recognition model, `glintr100.onnx` (Apache-2.0). Its
  repository also bundles four files byte-identical to InsightFace's
  (detector, two landmark models, gender-age), as compared against three
  third-party mirrors. *(inference)* The repository's unfilled Apache-2.0
  template does not cover those, so they keep InsightFace's terms.
- OpenCV's SFace (Apache-2.0).
- dlib's descriptor (public domain).

AuraFace and SFace do not document their training data, and SFace's code base
trains only on web-crawled celebrity datasets; dlib's was trained on about 3
million faces from FaceScrub, the VGG dataset and scraped images. Detect with
OpenCV's YuNet (MIT), which finds faces about 10–300 px across, so downscale
a copy of each portrait for detection first. All of these run on CPU. Node runs ONNX models
through `onnxruntime-node`, but the detection and alignment steps would need
porting.

**Threshold.** Published thresholds do not carry over between encoders, or
even between two models both called ArcFace. They range from 0.21 cosine
(OpenCV's SFace table) to 0.55 (CounterFace's ArcFace R34), and at the same
false-match rate as CounterFace's 0.55, FLUXSynID's ArcFace sits at 0.42. They
also mark "not the same person", which is weaker than "clearly a different
person". In the one study found that mapped a face-recognition distance (Dlib)
onto human judgements of generated faces, 5–13% of answers still said "same
person" just past the verification threshold (Mecke et al. 2024). People call
similar-looking strangers the same person on 12–18% of Glasgow Face Matching
Test trials, and passport officers accepted 14% of look-alike photos. So
calibrate τ on our own images:

- about 200 pairs from a pilot pool, binned by similarity, with the closest
  bins oversampled, mostly within one ethnicity, plus about 20 anchor pairs
  (10 identical images as attention checks, 10 random pairs of different
  ethnicity);
- 10 raters per pair, each giving a five-point same/different answer and a
  0–100 similarity rating;
- a logistic fit of P(same or possibly same) against similarity, per encoder;
  τ goes where it falls to about 5%.

That is about 2,200 ratings, roughly $100 before Prolific's fee and $135–145
with it *(inference from published pay rates)*. NIST found false-match rates
that often differed 10 to 100 times between demographic groups, and
InsightFace's own benchmark scores buffalo_l at 75 on East Asian faces against
95 on Caucasian ones, so τ is checked per ethnicity.

**Set check.** From the stored embeddings, with no model loaded: the largest
pairwise similarity in a set stays below τ, and the Vendi score (an effective
number of distinct faces, from 1 to N) stays above a minimum taken from a
reference. Embeddings rank the very closest pairs poorly (66% agreement with
people in the five closest bins, Sadovnik et al. 2018), so a person also
reviews each published set's closest pairs.

**Limits.** Face-recognition embeddings are trained to ignore hair and much of
colouring, though not fully: hair edits shift some encoders, ArcFace R34 even
on hair colour (CounterFace), and AuraFace and SFace are untested, so the same
face with different declared hair may pass. Crop tightly to the face and test
this in the pilot. The rule covers identity only. Hair and colouring variety
come from §4.1 and are measured from pixels: hair colour from a hair mask
(about 90% five-class accuracy reported), skin as lightness L\* and hue h\*
over a skin mask (Thong et al. 2023, Apache-2.0 code), each with a spread
check per set. Expect rejects: FLUXSynID kept between 16% and 63% of its
identities, depending on encoder and threshold. If re-rolls of a prompt return
much the same face (§1.1), the reject margin in `per_value` must come from
extra subjects, not from `c3` and `c4`.

### 4.4 Measure apparent age

**Instruments.** Two estimators, pinned by file hash or model version:

- MiVOLO v2, whose weights are Apache-2.0. Its mean error is 3.65 years on its
  own benchmark with face and body crops; head-and-shoulders portraits give
  the body branch little, so expect more. An earlier MiVOLO scored 5.26 on
  FLUX.1 [dev] portraits, which mixes generator and estimator error. Its
  bundled detector is AGPL-3.0, so use another detector. MiVOLO-Next's
  weights are not public, and its demo's terms forbid age gating.
- One vision-language model at temperature 0. Gemini 3 Flash averaged 4.32
  years over eight datasets, against MiVOLO's 5.10. VLMs read grey hair as
  age (+3 to +5 years); MiVOLO barely does.

**Bands.** A single estimate errs by about 5 years, so the per-image band must
be wide (reject beyond about ±10 years). The pool check can be tight: for each
age value, the mean estimate within about ±3 years of the parameter, and the
means in order. *(inference from the published errors)*

**Under 21.** Estimators cannot certify it. Most non-LLM estimators call
minors adults 39–100% of the time at 18 (MiVOLO 21%, VLMs 16–29%). In NIST's
tests, keeping fewer than 5% of real 20-year-olds above the line takes a
threshold of 28 to 31, which would reject many 27-year-olds. The human check
in images.md §4 stays; an estimator adds rejects and never passes an image.
People underestimated the age of Asian faces more consistently than that of
Caucasian or Afro-American faces (Clapés et al. 2018: 674 Asian images, rater
ethnicity unknown). *(inference)* The risk is likely highest for East Asian
subjects.

**Fixed text.** Before a template v2 is frozen, test the same subjects in each
arm, scored by both estimators, about 10 images per arm and age, 120 in all
(about $1 on FLUX 3 Klein, $2.40 on Grok Imagine, $5.80 on FLUX 3): the
current text; a neutral closed-mouth expression; without "not retouched";
with "light everyday makeup". Keep the arm whose mean age comes closest
without the waxy "AI look" returning. *(inference)* The smile is the likeliest
single cause, and neutral faces are also what people and estimators read most
accurately.

**One age per set.** Age is a shared cue (§2), so mixing 27, 33 and 39 in a
set may let age decide picks ahead of taste. *(inference)* Prefer sets of one
age value; mix ages only if the norming panel (§6) shows equal shared means
across them.

### 4.5 Choose the model by pilot

No measurement of face diversity or age fidelity was found for FLUX 3, current
Grok Imagine or most models now offered. Run the same 16–24 subjects, with the
§4.1 parameters, through three to five models; rank them on the §4.3 and §4.4
measures, then apply the style and parity rules. That keeps the curator's taste
out of the choice. Images are served as generated (images.md §4), so a model
must produce the template's size exactly, and every pilot and test image is
generated at that size: BFL notes that changing the resolution makes a new
generation, so faces and ages seen at one size need not hold at another.
Controls and prices read 2026-10-28:

| Model | Per image | Sizes | Seed | Rewrites prompts | Rewrite returned | Version pinned |
|---|---|---|---|---|---|---|
| FLUX 3 Image, BFL API | $0.048 at 1k | any width × height, 256–6256 px | no | always | yes, `result.prompt` | no: `latest` only |
| FLUX 3 Image Klein, BFL API | $0.009 at 1k | any width × height, 64–6256 px | yes | yes; no switch in the schema | not documented | not documented |
| FLUX.2 [pro], BFL API | not checked | width × height | yes | unless `disable_pup` | not needed when off | not documented |
| FLUX.2 [pro] preview, Workers AI | $0.03 per first megapixel | width × height | yes | presumably; `disable_pup` cannot be passed | not checked | no: "tracks the latest" |
| FLUX1.1 [pro] Ultra raw, BFL API | about $0.06, unconfirmed | aspect ratio only | yes | off by default | not needed when off | not documented |
| Grok Imagine 1.0, Workers AI | $0.02 | `1k`, `2k` (an upscaled `1k`) | no | assumed | no | no |
| Grok Imagine 1.0, xAI API | $0.02 | `1k`, `1.5k`, `2k` | no | assumed | no | yes: `grok-imagine-image-2026-03-02` |
| FLUX.2 [klein] Base 4B, self-hosted | GPU time | any | yes | no | not needed | yes: fixed weights |

Of these, only the width × height models can make 640 × 640. The FLUX MCP
server used for the trials offers FLUX 3 only at preset sizes, the smallest
square being 768 × 768.

Settings the sources support:

- **FLUX 3:** `grounding: false` for invented people, `width` and `height` set
  to the template's size (whether `aspect_ratio` may be sent with them is
  untested), `result.prompt` logged with every candidate, and a reject for any
  candidate whose rewrite dropped or changed a declared value.
- **Grok Imagine:** `aspect_ratio: "1:1"` stated explicitly (`auto` brings in a
  "thinking upsampler"), `n: 1` until `n` > 1 is tested on Workers AI, whose
  output schema holds one image, and no `quality` field, which xAI documents
  for 2.0 only. xAI swaps a moderated image for a placeholder and still
  charges, so reject placeholders by hash.

Seeds do not add diversity; they make a candidate reproducible. Self-hosted
open weights are the only route where both the weights and the seed stay fixed.

## 5. Findings outside variability

- **Provenance metadata.** BFL's Developer Terms §6(i) forbid anyone to
  "Remove, disable, alter, obscure, any Content Credentials or represent to
  End Users or third parties that (i) Outputs are free of content provenance
  metadata", with no exception; Content Credentials are C2PA metadata or
  watermarks. xAI's acceptable-use policy bars "Stripping, altering or
  circumventing embedded provenance metadata or watermarks", but that text
  comes from a secondary capture of July 2026 (x.ai/legal refused automated
  reads), and Cloudflare's example outputs carry C2PA for Grok Imagine 2.0 and
  none for 1.0. The design used to strip all metadata by re-encoding and to
  fail a served file that carried C2PA (images.md §4 step 5 and §8, as of
  commit e4c8bdd), which breached BFL's terms. The stripping guarded against
  a prompt written into the file, which does not hold up. Players never see
  metadata; every accepted image shows its parameters (images.md §4 step 3),
  so a prompt in the file tells a script nothing its pixels do not; and any
  rule on content is open to a script anyway (scoring §9). None of the outputs
  examined, FLUX 3's or Grok 2.0's, carries the prompt. Resolved on
  2026-10-28: images are generated at the size they are served and served
  byte for byte, so the credentials reach players intact.
- **AI disclosure.** BFL's Developer Terms §6(i)(ii) and xAI's Enterprise
  Terms (secondary capture) forbid presenting output as human-made; xAI's
  acceptable-use policy (also secondary) bars "not being transparent regarding
  your use of AI"; and the FLUX Kommunity License §2(e) requires AI disclosure
  where the law does. None requires a label outright. *(inference)* A visible
  statement on the page meets all of them.
- **Grok model identity.** images.md §9 said Workers AI's
  `xai/grok-imagine-image` is xAI's `grok-imagine-image-2.0`. It is
  `grok-imagine-image`, which xAI calls 1.0; 2.0 is a separate $0.04 model,
  whose Workers AI ID takes no `n`. Corrected in images.md §9.
- **Pinning.** Workers AI cannot pin a Grok version: it has no dated ID, and
  its response names no serving model. xAI's API can, by the dated alias, and
  reports the serving model in each response. FLUX 3 cannot be pinned either:
  `latest` is its only version, and BFL changed the model in place after
  launch. Both noted in image-pipeline.md §4.
- **Training on outputs.** BFL's website terms forbid training any other model
  on outputs; the Developer Terms do so within a clause on competing products,
  and the FLUX Kommunity License for similar models. *(inference)* Fine-tuning
  an estimator or a LoRA on pool images from BFL models would likely breach
  them.
- **Biometric clauses.** BFL's Developer Terms define biometric data to include
  data on "behavioral characteristics ... capable of uniquely identifying a
  natural person"; their §10(b) requires a privacy notice for biometric
  processing and bars using FLUX models to "build, enhance, or augment any
  facial recognition or surveillance system". The FLUX Kommunity License,
  which covers FLUX 3 Klein's weights, bars "biometric processing" of the
  model and of "any data produced by" it, without defining the term. Both bear
  on the game's identity-verification use and on running face embeddings over
  any BFL output, though the faces are synthetic, not natural persons. Neither
  has had a legal read.
- **Privacy.** People prefer faces that resemble their own, more so for faces
  of their own sex (DeBruine 2004), and close relations share taste more than
  strangers do (Bronstad and Russell 2007). *(inference)* A woman's picks among
  women's faces may partly encode her own appearance, and relatives would be
  the likeliest impostors under taste-based verification. Both belong in
  images.md §6.5.

## 6. Next steps, cheapest first

1. **Measure the six trials** (free): pairwise identity similarity, hair colour
   and skin L\*, and age from both estimators. Replaces judgement by eye with
   numbers. Needs local Python packages, none installed yet.
2. **Test the planner** (about $0.40 on FLUX 3): one subject's prompt three
   times with grounding off, then the other five trial prompts once each,
   comparing `result.prompt`. Identical rewrites of one prompt show the
   planner is deterministic; the same hair, eye and face wording across
   subjects shows the shared default of §1.2. Needs a BFL API key, since the
   MCP server does not return `result.prompt`.
3. **Fixed-text age test** ($1–6 depending on the model, §4.4).
4. **Model pilot** with the §4.1 parameters (a few dollars per model, §4.5).
5. **Human calibration of τ** ($135–145, §4.3).
6. **Norming panel** (about $320–345 before attrition, at Prolific's
   recommended $12 an hour plus its 33–43% fee, *(inference)*): 60 raters,
   women and men, rating 30–50 pool images in two sessions. It gives parity
   bands, the private share of rated taste, and age as people see it. A part
   run as four-way picks would measure the private share in the game's own
   format (§2).

Then a template v2 (images.md §6) and the new reject reasons and checks
(image-pipeline.md §2.4, §3).

## 7. Open questions

- **Is the game commercial, and what is its revenue?** A public game is
  outside both FLUX licences' non-commercial purpose either way, because they
  exclude use that affects end users, so FLUX 3 Klein output would rest on the
  Kommunity License's exception for users under US$5M revenue. InsightFace's
  free licence covers non-commercial research only. Prolific charges a 33.3%
  academic or 42.857% corporate fee.
- **Does the hosted FLUX 3 planner decode greedily?** Step 2 of §6 answers it.
- **Grok `n` > 1.** Does Workers AI return all `n` images, and do images from
  one request vary less than images from separate requests?
- **Private taste in a forced choice.** No study found measures it. The game
  itself must, or a norming panel run as four-way picks rather than ratings.
- **Face-shape words.** Do they render on FLUX 3 or Grok at the template's
  size, and keep parity?
- **Colour frequencies** for East, Southeast and South Asian, Middle Eastern
  and African populations: only allele frequencies were found.
- **Hair texture and ethnicity.** Whether the models tie them: no literature
  found.
- **Distinctiveness and private taste.** Whether distinctive faces draw more
  divided ratings, which would favour spreading identities further.

## Sources

**§1.2 Planners.**
[FLUX 3 API reference](https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3.md) ·
[FLUX 3 text to image](https://docs.bfl.ml/flux_3/flux3_image_generate.md) ·
[BFL prompt reference](https://docs.bfl.ai/guides/prompting_unified_reference.md) ·
[BFL prompting basics](https://docs.bfl.ml/guides/prompting_unified_basics.md) ·
[FLUX 3 Image Klein prompt upsampler](https://huggingface.co/black-forest-labs/flux-3-image-klein-pup) ·
[Klein upsampling examples](https://github.com/black-forest-labs/flux-3-image-klein/tree/main/examples/upsampling) ·
[xAI SDK, image.py](https://github.com/xai-org/xai-sdk-python/blob/main/src/xai_sdk/image.py) ·
[xAI proto, removal of up_sampled_prompt](https://github.com/xai-org/xai-proto/commit/e090250)

**§1.3 Earlier models.**
[FairFaceGen](https://arxiv.org/abs/2507.20782) ·
[FLUXSynID](https://arxiv.org/abs/2505.07530) ·
[DisCo](https://arxiv.org/abs/2510.01399) ·
[OpenAI, image generation](https://developers.openai.com/api/docs/guides/image-generation) ·
[Rosenberg et al.](https://arxiv.org/abs/2309.07277) ·
[aesthetic-reward collapse](https://arxiv.org/abs/2410.08315) ·
[preference-tuned FLUX faces](https://arxiv.org/abs/2512.24146) ·
[Gandikota and Bau](https://arxiv.org/abs/2503.10637) ·
[BFL, FLUX.2 [klein]](https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence) ·
[SDXL identities "overly similar"](https://arxiv.org/abs/2508.10672) ·
[Dunn et al. 2026](https://doi.org/10.1111/bjop.70063) ·
[Alvero et al. 2026](https://arxiv.org/abs/2610.22553) ·
[Potter et al. 2007](https://pubmed.ncbi.nlm.nih.gov/17694928/)

**§1.4 Age.**
[Ganel 2015](https://pubmed.ncbi.nlm.nih.gov/25855200/) ·
[Ganel and Goodale 2021](https://www.nature.com/articles/s41598-021-02380-2) ·
[Ganel, Sofer and Goodale 2022](https://www.nature.com/articles/s41598-022-27009-w) ·
[Clapés et al. 2018, APPA-REAL](https://openaccess.thecvf.com/content_cvpr_2018_workshops/papers/w48/Clapes_From_Apparent_to_CVPR_2018_paper.pdf) ·
[Voelkle et al. 2012](https://pubmed.ncbi.nlm.nih.gov/21895379/) ·
[Russell et al. 2019](https://pubmed.ncbi.nlm.nih.gov/30073658/) ·
[Porcheron et al. 2013](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0057985) ·
[Gunn et al. 2009](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0008021) ·
[age in text-to-image models](https://arxiv.org/abs/2502.03420)

**§2 Taste.**
[Kramer et al. 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6097668/) ·
[Leder et al. 2016](https://www.frontiersin.org/articles/10.3389/fnhum.2016.00155/full) ·
[Hönekopp 2006](https://www.gwern.net/doc/psychology/2006-honekopp.pdf) ·
[Germine et al. 2015](https://www.ocf.berkeley.edu/~knakayama/wp-content/uploads/2019/03/185Germine2015.pdf) ·
[Hehman et al. 2017](https://www.columbia.edu/~ms4992/Pubs/2017_Hehman-Sutherland-Flake-Slepian_JPSP.pdf) ·
[Kościński 2010](https://doi.org/10.1556/jep.8.2010.1.4) ·
[Zhan et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8162177) ·
[Stephen et al. 2009](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0005083) ·
[Laeng et al. 2007, via Gračanin et al. 2021](https://www.pt.ffri.hr/pt/article/view/689) ·
[Little et al. 2003, via Marcinkowska and Rantala 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC10480955/) ·
[Janif et al. 2015](https://research.usc.edu.au/esploro/outputs/journalArticle/Are-Preferences-for-Womens-Hair-Color/99629736302621) ·
[Fink et al. 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01893/full) ·
[Fiala et al. 2026](https://pearl.plymouth.ac.uk/psy-research/1212) ·
[Lee et al. 2026](https://strathprints.strath.ac.uk/96745/) ·
[Foo et al. 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5290736/) ·
[Albohn, Martinez and Todorov 2024](https://www.chicagobooth.edu/research/center-for-applied-artificial-intelligence/research/our-faculty-research/2023/determinants-of-shared-and-idiosyncratic-contributions-to-judgments-of-faces)

**§3 Methods compared.**
[T2I-CompBench++](https://arxiv.org/abs/2307.06350) ·
[NAMESAKES](https://arxiv.org/abs/2606.20155) ·
[Marked Personas](https://arxiv.org/abs/2305.18189) ·
[CADS](https://arxiv.org/abs/2310.17347) ·
[Particle Guidance](https://arxiv.org/abs/2310.13102) ·
[DiverseFlow](https://arxiv.org/abs/2504.07894) ·
["Don't Settle at the Mode"](https://arxiv.org/abs/2606.27371) ·
[EDDY](https://arxiv.org/abs/2605.06553) ·
[InfiniteYou, with PuLID-FLUX](https://arxiv.org/abs/2503.16418) ·
[Arc2Face](https://arxiv.org/abs/2403.11641) ·
[leakage in synthetic face datasets](https://arxiv.org/abs/2410.24015) ·
[SameFace Fix LoRA](https://civarchive.com/models/766608) ·
[ITI-GEN](https://arxiv.org/abs/2309.05569) ·
[Fair Diffusion](https://arxiv.org/abs/2302.10893) ·
[FLUX1.1 [pro] Ultra raw](https://docs.bfl.ml/flux_models/flux_1_1_pro_ultra_raw.md)

**§4.1 Declared parameters.**
[UK Biobank hair colour](https://www.nature.com/articles/s41467-018-07691-z) ·
[Spanish pigmentation sample](https://pmc.ncbi.nlm.nih.gov/articles/PMC11507238/) ·
[CANDELA, Adhikari et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6341102/) ·
[Ensembl, rs12913832](https://rest.ensembl.org/variation/human/rs12913832?pops=1;content-type=application/json) ·
[ConceptMix](https://arxiv.org/abs/2408.14339) ·
[SDFD](https://arxiv.org/abs/2404.17255) ·
[Fraser 2026](https://arxiv.org/abs/2602.18533)

**§4.3 Look-alikes.**
[DCFace](https://arxiv.org/abs/2304.07060) ·
[Vec2Face](https://arxiv.org/abs/2409.02979) ·
[InsightFace](https://github.com/deepinsight/insightface) ·
[AuraFace-v1](https://huggingface.co/fal/AuraFace-v1) ·
[OpenCV SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) ·
[OpenCV face tutorial, SFace thresholds](https://github.com/opencv/opencv/blob/4.x/doc/tutorials/dnn/dnn_face/dnn_face.markdown) ·
[OpenCV YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) ·
[dlib models](https://github.com/davisking/dlib-models) ·
[onnxruntime-node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) ·
[CounterFace](https://arxiv.org/abs/2407.13922) ·
[Mecke et al. 2024](https://arxiv.org/abs/2409.12801) ·
[Glasgow Face Matching Test norms](https://pmc.ncbi.nlm.nih.gov/articles/PMC6001712/) ·
[White et al. 2014](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0103510) ·
[Sadovnik et al. 2018](https://arxiv.org/abs/1806.05252) ·
[NIST FRVT Part 3](https://www.nist.gov/news-events/news/2019/12/nist-study-evaluates-effects-race-age-sex-face-recognition-software) ·
[Vendi score](https://arxiv.org/abs/2210.02410) ·
[hair colour from segmentation](https://scitepress.org/Documents/2019/72505/) ·
[Thong et al. 2023](https://arxiv.org/abs/2309.05148) and
[code](https://github.com/SonyResearch/apparent_skincolor) ·
[Prolific pricing](https://researcher-help.prolific.com/en/articles/445239-what-is-your-pricing)

**§4.4 Age.**
[MiVOLO](https://github.com/WildChlamydia/MiVOLO) ·
[MiVOLO v2 weights](https://huggingface.co/iitolstykh/mivolo_v2) ·
[MiVOLO-Next demo terms](https://huggingface.co/spaces/WildChlamydia/mivolo-next-demo) ·
[VLMs against age estimators](https://arxiv.org/abs/2602.07815) ·
[attribute edits against age estimators](https://arxiv.org/abs/2602.19539) ·
[NIST IR 8525](https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8525.pdf)

**§4.5 Models.**
[BFL pricing](https://bfl.ai/pricing) ·
[FLUX 3 Image Klein](https://docs.bfl.ml/flux_3/flux3_image_klein.md) ·
[FLUX.2 [pro] API](https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bpro%5D.md) ·
[FLUX.2 [pro] preview on Workers AI](https://developers.cloudflare.com/ai/models/black-forest-labs/flux-2-pro-preview/) ·
[Grok Imagine on Workers AI](https://developers.cloudflare.com/ai/models/xai/grok-imagine-image/) ·
[xAI, grok-imagine-image](https://docs.x.ai/developers/models/grok-imagine-image) ·
[xAI, model aliases](https://docs.x.ai/developers/models) ·
[xAI, image generation](https://docs.x.ai/developers/model-capabilities/images/generation) ·
[xAI image proto](https://github.com/xai-org/xai-proto/blob/main/proto/xai/api/v1/image.proto) ·
[BFL release notes](https://docs.bfl.ml/release-notes.md)

**§5 Outside variability.**
[BFL Developer Terms](https://bfl.ai/legal/developer-terms-of-service) ·
[BFL Terms of Service](https://bfl.ai/legal/terms-of-service) ·
[FLUX Kommunity License](https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md) ·
[xAI acceptable-use policy, secondary capture](https://conductatlas.com/platform/xai/xai-acceptable-use-policy/provision/CA-P-074639/stripping-provenance-metadata-or-watermarks-prohibited/) ·
[xAI Enterprise Terms, secondary capture](https://conductatlas.com/platform/xai/xai-enterprise-terms-of-service/provision/CA-P-074729/xai-assigns-output-rights-to-customer/) ·
[Grok Imagine 2.0 example output](https://examples.aig.cloudflare.com/xai/grok-imagine-image-2.0/simple-generation.jpg) ·
[DeBruine 2004](https://pubmed.ncbi.nlm.nih.gov/15451700/) ·
[Bronstad and Russell 2007](https://pubmed.ncbi.nlm.nih.gov/18265847/)
