// Inkwell-side bootstrap that runs INSIDE the drawio iframe.
//
// Drawio's embed protocol exposes no global handle to the live
// `EditorUi` / `App` instance — `App.main()` keeps it as a local. We
// need that instance from the parent (Inkwell) so we can register
// custom File-menu items via `editorUi.menus.addPluginMenuItems`
// (Tier 1.4 of the responsive plan).
//
// This script monkey-patches `App.prototype.init` to capture the
// instance on `window.editorUi` before drawio sends the `init`
// postMessage. After that, the parent reads `iframe.contentWindow.editorUi`
// and the live action / menu APIs are available.
//
// Loaded from `public/drawio-bootstrap.js` (sibling of `public/drawio/`)
// so `scripts/fetch-drawio-assets.mjs` doesn't wipe it on the next
// drawio asset refresh. The fetch script appends a `<script
// src="/drawio-bootstrap.js"></script>` tag to drawio's `index.html`
// after copying assets (see that script's post-process step).

(() => {
  // App.js is loaded asynchronously by drawio (via mxscript) so we
  // can't patch on first execution. Poll until App is defined, then
  // patch its init prototype before drawio's bootstrap calls
  // `new App(...)` and `instance.init()`.
  let attempts = 0;
  const maxAttempts = 1000; // ~10s at 10ms per attempt

  const iv = setInterval(() => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(iv);
      return;
    }
    if (typeof window.App === "undefined" || !window.App.prototype) return;
    if (window.App.__inkwellPatched) {
      clearInterval(iv);
      return;
    }

    window.App.__inkwellPatched = true;
    const origInit = window.App.prototype.init;
    // Must stay a `function`-expression: we need a fresh `this`
    // bound by the caller (drawio's `new App(...)` constructor).
    // Rest params instead of `arguments` keeps biome happy.
    window.App.prototype.init = function (...args) {
      // Expose the live instance before init runs so post-init code
      // (including our parent-side `installFileMenuExtras`) can find
      // it as soon as the `init` postMessage arrives.
      window.editorUi = this;
      return origInit.apply(this, args);
    };
    clearInterval(iv);
  }, 10);
})();
