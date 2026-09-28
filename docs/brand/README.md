# Inkwell brand assets

Open **`index.html`** in a browser to see everything, including the animated splash.

## Direction: "Well"

A short, wide inkwell with a pen dipped in and burnt-orange ink inside.

- **It matches the name.** "Inkwell" is the picture, so the mark doesn't need explaining.
- **It's simple.** It uses two strokes and one fill, with round caps like the Excalidraw pen. The shape still reads at 16 px.
- **It uses the existing palette.** Ink `#1c1814` / chalk `#efe9dc` for strokes, and burnt orange `#e8731f` (`#f5893a` on dark) for the ink. These are the same tokens as `src/index.css`.
- **The wordmark** is "inkwell" set in Excalifont (the app's `--font-brand`) and converted to outlines, so it renders the same everywhere without the font installed.

Three other concepts were explored and dropped: Drop, Monogram and Folder + ink. They are in git history (commit `ae39067`, `docs/brand/concepts/`).

## Files

```
logo/
  mark.svg                         theme-aware (prefers-color-scheme)
  mark-light-bg.svg / mark-dark-bg.svg
  mark-mono.svg                    single colour, uses currentColor (for inline use)
  wordmark.svg                     outlined "inkwell", currentColor
  lockup-horizontal-{light,dark}-bg.svg
  lockup-stacked-{light,dark}-bg.svg
icon/
  favicon.svg                      theme-aware; drop-in for public/favicon.svg
  app-icon-light.svg / app-icon-dark.svg   512×512 rounded square
  app-icon-maskable.svg            full-bleed, art inside the 80% safe zone (PWA)
splash/
  splash-light.svg / splash-dark.svg       animated, 16:10, preserveAspectRatio="slice"
```

## Mark geometry (64×64 viewBox, stroke-width 4.5, round caps/joins)

```
body  M23 17 H41 M27 17 V21 C27 25 9 26 9 36 V48 Q9 56 17 56 H47 Q55 56 55 48 V36 C55 26 37 25 37 21 V17
pen   M50 3 L35 22
ink   M9 43 C16 37 23 37 30 42 C37 47 46 47 55 40 V48 Q55 56 47 56 H17 Q9 56 9 48 Z   (filled, drawn first)
```

## In the codebase

| Where | What |
|-------|------|
| `src/components/InkwellMark.tsx` | The mark. `animate` makes the pen dip and the ink ripple. `tone="mono"` gives a single-colour version. |
| `src/components/InkwellWordmark.tsx` | The outlined "inkwell" wordmark (currentColor). |
| `src/components/InkwellLogo.tsx` | Mark + wordmark lockup (`size` sm/md/lg). Used in the top bars, the auth card and shared-folder pages. |
| `src/components/InkwellSplash.tsx` | Full-screen splash, used by `BootSplash` in `src/app/App.tsx`. |
| `index.html` `#boot-splash` | Static copy of the splash, painted before JS loads. React swaps it for `<InkwellSplash intro={false}>`. |
| `src/index.css` | The animation classes: `.ink-pen-dip`, `.ink-wave`, `.ink-write`, `.ink-underline` and `.ink-splash-grid`. |
| `public/` | `favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png` and `manifest.webmanifest`. |

## Splash animation

It uses pure CSS inside the SVG, so it runs in `<img>`, `<object>` or inline:

1. The wordmark is revealed left to right, as if it were being written (about 1.1 s, plays once).
2. An orange underline draws in under it (plays once).
3. The pen dips into the well in a loop (1.6 s). This stands in for a spinner.
4. The ink surface ripples sideways in a loop.

Renderers that don't animate, and `prefers-reduced-motion`, show the final frame. The artwork stays inside the central ~420×360 units, so the `slice` scaling never crops it on phones or ultrawide screens.

## Regenerating the PNG icons

The PNGs in `public/` are rendered from `icon/`:

```sh
sed 's/rx="112" //' docs/brand/icon/app-icon-dark.svg > /tmp/fullbleed.svg
rsvg-convert -w 180 -h 180 /tmp/fullbleed.svg                  -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 docs/brand/icon/app-icon-dark.svg     -o public/icon-192.png
rsvg-convert -w 512 -h 512 docs/brand/icon/app-icon-dark.svg     -o public/icon-512.png
rsvg-convert -w 512 -h 512 docs/brand/icon/app-icon-maskable.svg -o public/icon-maskable-512.png
```
