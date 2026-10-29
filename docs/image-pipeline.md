# likelylikes — image pipeline

Status: specification, not implemented. The tools that carry out
[images.md](images.md) §4–§5, from a template file to frozen sets in R2.

## Summary

- Seven steps, each a script: `subjects`, `generate` (or `manual`),
  `curate`, `register`, `upload`, `freeze`, and the check. Only curation needs
  a person.
- Images are generated at the size they are served and never re-encoded: the
  generator's file is the served file, metadata included.
- The **subject ID** joins everything: prompt, candidate files, curation
  decisions and images. It never appears in a prompt.
- Generation runs through an API, or by hand in a web app such as Grok
  Imagine with a helper that names each download for its subject. Both write
  the same files, so every later step is the same.
- Steps resume: each skips the work already recorded and never rewrites a
  record. The steps that spend money or write to R2 ask first.
- Manifests go in git; generated files stay in a local working directory
  until `upload`.

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
  sets/<set_id>.json                  frozen set
work/<template>.v<n>/                 not in git
  candidates/<subject>-c<k>.<ext>     generated files, served unchanged
```

The fields of each record are in [images.md](images.md) §7. Logs are JSON
Lines, appended to and never edited, so concurrent work merges line by line.
A decision is changed by appending a new one; the last line for a candidate
wins.

**Subject IDs** are `s001`, `s002`, … within a pool, assigned once by
`subjects` and never reused. Template id, version and subject ID together
name a subject anywhere else.

## 2. Steps

The scripts are Node and TypeScript under `tools/images/`, run as
`npm run images:<step> -- --pool <template>.v<n>`.

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
for, with the template's model and settings, at the template's width and
height: one request with `n` where the model takes it, otherwise one request
per candidate, numbered in the order sent.

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

Models sit behind one function, `generate(prompt, settings, size)`, which
returns a list of `{bytes, ext, requestId?}`. Each adapter maps the size to
its model's own parameters, width and height on FLUX 3 and FLUX.2, a
resolution on Grok Imagine. When the model cannot produce the size exactly,
the adapter throws before any request, as Grok Imagine does for 640 × 640;
nothing is ever resized. Workers AI comes first, via
`POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run` with
`{"model":"<model id>","input":{…}}`. BFL's API (for FLUX 3 Image), xAI's
own API and Replicate are further adapters. Request
`response_format: "b64_json"` where offered, so no image URL can expire before
it is fetched.

### 2.3 `manual`: prompts to candidates, by hand

For a web app with no API, such as Grok Imagine in a browser. The helper
does the bookkeeping; the person generates and downloads.

- At start it asks for the service and the model name the app shows, and
  records them with the date on every line. It shows the template's width,
  height and format, which the app's downloads must match exactly.
- It takes the subjects with no candidates in ID order. For each, it puts
  the prompt on the clipboard (`clip.exe` under WSL, `pbcopy` on macOS,
  `wl-copy` or `xclip` on Linux) and prints the subject and prompt.
- It watches the downloads folder (`--downloads`, required). Each new image
  file is moved, unchanged, to `candidates/<subject>-c<k>.<ext>` and logged
  to `generations.jsonl` like an API generation, with provider `manual` and
  the file's width, height and format. It stops at the first download whose
  size or format is not the template's, since the rest will not match
  either. Partial downloads (`.crdownload`, `.part`, `.tmp`) are ignored
  until complete.
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

### 2.4 `curate`: candidates to decisions

A local web page served from `localhost`. It never leaves the machine.

- **Size and format first.** A candidate whose logged width, height or
  format differs from the template's is rejected as `defect`, with a note,
  before any candidate of its subject is offered. Browsers scale images, so
  the curator could not see it.
- **Subject view.** One subject at a time, with its parameter values and
  stated age. It offers only the lowest-numbered undecided candidate, with
  accept, or reject with one of images.md §4's reasons: `defect`, `style`,
  `parameters`, `age`, `likeness`, plus a note. Accepting asks for the
  template's tags and closes the subject. This enforces "first that passes".
- **Pool view.** Every accepted image of the pool in one grid, filterable by
  parameter, for spotting style outliers. Rejecting an accepted image here
  reopens its subject at the next candidate.
- Appends each decision to `curation.jsonl`.
- Lists the subjects whose candidates have all failed, for `generate --more`
  or another `manual` pass.

### 2.5 `register`: accepted candidates to images

For each accepted candidate with no image record:

- confirm that its width, height and format are the template's and its
  SHA-256 is the one `generations.jsonl` recorded. A refusal means the file
  changed after curation: it names the subject, so the curator rejects the
  candidate in the pool view and the subject reopens (§2.4). The check's rule
  that every accept has an image (images.md §8) stops a subject from
  dropping out unnoticed;
- append the image record (§7 of images.md) to `images.jsonl`.

Nothing is decoded, resized or re-encoded. The candidate's file is the
image, so the generator's provenance metadata stays valid (images.md §4,
step 5).

### 2.6 `upload`: files to R2

Puts every image file that R2 lacks under `image/<sha256>`, with its content
type set from the image record's format, using
`wrangler r2 object put --remote --content-type <type>` (Wrangler 4 writes to
local storage without `--remote`). It lists what it will upload and waits for a yes. It
never deletes or overwrites an object.

### 2.7 `freeze`: filter to set

Takes a pool, a filter, N and a `set_id`, and writes `sets/<set_id>.json`.

- Chooses N of the matching images as images.md §5 says, with a selection
  seed, which it draws and records when none is given.
- Refuses when fewer than N images match, and refuses to overwrite an
  existing set file: a set is frozen.

## 3. The check

images.md §8 is the definition. The offline part runs inside
`npm run check`, from the manifests. The online part runs as
`npm run check:r2` before every deploy, against the objects in R2, and the
delivery check of §8 runs after every deploy. Beyond §8, the offline part
checks that:

- every subject's prompt is its template rendered with its values;
- each value's subjects meet the design: the count in `per_value`, and the
  balance rule of §2.1.

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
- **App downloads.** Unverified: whether a web app can produce the
  template's size at all (Grok's cannot make 640 × 640), whether it
  downloads one file per image and under what names, and whether a download
  is the model's file unchanged, with the same bytes and C2PA manifest as the
  API and no metadata naming the account. Inspect the first download.
- **Output terms** for this use: partly read, none reviewed by a lawyer; see
  [image-variability.md](image-variability.md) §5.
