# Development and contribution guide

This guide documents the current development workflow. The project-level license and public contribution policy are pending; see [Open-source plan](OPEN_SOURCE.md).

## Setup

The project has been developed with Node.js 22, npm, and Python 3 for local serving.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173`. Use `npm` and, if necessary, `python3` on other platforms. Background removal needs internet access for model/runtime downloads, even though image processing happens locally.

## Where to edit

| Change | Location |
| --- | --- |
| Application flow, queues, downloads | `dist/app.js` |
| Page layout and styles | `dist/index.html`, `dist/styles.css` |
| Background-removal worker | `src/background-worker.js` |
| Mask recovery and cutout editor | `src/cutout-tools.mjs` |
| DOCX layout adjustments | `src/docx-layout.mjs` |
| PDF generation and viewer | `src/pdf-export.mjs`, `src/pdf-tools.mjs` |
| Pinned library compatibility fixes | `scripts/patch-docx.mjs`, `scripts/patch-html2canvas.mjs` |
| Build and asset hashes | `scripts/build.mjs` |

Some files in `dist` are currently hand-authored and others generated. Do not edit generated bundles or `node_modules` directly. Rebuild after changes to ensure bundles and HTML hashes agree. Include the relevant generated changes with source changes because static deployment serves `dist`.

## Verification

Run `npm.cmd test` and `npm.cmd run build` for functional changes. The automated suite covers queue behavior, cancellation, output state, alpha recovery, brushes, layout patches, and PDF page sizes. Some browser APIs and rasterization are mocked; passing tests alone does not establish visual fidelity or model quality.

For image changes, manually verify a solid subject with thin details, a source with partial transparency, and a batch containing a failed input. Inspect both transparency and unwanted background. Check Restore, Erase, Undo, Cancel, Apply changes, individual downloads, and ZIP contents. Verify resizing/Y-flip keeps repair pixels aligned. For GIFs, check that the exported still is the first frame.

For document changes, compare the actual downloaded PDF against the reference at readable zoom. Check every page, margins, fonts, line wrapping, tables, headers, and paper sizes. Confirm preview and download use the same PDF. Keep the image-based/selectable-text distinction accurate.

The optional browser harness uses synthetic documents:

```powershell
python -m http.server 4174 --bind 127.0.0.1
```

Open `http://127.0.0.1:4174/tests/browser.html`. Serving the repository root is for local development only; deploy `dist`.

## Bug reports and feature proposals

For a bug, include browser/OS, settings, expected and actual results, and steps to reproduce. Use a small synthetic or redistributable input whenever possible. Do not attach private resumes, client assets, credentials, or copyrighted fixtures without the necessary permission.

For a utility proposal, describe the input/output formats, repeated workflow, expected local/remote processing, and a concrete example. Check [Roadmap](ROADMAP.md) first.

Keep changes focused. Explain the behavior change, checks performed, and any remaining limitations. Preserve working downloads after preview failures and do not add file uploads or persistent storage without an explicit product decision.

## Dependency updates

Keep `package.json` and `package-lock.json` in sync. Review licenses and generated notices. The renderer patches intentionally fail if upstream implementation changes: inspect and update them rather than removing the checks. Rerun relevant browser comparisons after renderer, font, PDF, or model updates.

Private visual checks belong in ignored `.qa/`. Public test assets must have documented redistribution rights. Use generated fixtures for automated tests when practical.
