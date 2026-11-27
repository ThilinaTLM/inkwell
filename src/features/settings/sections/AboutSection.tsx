// Settings → About: version (package.json, overridable at build time with
// VITE_APP_VERSION), links and credits.

import { version as pkgVersion } from "../../../../package.json";
import { Row, SettingsCard } from "../SettingsCard";

const VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || pkgVersion;

const EXT = "text-accent-text underline-offset-4 hover:underline";

export function AboutSection() {
  return (
    <SettingsCard
      id="about"
      title="About"
      description="A small, self-hosted home for your notes and diagrams."
    >
      <Row label="Version">
        <span className="font-mono text-xs">v{VERSION}</span>
      </Row>
      <Row label="License">
        <span className="text-[13px]">Apache License 2.0</span>
      </Row>
      <Row label="Credits">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Drawing is powered by{" "}
          <a
            className={EXT}
            href="https://github.com/excalidraw/excalidraw"
            target="_blank"
            rel="noreferrer"
          >
            Excalidraw
          </a>{" "}
          and diagrams by{" "}
          <a className={EXT} href="https://www.drawio.com/" target="_blank" rel="noreferrer">
            draw.io
          </a>
          . Markdown editing uses{" "}
          <a className={EXT} href="https://codemirror.net/" target="_blank" rel="noreferrer">
            CodeMirror
          </a>{" "}
          and{" "}
          <a className={EXT} href="https://unifiedjs.com/" target="_blank" rel="noreferrer">
            unified
          </a>
          . The credit for the editors belongs upstream; consider supporting{" "}
          <a className={EXT} href="https://plus.excalidraw.com/" target="_blank" rel="noreferrer">
            Excalidraw+
          </a>
          .
        </p>
      </Row>
    </SettingsCard>
  );
}
