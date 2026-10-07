# Bharatfill.ai promo videos

Two 1920×1080, 30 fps motion-graphics promos built with [Remotion](https://www.remotion.dev):

| Composition           | Length | About                                          |
| --------------------- | ------ | ---------------------------------------------- |
| `BharatfillPromo`     | 30 s   | The product: scan → auto-fill → impact         |
| `BharatfillDocsPromo` | 20 s   | Auto-resizing documents and uploading them     |

```console
npm i --loglevel=error
npm run dev           # Remotion Studio — preview, scrub, edit copy in the props panel
npm run render        # → out/bharatfill-promo.mp4
npm run render:docs   # → out/bharatfill-docs-promo.mp4
npm run lint          # eslint + tsc
```

## Docs promo scenes

| Frames  | Scene                                         | File                                 |
| ------- | --------------------------------------------- | ------------------------------------ |
| 0–120   | Upload rejected (portal errors, stamp)        | `src/promo/scenes/UploadRejectedScene` |
| 120–450 | Auto-resize to the portal's rules, then upload | `src/promo/scenes/ResizeUploadScene`  |
| 450–600 | End card                                      | `src/promo/components/EndCard`       |

Timings live in `src/promo/docs-timeline.ts`. The resize scene follows the product's real rules:
the operator ticks "Attach fitted copy" before anything is attached, and the portal's own
"Save & Continue" is never pressed.

## Main promo scenes

| Frames  | Scene                         | File                            |
| ------- | ----------------------------- | ------------------------------- |
| 0–150   | The problem (kinetic type)    | `src/promo/scenes/ProblemScene` |
| 150–300 | Logo reveal + tagline         | `src/promo/scenes/LogoScene`    |
| 300–510 | Document scanner (3D card)    | `src/promo/scenes/ScannerScene` |
| 510–720 | 1-click browser auto-fill     | `src/promo/scenes/AutoFillScene`|
| 720–900 | Impact stats + call to action | `src/promo/scenes/ImpactScene`  |

Every timing — scene cuts, in-scene beats and sound-effect cues — lives in
`src/promo/timeline.ts`. Move a beat there and its sound moves with it.

All on-screen copy is in `src/promo/schema.ts` and can be edited live from the Studio props panel.

## Assets (`public/`)

| File                      | Required | Used for                                                         |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `Bharatfill-logo.png`     | yes      | Logo reveal and end card                                         |
| `bharatfill-mark-512.png` | yes      | Extension icon in the auto-fill scene                            |
| `bgm.mp3`                 | optional | Background music (looped, faded in/out)                          |
| `swoosh.mp3`              | optional | Scene transitions, the auto-fill click, files flying into boxes  |
| `success.mp3`             | optional | Completion moments (scan, fill, resize, attach) and CTA reveal   |
| `scanner-preview.png`     | optional | Replaces the drawn sample ID card in the scanner scene           |
| `dashboard.png`           | optional | Faint tilted backdrop behind the stat cards                      |

Optional files are detected automatically. If one is missing, that layer is skipped and the
render still succeeds. The auto-fill form is always drawn in code, because its fields have to
light up one by one.

## Data rules

All identity data on screen is fake: a "SAMPLE" card with a masked number, a silhouette in place
of a photo, `example.com` addresses and the standard placeholder mobile number. Do not swap in a
screenshot of a real person's Aadhaar, PAN or other document.
