# UniFr Planner identity

The planner uses its own open-book/calendar symbol, paired with the live-text
wordmark “UniFr Planner”. Navy and muted teal retain a restrained academic feel;
the mark is an original generated design, not the University of Fribourg's logo,
seal, or bilingual institutional wordmark. The former university logo was removed
at the user's request on 2026-09-30.

## Assets

- `planner-mark-master.png`: original transparent 1254 × 1254 PNG generated on
  2026-09-30 with the built-in OpenAI image-generation tool. No reference image
  was supplied to the generator.
  SHA-256: `c39373c3ea1746983554d727aab6fd320baa0f838b7b2aa9c19f1df2cdabecd5`.
- `planner-mark.png`: transparent 256 × 256 header mark, copied unchanged to
  `apps/web/public/planner-mark.png`.
  SHA-256: `6700484e5a55423c44bc4ddf293a8404497b8aaa934f8456c34c610d5f0ef0ff`.
- `apps/web/public/favicon.png`: 32 × 32 browser icon.
- `apps/web/public/favicon.ico`: 16, 32, and 48 pixel browser icons.
- `apps/web/public/apple-touch-icon.png`: 180 × 180 home-screen icon.

All sizes are downsampled from the master with ImageMagick, preserving its alpha
channel and proportions. The header wordmark uses real text to stay crisp and
accessible at all screen sizes. The decorative symbol has empty alternative text
because the adjacent wordmark already names the home link.

## Generation prompt

> Create one original logo symbol for an independent university study-planning
> app called UniFr Planner. Asset type: production app icon, no text. A restrained
> Swiss academic graphic identity, flat vector-like geometric design: an open book
> built from two strong upright navy page forms, suggesting a U, combined elegantly
> with a minimal calendar detail of three small square course blocks on one page.
> Navy blue #0A3859 is the main color, a small muted teal #3F817F accent is allowed.
> One centered isolated symbol on a genuinely transparent background, square canvas,
> generous but not excessive padding, symbol fills about 80% of the canvas. Bold
> simple geometry, crisp straight edges, subtly rounded corners, clear silhouette
> legible at 24px. Premium quiet modern editorial design. No lettering, no words,
> no numbers, no thin details, no gradients, no shadows, no mockup, no border or
> outer tile. This must be a new original emblem: do not reproduce the University
> of Fribourg seal, official logo, F monogram, crest, or bilingual wordmark. Render
> only the single finished symbol.

## Export commands

Run from the repository root:

```sh
magick assets/brand/planner-mark-master.png -resize 256x256 -strip assets/brand/planner-mark.png
cp assets/brand/planner-mark.png apps/web/public/planner-mark.png
magick assets/brand/planner-mark-master.png -resize 32x32 -strip apps/web/public/favicon.png
magick assets/brand/planner-mark-master.png -define icon:auto-resize=48,32,16 apps/web/public/favicon.ico
magick assets/brand/planner-mark-master.png -resize 180x180 -strip apps/web/public/apple-touch-icon.png
```
