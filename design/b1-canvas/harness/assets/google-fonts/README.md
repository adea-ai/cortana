# Pinned Google Fonts for the B1 harness

These are the fonts the B1 boards request from Google Fonts, pinned here so renders do not depend on the network.

## Licence (separate from the repository licence)

The fonts are licensed under the SIL Open Font License, Version 1.1. The licence applies to the font files in this folder. It is not the licence of the repository.

- Space Grotesk: `OFL-SpaceGrotesk.txt`. Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk). Upstream: https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt (sha256 564ce565c371c5e5bbf286006565a7c9aa55a9f56e7ca58d56e05d649dd61a72).
- JetBrains Mono: `OFL-JetBrainsMono.txt`. Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono). Upstream: https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt (sha256 b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d).

The font files here are unmodified copies of the files Google Fonts serves for these families. Each is pinned by sha256 in `../manifest.json`. The OFL notice travels with the files.

## Provenance

- `css2-space-grotesk-jetbrains-mono.original.css`: the Google Fonts API response for `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap`, fetched 2026-10-23 with a Chromium user agent (so the files are woff2). sha256 a8f304f5f8392a9e265e0bd24610f4d24f6e657c6dd44515df241a8efc7d4efe.
- `css2-space-grotesk-jetbrains-mono.css`: the same CSS, normalized. Each `https://fonts.gstatic.com/s/<family>/<version>/<file>` URL is replaced by `https://b1-harness.invalid/fonts/<file>`. The harness answers those URLs from the files in this folder. Nothing else in the CSS was changed.
- The nine woff2 files: fetched from the gstatic URLs listed in the original CSS, with sha256 checked against the copies made from the same fetch. The source URL for each is in `../manifest.json` (`sourceUrl`).

## What is not in this folder

No private asset is listed or copied here. The B1 canvas's private SVG is not a font and is not in this folder.
