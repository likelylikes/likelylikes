# likelylikes — image pipeline

Status: partly implemented. The tools that carry out
[images.md](images.md) §4–§5, from a template file to frozen sets in R2.
Implemented under `tools/images/`: `sheets` (§2.3a), `accept` and `reject`
(§2.4a), `encode` without signing (§2.5), `freeze` (§2.7) and the offline
check (§3). The rest is specification.

## Summary

- Seven steps, each a script: `subjects`, `generate` (or `manual`, or
  `sheets`), `curate`, `encode`, `upload`, `freeze`, and the check. Only
  curation needs a person.
- `encode` scales the generator's file down to the served size and signs a
  C2PA manifest that carries the generator's own, where it has one, so
  provenance survives the resize. Signing is not implemented yet; until it
  is, `encode --unsigned` makes prototype images that no published set may
  hold.
- The **subject ID** joins everything: prompt, candidate files, curation
  decisions and images. It never appears in a prompt.
- Generation runs through an API, or by hand in a web app such as Grok
  Imagine with a helper that names each download for its subject. Both write
  the same files, so every later step is the same.
- Steps resume: each skips the work already recorded and never rewrites a
  record, except that `sheets` raises a sheet pool's `per_value` in
  `design.json` to the subjects its sheets hold. The steps that spend money
  or write to R2 ask first.
- Manifests and served files go in git; a served file is about 35 KB, so a
  pool's served files are a few megabytes, and prototypes serve them from
  the repo. Generated files stay in a local working directory until
  `upload`. Sheets are the exception: few and the source of many subjects,
  they go in git with the prompt as typed, as source material for research
  and prototypes.

## 1. Layout

```
images/
  templates/<template>.v<n>.json      template
  pools/<template>.v<n>/
    design.json                       pool design
    subjects.jsonl                    one line per subject, with its prompt
    generations.jsonl                 one line per candidate
    curation.jsonl                    one line per decision
    images.jsonl                      one line per accepted image
    sheets/<sheet>.<ext>              sheet originals, byte for byte (§2.3a)
    sheets/<sheet>.md                 the prompt as typed into the app
    served/<sha256>.<ext>             served images, resized (§2.5)
  sets/<set_id>.json                  frozen set
work/<template>.v<n>/                 not in git
  candidates/<subject>-c<k>.<ext>     generator originals
```

The fields of each record are in [images.md](images.md) §7. Logs are JSON
Lines, appended to and never edited, so concurrent work merges line by line.
A decision is changed by appending a new one; the last line for a candidate
wins.

**Subject IDs** are `s001`, `s002`, … within a pool, assigned once by
`subjects`, or by `sheets` for a sheet template, and never reused. Template id, version and subject ID together
name a subject anywhere else.

## 2. Steps

The scripts are Node and TypeScript under `tools/images/`, run as
`npm run images:<step> -- --pool <template>.v<n>`; each takes `--help`.
Node 22.18 or later runs the TypeScript as it is, with no build step.
`npm run check` typechecks the tools, runs their tests and runs the offline
check (§3). Images are decoded and encoded with sharp (libvips).

Every seeded order is the one Python gives: `random.Random(seed).shuffle`
on the items in the stated order. The tools carry a port of CPython's
MT19937 for it, tested against CPython's output, so any record can be
reproduced in one line of Python.

### 2.1 `subjects`: template and design to prompts

Reads the template and `design.json`, writes `subjects.jsonl`.

- For each value of the design's stratifying parameter (`ethnicity` for the
  first template), choose that value's number of subjects, from `per_value`,
  out of the combinations of the balanced parameters, minus the template's
  exclusions. A value not in `per_value` gets none yet. Each value of each
  balanced parameter appears equally often, to within one, and no
  combination repeats until every combination has appeared once. A shuffle
  seeded from the design breaks ties.
- Number the subjects in shuffled order, not by parameter, so that drift
  during generation does not line up with any parameter.
- Render each prompt by replacing every `{name}` with its value's fragment.
  An unknown or unfilled slot is an error.
- Never rewrites an existing subject. Raising a count in `per_value`, or
  adding a value, appends the new subjects with new IDs.

A line: `{"subject":"s017","values":{"ethnicity":"black","age":"33","hair_length":"long","hair_texture":"curly"},"prompt":"Head-and-shoulders portrait photograph of a 33-year-old Black woman with long curly hair, …"}`

### 2.2 `generate`: prompts to candidates, through an API

For each subject with no candidates yet, the candidates images.md §4 asks
for, with the template's model and settings: one request with `n` where the
model takes it, otherwise one request per candidate, numbered in the order
sent.

- Saves each returned image byte for byte as
  `candidates/<subject>-c<k>.<ext>`.
- Appends one line per image to `generations.jsonl`: subject, candidate
  number, SHA-256, the width, height and format read from the file,
  provider, model, settings, request ID if the response has one, time.
- `--more <subject>` asks for two more for a subject whose candidates all
  failed, numbered on from the last.
- Before the first request, prints the number of images and the estimated
  cost (count × listed price) and waits for a yes. `--dry-run` prints the
  requests and stops.
- Retries network and rate-limit errors with backoff. A content-policy
  refusal is logged as a generation with no file and the refusal's message.
- Credentials come from the environment, never from files:
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for Workers AI,
  `BFL_API_KEY` for BFL's API.

Models sit behind one function, `generate(prompt, settings)`, which returns
a list of `{bytes, ext, requestId?}`. Workers AI comes first, via
`POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run` with
`{"model":"<model id>","input":{…}}`. BFL's API (for FLUX 3 Image), xAI's
own API and Replicate are further adapters. Request
`response_format: "b64_json"` where offered, so no image URL can expire before
it is fetched.

### 2.3 `manual`: prompts to candidates, by hand

For a web app with no API, such as Grok Imagine in a browser. The helper
does the bookkeeping; the person generates and downloads.

- At start it asks for the service and the model name the app shows, and
  records them with the date on every line. It shows the template's
  settings, such as the 1:1 aspect ratio and the resolution, for the person
  to set in the app.
- It takes the subjects with no candidates in ID order. For each, it puts
  the prompt on the clipboard (`clip.exe` under WSL, `pbcopy` on macOS,
  `wl-copy` or `xclip` on Linux) and prints the subject and prompt.
- It watches the downloads folder (`--downloads`, required). Each new image
  file is moved, unchanged, to `candidates/<subject>-c<k>.<ext>` and logged
  to `generations.jsonl` like an API generation, with provider `manual` and
  the file's width, height and format. It stops at the first download that
  is not square, is smaller than the served size, or differs in size from
  the pool's earlier candidates, since the rest will not do either. Partial
  downloads (`.crdownload`, `.part`, `.tmp`) are ignored until complete.
- Keys: `n` for the next subject, `u` to undo the last move, `s` to skip, `q`
  to quit. Quitting and restarting resumes at the first subject with no
  candidates.
- Files that arrive while no subject is active stay in the downloads folder.

Candidate numbers follow download order, so download the candidates in the
order the app shows them. "First that passes" (images.md §4) then means first
on screen.

Under WSL2 the Windows downloads folder, `/mnt/c/Users/<you>/Downloads`,
does not deliver file-change events from Windows programs. The helper polls
it, every half second, instead of watching.

### 2.3a Sheets

For a template with a `sheet` (images.md §3), a generation is one image of
rows × columns cells, made by hand in an app or through an API. Sheets come
before subjects: the prompt names the values, and the cells become the
subjects.

```
npm run images:sheets -- --pool women-profiles.v1 work/aistudio/*
```

- Each image is a JPEG, PNG or WebP download, with the prompt as typed into
  the app beside it in a file of the same name ending `.md` or `.txt`;
  prompt files and folders given among the images are skipped, so a folder
  can be passed whole. Paths are read from where `npm` was run.
- The prompt must be the template's prompt with one value per slot; the
  step finds those values, so it never asks for them. The comparison folds
  what an editor changes on a paste: whitespace and line endings, a byte
  order mark, typographic quotes and dashes, Unicode compatibility forms.
  It refuses a prompt that matches no combination, naming the first
  character that differs, with anything invisible escaped. A typing slip in
  the app shows up here.
- A sheet's cells must be square, and the sheet as large as the pool's
  other sheets; the sheet itself need not be square. Grid line k of n over
  a side of s pixels lies at round(k·s/n), so a 3 × 3 or 5 × 5 grid works on
  a 4096-pixel sheet. Cells less the inset must be at least the served size.
- The step checks that the cells sit on the grid lines: at each internal
  line it takes the mean brightness step between neighbouring pixel columns
  (or rows) at offsets −8 to 8, and the step across the line must be the
  largest and at least twice their median. Where the line falls between
  two pixels, a seam on either side counts, and the template's inset must
  be at least 2 to cover that pixel. A grid off by a pixel peaks elsewhere;
  an image with no grid has no peak. It refuses a sheet that fails, with the
  numbers, and a sheet whose EXIF orientation says its pixels are stored
  rotated.
- The generation time is the latest RFC 3161 time-stamp in the file's C2PA
  manifests, read from the DER of its TSTInfo, with a JPEG's APP11 segments
  joined first; it is written to the second. A new sheet without one needs
  `--time` with its zone and a real calendar time, such as
  `2026-11-02T07:21:09Z`, and `--time` is refused for a sheet that has one.
  The manifest itself is not validated.
- A sheet already in the pool, by SHA-256, is skipped before anything else,
  so the step can be re-run on a folder, the same command included. Every
  new sheet is verified before anything is written.
- Sheets are numbered `g01`, `g02`, … after the pool's last, in generation
  order, and copied byte for byte to `images/pools/<pool>/sheets/<sheet>.<ext>`,
  in git, with the prompt file beside it as `<sheet>.md`. A file already
  there with the same bytes is fine; one with other bytes stops the step,
  in a dry run too.
- It writes the sheets, then the design, then `generations.jsonl`, then
  `subjects.jsonl`, so a run cut short can be repeated: the next run first
  rebuilds any subject a generation line names but `subjects.jsonl` lacks,
  from the line's sheet and crop and the sheet's prompt file.
- The design's `per_value` is raised for each value the pool now holds more
  subjects of than it says, since a sheet pool's design records what its
  sheets hold.
- Their subjects are made then, one per cell, numbered after the pool's last
  subject in the order `random.Random(seed).shuffle` gives the cells listed
  sheet by sheet, row by row, where the seed is the design's plus the number
  of subjects already in the pool. Each is logged with candidate 1, the
  sheet's hash and size, the cell's crop (its top left on the grid lines,
  its side the floor of the cell size), the template's provider, model and
  settings, how the file was obtained (`--via`, default `browser download`)
  and the time.
- A rejected cell is not regenerated alone; its subject stays without an
  image.

### 2.4 `curate`: candidates to decisions

A local web page served from `localhost`. It never leaves the machine.

- **Shape and size first.** A candidate that is not square, is smaller than
  the served size, or differs in size from the pool's other candidates is
  rejected as `defect`, with a note, before any candidate of its subject is
  offered. Browsers scale images, so the curator could not see it.
- **Subject view.** One subject at a time, with its parameter values and
  stated age. It offers only the lowest-numbered undecided candidate, with
  accept, or reject with one of images.md §4's reasons: `defect`, `style`,
  `parameters`, `age`, `likeness`, plus a note. Accepting asks for the
  template's tags, recorded with the accept, and closes the subject. This
  enforces "first that passes".
- **Pool view.** Every accepted image of the pool in one grid, filterable by
  parameter, for spotting style outliers. Rejecting an accepted image here
  reopens its subject at the next candidate and withdraws its image, if
  `encode` has made one. It is refused for an image in a published set.
- Appends each decision to `curation.jsonl`.
- Lists the subjects whose candidates have all failed, for `generate --more`
  or another `manual` pass.

### 2.4a `accept` and `reject`: decisions from the command line

```
npm run images:reject -- --pool <pool> --subjects s009,s020 --reason age --note "<why>"
npm run images:accept -- --pool <pool> --all --note "<who decided, and why>"
npm run images:accept -- --pool <pool> --subjects s009 --note "<who looked, and what they saw>"
```

For a pool its owner decides to use before the curate page exists or before
anyone curates it. Each appends to `curation.jsonl` like the curate step; the
note, required, records who decided and on what.

- `reject` rejects each named subject's candidate (`--candidate`, default 1)
  with one of images.md §4's reasons. A candidate with an image withdraws it,
  and the step names the sets that held it, which must be frozen again; it
  is refused for an image in a published set.
- `accept --all` accepts every subject nobody has decided on yet, on its first
  candidate, which is what "first that passes" picks when nobody looks. A
  subject with any decision, such as one held back by a reject, is left as
  it is.
- `accept --subjects` accepts each named subject's candidate, overturning an
  earlier reject of it; it is refused when a lower-numbered candidate is not
  rejected or another is accepted.
- Both forms of `accept` are refused for a template that declares tags,
  since an accept must record them.

### 2.5 `encode`: accepted candidates to served images

For each accepted candidate with no image record:

- confirm that its SHA-256 is the one `generations.jsonl` recorded. A
  refusal means the file changed after curation: it names the subject, so
  the curator rejects the candidate in the pool view and the subject reopens
  (§2.4). The check's rule that every accept has an image (images.md §8)
  stops a subject from dropping out unnoticed;
- decode, crop to the cell less the template's inset if it came from a
  sheet, convert to sRGB, scale down to the template's served size, and
  encode in its served format at its quality. A crop adds a `c2pa.cropped`
  action before `c2pa.transcoded`;
- sign a C2PA manifest for the result with `c2patool` or its library,
  passing the original as the parent (`--parent`; without it, c2patool makes
  the resized file its own parent and silently drops the generator's
  manifest). The manifest holds the original as its parentOf ingredient,
  with its instance ID set to the original's SHA-256 and the original's
  manifest carried unchanged where it has one; a `c2pa.opened` action
  referencing that ingredient, then `c2pa.transcoded` for the scale-down and
  conversion; no thumbnails, which the tools add by default; and an RFC 3161
  time-stamp. The private key comes from a path in the environment, never
  from the repo;
- hash the served file and the original, write the served file to
  `images/pools/<pool>/served/<sha256>.<ext>`, and append the image record
  (§7 of images.md), with the encoder and its version, to `images.jsonl`.

A published image is never re-encoded: a new encoder or a new signature
gives new bytes, and new bytes are a new image.

**As implemented.** sharp decodes at its default level for untrusted input,
which refuses a corrupt file, and refuses an original whose EXIF orientation
says its pixels are stored rotated. It processes in sRGB, so a 16-bit
wide-gamut original is converted rather than read as sRGB numbers; crops;
scales with Lanczos-3; and encodes WebP at the template's quality with
effort 4. The output carries no metadata, and the same input and sharp
version give the same bytes. Each image record is appended as its file is
written, so a run cut short leaves no file without its record. A candidate
it must refuse, such as one whose original changed, is named at the end
while the rest are encoded. It refuses to add to a pool encoded by another
encoder version. Signing is not implemented, because there is no signing
certificate yet (images.md §9), so the step runs only as
`npm run images:encode -- --pool <pool> --unsigned`, which records
`"signed": false`. Such an image is a prototype: the check refuses it in a
published set, and signing it later makes a new image.

### 2.6 `upload`: files to R2

Puts every served file and original that R2 lacks under `served/<sha256>` and
`original/<sha256>`, each with its content type set from its format, using
`wrangler r2 object put --remote --content-type <type>` (Wrangler 4 writes to
local storage without `--remote`). It lists what it will upload and waits for
a yes. It never deletes or overwrites an object.

### 2.7 `freeze`: filter to set

Takes a pool, a filter, N and a `set_id`, and writes `sets/<set_id>.json`.

```
npm run images:freeze -- --pool <pool> --set <set_id> --n <N> [--filter ethnicity=irish,italian] [--seed <int>] [--large]
```

- Chooses N of the matching images not withdrawn (§2.4) as images.md §5
  says, with a selection seed, which it draws and records when none is
  given. The set records the images it chose from (`considered`: their
  hashes, in pool order), so re-running it gives the same set whatever
  happens to the pool later: new images, a withdrawal, or a log whose lines
  a merge put in another order.
- The choice: shuffle the considered images with
  `random.Random(seed).shuffle`, then take N one at a time, each the first in
  shuffled order whose values for the free parameters (those the filter does
  not fix to one value) have been taken least so far, summed over those
  parameters. With one free parameter that spreads the set as evenly as the
  images allow; with several, a greedy choice can miss an even split when a
  combination is scarce.
- N is 12 to 16; `--large` allows more, up to the pool, and records the set
  as large (images.md §5).
- Refuses when fewer than N images match, and refuses to overwrite an
  existing set file: a set is frozen. It writes `"published": null`; the
  publication date is set when the set is published.

## 3. The check

images.md §8 is the definition. The offline part runs inside
`npm run check`, from the manifests and the files in git
(`npm run images:check` runs it alone). The online part runs as
`npm run check:r2` before every deploy, against the objects in R2, and the
delivery check of §8 runs after every deploy; neither is implemented yet.
Beyond §8, the offline part checks that:

- every template and design is well formed: the fields of images.md §7
  with the right types; a square served size; every prompt slot a
  parameter and every parameter a slot, with no two values of one sharing a
  fragment, so the prompt always tells the values apart; and a design
  naming only the template's parameters and values;
- every subject's prompt is its template rendered with its values;
- each value's subjects meet the design: the count in `per_value`, and the
  balance rule of §2.1, read as: within each value, each possible value of
  each balanced parameter, and each allowed combination of them, appears
  equally often to within one, where "allowed" applies the exclusions with
  the stratify value included;
- every sheet a subject or generation names is in git with its recorded
  SHA-256, its prompt file is its subjects' prompt as the step compares
  them, its generations agree on its hash, size, format and time, each of
  its cells has exactly one subject with exactly one generation, and every
  crop is its cell's; no file in `sheets/` lacks a record;
- the size rules of images.md §8 apply to candidates not rejected, since
  the tools reject a file of the wrong size before anyone sees it;
- every image has an accept somewhere in the curation log, and its served
  region is the one its template gives today, so an inset changed after
  encoding shows;
- a set's considered list is in pool order, each an image of its pool that
  matches its filter; the check takes the list as `freeze` wrote it;
- every served file is in git and readable, its content matches its name
  and record, and no served file lacks an image record;
- the logs refer only to subjects and candidates that exist, and nothing
  appears twice.

## 4. Open questions

- **Workers AI with `n` > 1.** Cloudflare's listing shows a response with one
  image URL. How several images come back is untested.
- **Model drift.** On Workers AI, `xai/grok-imagine-image` names no version
  and its response names no serving model; the app names none either. A
  change partway through a pool then shows only as a style shift in the pool
  view, and generating a pool in one run keeps the window small. xAI's own API
  closes the gap: the dated alias `grok-imagine-image-2026-03-02` "will not be
  updated", and each response names the model that served it. FLUX 3 has no
  such fix: `latest` is its only version, and BFL changed the model in place
  after launch ([image-variability.md](image-variability.md) §5).
- **App downloads.** Unverified: whether a web app downloads at full size,
  one file per image and under what names, and whether a download is the
  model's file unchanged, with the same C2PA manifest as the API and no
  metadata naming the account. Inspect the first download.
- **Output terms** for this use: partly read, none reviewed by a lawyer; see
  [image-variability.md](image-variability.md) §5. Google's terms for
  Gemini output, which the `women-profiles` sheets are, are unread.
- **Signing.** `encode` signs nothing yet; it needs the certificate of
  images.md §9 and `c2patool` or the C2PA library. Prototype images made
  before then are replaced, not re-signed, when it lands.
