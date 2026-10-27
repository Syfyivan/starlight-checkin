# Bundled browser library

## canvas-confetti 1.9.4

- Author: Kiril Vatev (`catdad`).
- License: ISC; the unmodified license is in `canvas-confetti.LICENSE`.
- Official project and API documentation: https://github.com/catdad/canvas-confetti
- Pinned tag: https://github.com/catdad/canvas-confetti/tree/1.9.4
- Tag commit: `5f77cdeb0b9f6b69558e8369c63071fc9415f842`.
- Distribution URL: https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.module.mjs
- Saved as `canvas-confetti-1.9.4.js` without source changes (extension only).
- SHA-256: `d29dc7b2dae5d04baf55666e4f677bbf7f8b0bf587e1ace6098823c4363e7589`.
- Retrieved: 2026-10-27.

This is a local, version-pinned browser asset. Runtime makes no CDN requests. No npm dependency, analytics, external font, or worker is added.

## Completion celebration integration

Load `celebrations.css` in the page, and import `celebrateTask` from `celebrations.js`. Call it only when the server successfully changes a task from incomplete to complete:

```js
celebrateTask({ taskId: task.id, title: task.title, coins: awardedVisibleCoins });
```

`coins` is the display amount, not the application's fixed-point storage units. It may be omitted when actual credited points are unavailable. Do not call on refresh, undo, initial rendering, or already-completed tasks. `cleanup()` can be called when switching rooms or logging out. Rapid completions replace the current visual; they never queue animations.

The module contains 48 original short encouragements and six public-domain excerpts with attribution. Only message indices are stored in localStorage. A shuffle bag avoids repeats until all messages have appeared; the cycle boundary also avoids repeating the last message. Task titles and points are never stored by this feature, and all text is inserted using `textContent`.

Static allowlist / service-worker cache additions, if those are explicit in the host application:

- `/celebrations.js`
- `/celebrations.css`
- `/vendor/canvas-confetti-1.9.4.js`

Serve the library license alongside distributed source. These modules work with `script-src 'self'` and `style-src 'self'`; no additional CSP host, `unsafe-eval`, `blob:`, or worker permission is needed. The optional worker mode is explicitly disabled. Canvas fireworks/stars and CSS balloons run for at most 2.3 seconds, the small status note lasts 2.9 seconds, and all overlays have `pointer-events: none`. Reduced-motion users receive the text without animation.
