# B1 render and compare harness

The harness renders the declared B1 board set to PNG and compares two runs. It is fail-closed: a run that
did not fully succeed leaves no manifest, and a comparison refuses anything it cannot verify. It measures
raw pixel differences only. It does not establish visual acceptance.

## Commands

Render one run (a new output directory per run):

    python3 design/b1-canvas/harness/render_run.py \
      --project design/b1-canvas/project --out <fresh dir> --parts 4 \
      --font <Space Grotesk woff2> [--chrome <browser>] [--playwright <playwright index.mjs>] [--settle-ms 900]

- Exit 0 only when every part reports zero errors, every declared board (`canvas.json` order) has a 1440x900 PNG, there are no extra PNGs, and `manifest.json` is written.
- A failed run writes `_FAILED.json` and no manifest. Its PNGs stay in place for diagnosis and are never accepted as evidence.
- The output directory must be new, or hold only a `_RUN` marker naming the same run id. Earlier PNGs are never reused.
- The project must be committed. A dirty project is refused unless `--allow-dirty` is given, and the manifest records that.

Compare two runs:

    python3 design/b1-canvas/harness/compare_renders.py <baseline run> <candidate run>

The compare refuses (exit 2) when:
- a run has no manifest (the only exception is `--legacy-baseline` for the unmanifested original e8f6 baseline);
- any error report exists in either run (`_FAILED.json`, `_part-*.json` with errors, or a non-empty `_errors*` entry);
- a declared board is missing on either side. The only exception is `--unverified-baseline A,B,C`, which names declared boards with no baseline render; each named board must really be missing, and undeclared names are refused;
- a PNG does not match its manifest sha256 (stale or edited);
- a PNG is not 1440x900;
- the runs differ in browser, playwright, font or settle inputs (unless `--allow-input-mismatch`);
- both runs come from the same source tree, so the comparison would be empty.

Tests (no browser needed):

    python3 -m unittest discover -s design/b1-canvas/harness/tests -v

The suite covers: stale-directory refusal, a crashed renderer, error reports with a zero exit, skipped and
undersized boards, a missing declared board, a failed rerun that cannot be compared against a good run,
tampered PNGs, legacy and allowlisted baselines, input mismatch, and the real `render-all.mjs` refusals.
`tests/fake_renderer.py` stands in for the browser.

## Reproducibility inputs

Every input that changes the pixels is recorded in `manifest.json` and checked by the compare:

- source: git commit, a dirty flag, and a sha256 over every `*.dc.html`, `support.js` and `canvas.json` in the project;
- browser: the executable path (`--chrome`, default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) and the version it reports;
- playwright: the module path (`--playwright`, default `/home/user/cortana/node_modules/playwright/index.mjs`);
- font: the path (`--font`) and its sha256. The font is not in the repository. It is the Space Grotesk woff2 from the app build. Without `--font`, no font is injected and the manifest records `font: null`;
- settle time (`--settle-ms`, default 900), viewport 1440x900, part count;
- node and python versions.

The default paths are local to this environment. Pass the flags to run elsewhere. Changing any of them
makes the compare refuse until `--allow-input-mismatch` is given.

## Legacy files (kept as evidence, do not use)

- `legacy/render-all-02ad20d.mjs` and `legacy/compare-renders-02ad20d.py`: the unfenced renderer and compare. They exit 0 after page errors, leave earlier PNGs in place, and compare only the names both sides share.
- `legacy/changed-set-post-header49-unfenced.txt`: the output of the unfenced compare for the post-Header49 sources. Its numbers are superseded by the manifested run recorded in `../README.md`.
- The e8f6 baseline render (`composed/before` in the scratchpad, outside the repository) has no manifest. Its browser, font and settle inputs are not recorded, so any comparison against it uses `--legacy-baseline` and reports the inputs as unverified.

## Not covered

- Visual acceptance. The harness reports raw diffs against a reference. Acceptance needs the visual criteria in the board matrix, and no board is accepted by this harness.
- Live canvas publishing. The canvas stays unpublished.
