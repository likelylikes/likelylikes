# likelylikes
A preference game: pick the best of four images, round after round, and score points for ranking consistently over time. The same choice patterns can identify and verify individuals.

## Image sets from sheets

A sheet is one generated image holding a grid of faces, say 4 × 4, made from one prompt. To turn downloaded sheets into an image set:

```
npm install
npm run images:sheets -- --pool women-profiles.v1 <folder>/*.jpg     # each image with its prompt beside it, same name, .md
npm run images:accept -- --pool women-profiles.v1 --all --note "<who decided, and why>"   # or curate one by one
npm run images:encode -- --pool women-profiles.v1 --unsigned
npm run images:freeze -- --pool women-profiles.v1 --set <set_id> --n 16 [--filter ethnicity=irish] [--large]
npm run check
```

The prompt file must be the template's prompt with its slots filled in; `sheets` reads the values from it. A new kind of sheet needs its own template, `images/templates/<template>.v<n>.json` with a `sheet` block, and a pool design first. The pipeline is specified in [docs/image-pipeline.md](docs/image-pipeline.md), the image rules in [docs/images.md](docs/images.md).
