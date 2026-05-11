// Brand-logo SVGs for the file-kind glyphs.
//
// Two components, each with two `variant`s:
//
//   "full" → the official brand chip (colored rounded square + mark),
//            sized to fill its container. Used by `<FileKindBadge>`
//            and the empty-thumbnail fallback inside `<FileGlyph>`.
//   "mark" → just the colored mark on transparent. Used by inline
//            menu / dropdown rows where a chunky colored square next
//            to text would feel heavy.
//
// Path data is copied verbatim from the source SVG files. Brand
// colors are encoded as literal fills (we never want to recolour
// these via theme tokens — the marks must always read as the
// real Excalidraw / draw.io brands).
//
// Source assets (kept on disk for posterity, not imported):
//   /home/tlm/Downloads/excalidraw-logo.svg
//   /home/tlm/Downloads/drawio-svgrepo-com.svg

import { useId } from "react";

import { cn } from "@/lib/utils";

export type BrandLogoVariant = "mark" | "full";

const EXCALIDRAW_PATH_D =
  "M119.81 105.98a.549.549 0 0 0-.53-.12c-4.19-6.19-9.52-12.06-14.68-17.73l-.85-.93c0-.11-.05-.21-.12-.3a.548.548 0 0 0-.34-.2l-.17-.18-.12-.09c-.15-.32-.53-.56-.95-.35-1.58.81-3 1.97-4.4 3.04-1.87 1.43-3.7 2.92-5.42 4.52-.7.65-1.39 1.33-1.97 2.09-.28.37-.07.72.27.87-1.22 1.2-2.45 2.45-3.68 3.74-.11.12-.17.28-.16.44.01.16.09.31.22.41l2.16 1.65s.01.03.03.04c3.09 3.05 8.51 7.28 14.25 11.76.85.67 1.71 1.34 2.57 2.01.39.47.76.94 1.12 1.4.19.25.55.3.8.11.13.1.26.21.39.31a.57.57 0 0 0 .8-.1c.07-.09.1-.2.11-.31.04 0 .07.03.1.03.15 0 .31-.06.42-.18l10.18-11.12a.56.56 0 0 0-.04-.8l.01-.01Zm-29.23-3.85c.07.09.14.17.21.25 1.16.98 2.4 2.04 3.66 3.12l-5.12-3.91s-.32-.22-.52-.36c-.11-.08-.21-.16-.31-.24l-.38-.32s.07-.07.1-.11l.35-.35c1.72-1.74 4.67-4.64 6.19-6.06-1.61 1.62-4.87 6.37-4.17 7.98h-.01Zm17.53 13.81-4.22-3.22c-1.65-1.71-3.43-3.4-5.24-5.03 2.28 1.76 4.23 3.25 4.52 3.51 2.21 1.97 2.11 1.61 3.63 2.91l1.83 1.33c-.18.16-.36.33-.53.49l.01.01Zm1.06.81-.08-.06c.16-.13.33-.25.49-.38l-.4.44h-.01ZM42.24 51.45c.14.72.27 1.43.4 2.11.69 3.7 1.33 7.03 2.55 9.56l.48 1.92c.19.73.46 1.64.71 1.83 2.85 2.52 7.22 6.28 11.89 9.82.21.16.5.15.7-.01.01.02.03.03.04.04.11.1.24.15.38.15.16 0 .31-.06.42-.19 5.98-6.65 10.43-12.12 13.6-16.7.2-.25.3-.54.29-.84.2-.24.41-.48.6-.68a.558.558 0 0 0-.1-.86.578.578 0 0 0-.17-.36c-1.39-1.34-2.42-2.31-3.46-3.28-1.84-1.72-3.74-3.5-7.77-7.51-.02-.02-.05-.04-.07-.06a.555.555 0 0 0-.22-.14c-1.11-.39-3.39-.78-6.26-1.28-4.22-.72-10-1.72-15.2-3.27h-.04v-.01s-.02 0-.03.02h-.01l.04-.02s-.31.01-.37.04c-.08.04-.14.09-.19.15-.05.06-.09.12-.47.2-.38.08.08 0 .11 0h-.11v.03c.07.34.05.58.16.97-.02.1.21 1.02.24 1.11l1.83 7.26h.03Zm30.95 6.54s-.03.04-.04.05l-.64-.71c.22.21.44.42.68.66Zm-7.09 9.39s-.07.08-.1.12l-.02-.02c.04-.03.08-.07.13-.1h-.01Zm-7.07 8.47Zm3.02-28.57c.35.35 1.74 1.65 2.06 1.97-1.45-.66-5.06-2.34-6.74-2.88 1.65.29 3.93.66 4.68.91Zm-19.18-2.77c.84 1.44 1.5 6.49 2.16 11.4-.37-1.58-.69-3.12-.99-4.6-.52-2.56-1-4.85-1.67-6.88.14.01.31.03.49.05 0 .01 0 .02.02.03h-.01Zm-.29-1.21c-.23-.02-.44-.04-.62-.05-.02-.04-.03-.08-.04-.12l.66.18v-.01Zm-2.22.45v-.02.02ZM118.9 42.57c.04-.23-1.1-1.24-.74-1.26.85-.04.86-1.35 0-1.31-1.13.06-2.27.32-3.37.53-1.98.37-3.95.78-5.92 1.21-4.39.94-8.77 1.93-13.1 3.11-1.36.37-2.86.7-4.11 1.36-.42.22-.4.67-.17.95-.09.05-.18.08-.28.09-.37.07-.74.13-1.11.19a.566.566 0 0 0-.39.86c-2.32 3.1-4.96 6.44-7.82 9.95-2.81 3.21-5.73 6.63-8.72 10.14-9.41 11.06-20.08 23.6-31.9 34.64-.23.21-.24.57-.03.8.05.06.12.1.19.13-.16.15-.32.3-.48.44-.1.09-.14.2-.16.32-.08.08-.16.17-.23.25-.21.23-.2.59.03.8.23.21.59.2.8-.03.04-.04.08-.09.12-.13a.84.84 0 0 1 1.22 0c.69.74 1.34 1.44 1.95 2.09l-1.38-1.15a.57.57 0 0 0-.8.07c-.2.24-.17.6.07.8l14.82 12.43c.11.09.24.13.37.13.15 0 .29-.06.4-.17l.36-.36a.56.56 0 0 0 .63-.12c20.09-20.18 36.27-35.43 54.8-49.06.17-.12.25-.32.23-.51a.57.57 0 0 0 .48-.39c3.42-10.46 4.08-19.72 4.28-24.27 0-.03.01-.05.02-.07.02-.05.03-.1.04-.14.03-.11.05-.19.05-.19.26-.78.17-1.53-.15-2.15v.02ZM82.98 58.94c.9-1.03 1.79-2.04 2.67-3.02-5.76 7.58-15.3 19.26-28.81 33.14 9.2-10.18 18.47-20.73 26.14-30.12Zm-32.55 52.81-.03-.03c.11.02.19.04.2.04a.47.47 0 0 0-.17 0v-.01Zm6.9 6.42-.05-.04.03-.03c.02 0 .03.02.04.02 0 .02-.02.03-.03.05h.01Zm8.36-7.21 1.38-1.44c.01.01.02.03.03.05-.47.46-.94.93-1.42 1.39h.01Zm2.24-2.21c.26-.3.56-.65.87-1.02.01-.01.02-.03.04-.04 3.29-3.39 6.68-6.82 10.18-10.25.02-.02.05-.04.07-.06.86-.66 1.82-1.39 2.72-2.08-4.52 4.32-9.11 8.78-13.88 13.46v-.01Zm21.65-55.88c-1.86 2.42-3.9 5.56-5.63 8.07-5.46 7.91-23.04 27.28-23.43 27.65-2.71 2.62-10.88 10.46-16.09 15.37-.14.13-.25.24-.34.35a.794.794 0 0 1 .03-1.13c24.82-23.4 39.88-42.89 46-51.38-.13.33-.24.69-.55 1.09l.01-.02Zm16.51 7.1-.01.02c0-.02-.02-.07.01-.02Zm-.91-5.13Zm-5.89 9.45c-2.26-1.31-3.32-3.27-2.71-5.25l.19-.66c.08-.19.17-.38.28-.57.59-.98 1.49-1.85 2.52-2.36.05-.02.1-.03.15-.04a.795.795 0 0 1-.04-.43c.05-.31.25-.58.66-.58.67 0 2.75.62 3.54 1.3.24.19.47.4.68.63.3.35.74.92.96 1.33.13.06.23.62.38.91.14.46.2.93.18 1.4 0 .02 0 .02.01.03-.03.07 0 .37-.04.4-.1.72-.36 1.43-.75 2.05-.04.05-.07.11-.11.16 0 .01-.02.02-.03.04-.3.43-.65.83-1.08 1.13-1.26.89-2.73 1.16-4.2.79a6.33 6.33 0 0 1-.57-.25l-.02-.03Zm16.27-1.63c-.49 2.05-1.09 4.19-1.8 6.38-.03.08-.03.16-.03.23-.1.01-.19.05-.27.11-4.44 3.26-8.73 6.62-12.98 10.11 3.67-3.32 7.39-6.62 11.23-9.95a6.409 6.409 0 0 0 2.11-3.74l.56-3.37.03-.1c.25-.71 1.34-.4 1.17.33h-.02Z";

const EXCALIDRAW_PATH_TRANSFORM = "matrix(1 0 0 1 -26.41 -29.49)";
const EXCALIDRAW_PURPLE = "#6965db";

/** Excalidraw brand mark.
 *
 *  - "full" → 1000×1000 white-rounded-square chip with the official
 *             purple "E" path inside. Renders edge-to-edge of its
 *             container.
 *  - "mark" → just the purple path on transparent, in its native
 *             107×101 viewBox. Default size is `size-3.5`.
 */
export function ExcalidrawLogo({
  variant = "mark",
  className,
}: {
  variant?: BrandLogoVariant;
  className?: string;
}) {
  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 1000 1000"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("size-full", className)}
        aria-hidden
      >
        <title>Excalidraw</title>
        <rect width="1000" height="1000" rx="200" ry="200" fill="#fff" />
        {/* Inner mark: nested SVG with its own viewBox so the path's
            107×101 coordinate space scales to fill the 1000×1000 chip,
            matching the source asset's layout exactly. */}
        <svg viewBox="0 0 107 101">
          <title>Excalidraw mark</title>
          <path
            d={EXCALIDRAW_PATH_D}
            transform={EXCALIDRAW_PATH_TRANSFORM}
            fill={EXCALIDRAW_PURPLE}
            fillRule="nonzero"
          />
        </svg>
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 107 101"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-3.5", className)}
      aria-hidden
    >
      <title>Excalidraw</title>
      <path
        d={EXCALIDRAW_PATH_D}
        transform={EXCALIDRAW_PATH_TRANSFORM}
        fill={EXCALIDRAW_PURPLE}
        fillRule="nonzero"
      />
    </svg>
  );
}

const DRAWIO_MARK_D =
  "M25.24,17.96H21.946l-3.071-5.32h.2a1.119,1.119,0,0,0,1.12-1.12V6.76a1.119,1.119,0,0,0-1.12-1.12H12.92A1.119,1.119,0,0,0,11.8,6.76v4.76a1.119,1.119,0,0,0,1.12,1.12h.205l-3.071,5.32H6.76a1.119,1.119,0,0,0-1.12,1.12v4.76a1.119,1.119,0,0,0,1.12,1.12h6.16a1.119,1.119,0,0,0,1.12-1.12V19.08a1.119,1.119,0,0,0-1.12-1.12h-.927l3.072-5.32h1.87l3.071,5.32H19.08a1.119,1.119,0,0,0-1.12,1.12v4.76a1.119,1.119,0,0,0,1.12,1.12h6.16a1.119,1.119,0,0,0,1.12-1.12V19.08A1.119,1.119,0,0,0,25.24,17.96Z";

const DRAWIO_CORNER_D =
  "M16.861,9.168l3.02-3.187L30,16.094V28.88A1.119,1.119,0,0,1,28.88,30H11.316L5.931,24.593Z";

const DRAWIO_ORANGE = "#f08705";
const DRAWIO_ORANGE_DARK = "#df6c0c";

/** draw.io brand mark.
 *
 *  - "full" → 32×32 orange (`#f08705`) rounded square with the
 *             darker-orange right-angle accent and the white "X" /
 *             cross-bar mark, exactly as in the source asset.
 *  - "mark" → just the recognisable cross-bar shape, recoloured to
 *             the brand orange `#f08705` (the source draws it in
 *             white-on-orange, which would disappear on transparent
 *             in light themes). Default size is `size-3.5`.
 */
export function DrawioLogo({
  variant = "mark",
  className,
}: {
  variant?: BrandLogoVariant;
  className?: string;
}) {
  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("size-full", className)}
        aria-hidden
      >
        <title>draw.io</title>
        <rect x="2" y="2" width="28" height="28" rx="1.12" fill={DRAWIO_ORANGE} />
        <path d={DRAWIO_CORNER_D} fill={DRAWIO_ORANGE_DARK} fillRule="evenodd" />
        <path d={DRAWIO_MARK_D} fill="#fff" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-3.5", className)}
      aria-hidden
    >
      <title>draw.io</title>
      <path d={DRAWIO_MARK_D} fill={DRAWIO_ORANGE} />
    </svg>
  );
}

// ─── Notes (BlockNote) ─────────────────────────────────────────────
//
// Notes documents are authored with BlockNote, so we surface the
// actual BlockNote brand mark here (rather than an Inkwell-original
// glyph) — same approach as Excalidraw / draw.io. Path data and
// gradient stops are copied verbatim from the official favicon:
//   https://www.blocknotejs.org/favicon.svg
//
// The mark is a stylised loop / knot in a cyan→purple gradient; the
// "full" chip wraps it in BlockNote's soft off-white rounded square
// (also a subtle vertical gradient). We mint per-instance gradient
// IDs with `useId` so multiple <NotesLogo /> instances on the same
// page don't collide on a shared `id`.

const BLOCKNOTE_BG_TOP = "#F7F6FE";
const BLOCKNOTE_BG_BOTTOM = "#DCDBF9";
const BLOCKNOTE_MARK_FROM = "#00EBE7";
const BLOCKNOTE_MARK_TO = "#6923BA";

const BLOCKNOTE_CHIP_D =
  "M329.788 0H170.212C112.592 0 96.4244 0 71.6186 8.34096C42.2918 19.0585 19.0587 42.2923 8.34045 71.6189C0 96.4246 0 112.593 0 170.212C0 329.788 0 329.788 0 329.788C0 387.407 0 403.575 8.34045 428.381C19.0587 457.708 42.2918 480.941 71.6186 491.659C96.4249 500 112.592 500 170.212 500C329.788 500 329.788 500 329.788 500C387.407 500 403.576 500 428.381 491.659C457.708 480.941 480.942 457.708 491.659 428.381C500 403.575 500 387.407 500 329.788C500 170.212 500 170.212 500 170.212C500 112.593 500 96.4246 491.659 71.6189C480.942 42.2923 457.708 19.0585 428.381 8.34096C403.576 0 387.407 0 329.788 0Z";

const BLOCKNOTE_MARK_D =
  "M386.629 261.169L335.34 231.557C331.976 229.615 330.832 230.275 330.832 234.159V249.91C330.832 254.254 333.15 258.269 336.913 260.441L374.515 282.151C376.632 283.373 377.946 285.649 377.946 288.094V323.392L317.719 288.62V228.378L317.719 144.842C317.719 133.769 311.762 123.453 302.174 117.918L262.922 95.2559C253.334 89.721 241.42 89.7195 231.832 95.2559L192.58 117.918C182.96 123.472 177.035 133.735 177.035 144.842V201.038C177.035 204.922 178.178 205.582 181.542 203.64L195.182 195.765C198.945 193.593 201.262 189.578 201.262 185.234V144.842C201.262 142.398 202.577 140.122 204.694 138.9L235.263 121.25L235.264 187.766L183.092 217.887L113.371 258.141C103.782 263.678 97.8256 273.994 97.8261 285.065V330.39C97.8266 341.46 103.782 351.779 113.371 357.314L152.623 379.976C162.242 385.53 174.093 385.53 183.713 379.977L229.757 353.393C233.121 351.451 233.121 350.131 229.757 348.189L216.116 340.313C212.354 338.141 207.718 338.141 203.956 340.313L171.599 358.995C169.482 360.217 166.853 360.217 164.736 358.995L134.167 341.345L189.149 309.601L241.32 339.722L316.288 383.005C325.877 388.541 337.789 388.541 347.377 383.005L386.629 360.342C396.216 354.807 402.174 344.49 402.174 333.418V288.094C402.174 276.986 396.248 266.723 386.629 261.169ZM335.262 362.023C333.147 363.244 330.518 363.245 328.401 362.023L253.434 318.741L201.263 288.62V255.719C201.263 251.834 200.12 251.174 196.756 253.116L183.116 260.991C179.353 263.164 177.036 267.178 177.036 271.523V288.62L122.054 320.363L122.054 285.064C122.054 282.622 123.368 280.345 125.485 279.123L200.452 235.841L247.377 208.748L275.87 225.198C279.234 227.14 280.378 226.48 280.378 222.596V206.846C280.378 202.501 278.06 198.487 274.298 196.315L259.491 187.766V121.25L290.061 138.901C292.176 140.122 293.491 142.398 293.491 144.842V231.407L293.492 288.62L264.998 305.07C261.634 307.012 261.634 308.333 264.998 310.275L278.639 318.15C282.401 320.322 287.036 320.322 290.799 318.15L305.605 309.601L365.833 344.374L335.262 362.023Z";

/** BlockNote brand mark (used for Notes-kind files).
 *
 *  - "full" → 500×500 BlockNote chip: a soft off-white squircle
 *             background (`#F7F6FE` → `#DCDBF9`) with the official
 *             cyan→purple loop mark inside. Renders edge-to-edge of
 *             its container.
 *  - "mark" → just the cyan→purple loop on transparent, in the same
 *             native 500×500 viewBox. Default size is `size-3.5`.
 */
export function NotesLogo({
  variant = "mark",
  className,
}: {
  variant?: BrandLogoVariant;
  className?: string;
}) {
  // Per-instance gradient ids so multiple icons on the same page
  // don't reference each other's `<defs>` by accident.
  const rid = useId();
  const bgGradId = `bn-bg-${rid}`;
  const markGradId = `bn-mark-${rid}`;

  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 500 500"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("size-full", className)}
        aria-hidden
      >
        <title>BlockNote</title>
        <defs>
          <linearGradient
            id={bgGradId}
            x1="250"
            y1="-14.1548"
            x2="250"
            y2="462.259"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={BLOCKNOTE_BG_TOP} />
            <stop offset="1" stopColor={BLOCKNOTE_BG_BOTTOM} />
          </linearGradient>
          <linearGradient
            id={markGradId}
            x1="353.828"
            y1="128.509"
            x2="191.895"
            y2="407.394"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={BLOCKNOTE_MARK_FROM} />
            <stop offset="1" stopColor={BLOCKNOTE_MARK_TO} />
          </linearGradient>
        </defs>
        <path d={BLOCKNOTE_CHIP_D} fill={`url(#${bgGradId})`} />
        <path d={BLOCKNOTE_MARK_D} fill={`url(#${markGradId})`} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 500 500"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-3.5", className)}
      aria-hidden
    >
      <title>BlockNote</title>
      <defs>
        <linearGradient
          id={markGradId}
          x1="353.828"
          y1="128.509"
          x2="191.895"
          y2="407.394"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={BLOCKNOTE_MARK_FROM} />
          <stop offset="1" stopColor={BLOCKNOTE_MARK_TO} />
        </linearGradient>
      </defs>
      <path d={BLOCKNOTE_MARK_D} fill={`url(#${markGradId})`} />
    </svg>
  );
}
