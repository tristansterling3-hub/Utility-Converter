# Asset Forge Converter roadmap

Updated: October 30, 2026

This is a proposed development plan, not a release schedule. Items below are not implemented unless explicitly listed as current capabilities. Priorities can change based on actual asset workflows and bug reports.

## Direction

Build a focused utility workspace for preparing game assets and documents. Favor local processing, clear previews, reversible edits, and reliable downloads. Add utilities that share the same file queue and preview workflow rather than collecting unrelated tools.

## Current capabilities

- Batch PNG/JPEG/WebP conversion, resize, Y-flip, individual downloads, and ZIP export.
- Local AI background removal with solid-detail recovery and soft-edge modes.
- Cutout Restore/Erase brushes, zoom, undo, reset, and updated downloads after editing.
- DOCX rendering with font/spacing corrections, actual PDF previews, direct downloads, and optional print export.

## Priority 1: reliability and precise asset cleanup

- [ ] Build a redistributable visual test set covering thin limbs, outlines, disconnected objects, UI icons, translucent VFX, textures, and UV layouts. Use original or appropriately licensed fixtures.
- [ ] Add side-by-side and before/after previews with light, dark, and checkerboard backgrounds.
- [ ] Improve repair tools with a visible brush outline, numeric size, keyboard shortcuts, redo, and adjustable brush softness.
- [ ] Add background-color removal with tolerance and an edge-connected option. This should offer a predictable alternative to AI for flat backgrounds and diagrams.
- [ ] Add large-image memory estimates, clear size limits, and recovery from failed processing.
- [ ] Expand DOCX visual fixtures for tables, headers/footers, embedded fonts, explicit page breaks, and mixed paper sizes.

Completion criteria: downloads and ZIPs match the final preview; edits can be reversed; cancellation and failed files do not invalidate completed results; improvements work across several fixtures rather than one sample.

## Priority 2: shared image utilities

| Proposed utility | Useful for | First scope |
| --- | --- | --- |
| Crop, rotate, and padding | UI, sprites, concept art | Preview dimensions; transparent padding; aspect-ratio lock |
| Trim transparent borders | Sprites and icons | Adjustable alpha threshold and padding; preserve original pivot/offset metadata |
| Batch renaming | Asset organization | Prefix/suffix, numbering, collision preview |
| Texture channel tools | Material textures | Inspect, extract, invert, and pack channels; configurable mappings rather than a universal engine preset |
| Normal-map Y-channel flip | Material import | Invert the green channel independently of geometric image Y-flip |
| Sprite sheet assembly/splitting | Animation and VFX | Grid layout, spacing, padding, and optional JSON frame metadata |
| Image comparison | Texture and UI review | Dimensions, alpha inspection, and visual difference overlay |

Completion criteria: exact channel-value tests where applicable; clear handling of alpha and color space; exported filenames and dimensions shown before batch processing.

## Priority 3: document and animation utilities

- [ ] PDF merge, split, reorder, and image-to-PDF with previews and explicit output settings.
- [ ] Research selectable-text DOCX-to-PDF output. Compare a local desktop conversion helper with an optional server converter, including fidelity, deployment cost, licensing, and privacy. Keep the current image-based PDF limitation visible until a replacement is verified.
- [ ] Explore animated GIF/WebP background removal with consistent masks across frames, duration/loop preservation, frame-count limits, and cancellation. Frame-by-frame removal alone may flicker.
- [ ] Explore SVG optimization while preserving paths, IDs, viewBox, and appearance; keep it distinct from the current raster conversion.

Completion criteria: report unsupported content instead of silently dropping it; disclose any file upload before a remote workflow begins; verify complete documents/animations, not only the first page/frame.

## Utility integration approach

This architecture is proposed; a plugin system does not exist yet.

1. Move the editable application controller/markup/styles into a consistent source layout and make `dist` fully generated.
2. Introduce a shared job/result interface for accepted formats, options, progress, cancellation, preview, output names, and disposal of temporary resources.
3. Keep expensive work in workers and load utility code only when needed.
4. Reuse queue, error reporting, download, ZIP, and editor behavior across tools.
5. Start with built-in modules. Consider third-party plugins only after the internal interface is stable and permissions are defined.

Potential later integrations include saved Unity/Unreal/Godot export profiles, local folder workflows, an installable offline app, and a CLI for repeatable batches. Validate each against user demand before adding maintenance cost.

## Public release preparation

- [ ] Decide the project's license and resolve dependency/model licensing requirements; see [Open-source plan](OPEN_SOURCE.md).
- [ ] Inventory third-party notices and make deployed builds traceable to source.
- [ ] Add CI for build and tests, then automated browser checks where practical.
- [ ] Test desktop browsers, touch input, keyboard use, and narrow layouts.
- [ ] Prepare original demo assets, release notes, issue templates, and a reproducible first release.

## How to prioritize a new utility

Describe the input, desired output, how often the workflow occurs, and what existing tool is inconvenient. Prefer utilities that solve a repeated problem, work locally, reuse existing infrastructure, have compatible licenses, and can be verified with clear fixtures. Record tradeoffs before committing to large model downloads or external services.
