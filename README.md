# likelylikes
A preference game: pick the best of four images, round after round, and score points for ranking consistently over time. The same choice patterns can identify and verify individuals.

## Image sets from sheets

A sheet is one generated image holding a grid of faces, say 4 × 4, made from one prompt. To turn downloaded sheets into an image set:

```
npm install
npm run images:sheets -- --pool women-profiles.v1 <folder>/*     # each image with its prompt beside it, same name, .md
npm run images:reject -- --pool women-profiles.v1 --subjects s009 --reason age --note "<why>"   # hold back what fails images.md §4
npm run images:accept -- --pool women-profiles.v1 --all --note "<who decided, and why>"   # accept everything not decided
npm run images:encode -- --pool women-profiles.v1 --unsigned
npm run images:freeze -- --pool women-profiles.v1 --set <set_id> --n 16 [--filter ethnicity=irish] [--large]
npm run check
```

The prompt file must be the template's prompt with its slots filled in; `sheets` reads the values from it. A new kind of sheet needs its own template, `images/templates/<template>.v<n>.json` with a `sheet` block (rows, columns, and the `inset` trimmed from each cell's edges), and a pool design first. Any grid with square cells works, 3 × 3 on a 4096-pixel sheet included, as long as a cell less the inset is at least the served 640 pixels: on a 4096-pixel sheet with an inset of 8, up to 6 × 6. The pipeline is specified in [docs/image-pipeline.md](docs/image-pipeline.md), the image rules in [docs/images.md](docs/images.md).
