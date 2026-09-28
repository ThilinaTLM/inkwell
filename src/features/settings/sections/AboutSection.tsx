// Settings → About: version (package.json, overridable at build time with
// VITE_APP_VERSION) and credits (from the README).

import { version as pkgVersion } from "../../../../package.json";
import { SettingRow, SettingsGroup } from "../controls";

const VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || pkgVersion;

const EXT = "text-primary underline-offset-4 hover:underline";

export function AboutSection() {
  return (
    <>
      <SettingsGroup
        title="Inkwell"
        description="A small, self-hosted home for your diagrams and Markdown."
      >
        <SettingRow label="Version">
          <span className="font-mono text-xs">v{VERSION}</span>
          <span className="text-xs text-muted-foreground">{import.meta.env.MODE}</span>
        </SettingRow>
        <SettingRow label="Runs on" help="Everything lives in your Cloudflare account">
          <span className="text-[13px]">Workers · D1 (metadata) · R2 (files)</span>
        </SettingRow>
        <SettingRow label="License">
          <span className="text-[13px]">Apache License 2.0</span>
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title="Credits" description="Honoring the work this stands on.">
        <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            Inkwell is a thin wrapper around the wonderful{" "}
            <a
              className={EXT}
              href="https://github.com/excalidraw/excalidraw"
              target="_blank"
              rel="noreferrer"
            >
              Excalidraw
            </a>{" "}
            editor — the drawing, the hand-drawn aesthetic, the interaction model and the file
            format are theirs. Inkwell only adds persistent storage, a multi-file dashboard and
            share links. If you like it, the credit belongs upstream; consider supporting{" "}
            <a className={EXT} href="https://plus.excalidraw.com/" target="_blank" rel="noreferrer">
              Excalidraw+
            </a>
            .
          </p>
          <p>
            Diagrams by{" "}
            <a className={EXT} href="https://www.drawio.com/" target="_blank" rel="noreferrer">
              draw.io
            </a>
            , Markdown editing by{" "}
            <a className={EXT} href="https://codemirror.net/" target="_blank" rel="noreferrer">
              CodeMirror
            </a>{" "}
            and{" "}
            <a className={EXT} href="https://unifiedjs.com/" target="_blank" rel="noreferrer">
              unified
            </a>
            . Design ideas borrowed (with thanks) from{" "}
            <a
              className={EXT}
              href="https://github.com/ZimengXiong/ExcaliDash"
              target="_blank"
              rel="noreferrer"
            >
              ExcaliDash
            </a>
            ,{" "}
            <a
              className={EXT}
              href="https://github.com/ozencb/excalidraw-persist"
              target="_blank"
              rel="noreferrer"
            >
              excalidraw-persist
            </a>{" "}
            and{" "}
            <a
              className={EXT}
              href="https://github.com/BetterAndBetterII/excalidraw-full"
              target="_blank"
              rel="noreferrer"
            >
              excalidraw-full
            </a>
            .
          </p>
        </div>
      </SettingsGroup>
    </>
  );
}
