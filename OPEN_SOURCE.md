# Open-source recommendation and release plan

Updated: October 30, 2026

## Recommendation

Open source is a good fit if the goal is a useful public portfolio project and a community-maintained utility. Local processing gives users a practical reason to inspect the code. Image and document edge cases also benefit from reproducible reports and contributions from different browsers and workflows.

The tradeoff is maintenance: issues, dependency updates, documentation, and support take time. Other people will be able to reuse and fork the project under the chosen license. A small, clearly scoped release is more manageable than promising a large toolbox immediately.

## Current status

There is no project-level `LICENSE` file and no application license declared in `package.json`. The package is marked `private: true`, which prevents accidental npm publication; it is not a source-code license or a statement about repository visibility.

Making a repository visible is not a substitute for granting an open-source license. GitHub's [Choose a License explanation](https://choosealicense.com/no-permission/) describes the limitations of publishing code without one.

## The dependency decision

The app currently bundles `@imgly/background-removal` 1.7.0. Its upstream project identifies AGPL-3.0 licensing and directs users to IMG.LY for other licensing options. See [IMG.LY's license section](https://github.com/imgly/background-removal-js#license) and the bundled `dist/vendor/background-removal-LICENSE.md`.

My recommendation is to evaluate an AGPL-3.0-compatible release while retaining this library. Confirm the precise terms for the combined application and downloaded model/runtime assets before selecting the project license. Do not assume adding an MIT license to the application removes dependency obligations.

If a permissive-only release or proprietary product is important, investigate alternative permission from IMG.LY or replace the component with a suitably licensed implementation/model. Those are future decisions, not changes already made to this project.

This document records options; it does not grant a license, change ownership, or claim a completed legal/compliance review.

## Before a public release

1. Choose the project license after reviewing dependencies, downloaded model assets, and source/distribution requirements.
2. Add the selected license and accurate package metadata. Retain required third-party copyright/license notices and document pinned source versions.
3. Make source and build instructions available for the version actually deployed; assess how source-access requirements apply to that deployment.
4. Review tracked files and repository history for personal documents, private images, credentials, and deployment-specific configuration. Ignoring a path does not remove files already committed.
5. Keep private `.qa/` comparisons out of release packages. Use original or appropriately licensed demo assets rather than the personal resume or cartoon image used during local testing.
6. Complete a clean install, build, tests, and browser verification from the proposed release source. Document known limitations.
7. Publish a small initial release with a roadmap, contribution guide, and manageable support expectations.

## Suggested launch scope

Present it as an early browser-based asset utility: image conversion, background cleanup with manual repair, and DOCX-to-PDF preview/download. Be clear that AI cutouts can need repair and direct PDF output currently contains page images. Expand only after the existing tools are dependable across a wider test set.

Related documents: [README](README.md), [Roadmap](ROADMAP.md), [Contributing](CONTRIBUTING.md).
