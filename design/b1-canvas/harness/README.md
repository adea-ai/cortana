# B1 render and compare harness

The harness renders the declared B1 board set to PNG and compares two runs. It is fail-closed: a run that
did not fully succeed leaves no manifest, and a comparison refuses anything it cannot verify. It measures
raw pixel differences only. It does not establish visual acceptance.

## Commands

Render one run (a new output directory per run):

    python3 design/b1-canvas/harness/render_run.py \
      --project design/b1-canvas/project --out <fresh dir> --parts 4 \
      --font <Space Grotesk woff2> [--chrome <browser>] [--playwright <playwright index.mjs>] [--settle-ms 900] \
      [--allow-incomplete]

- The run renders from a frozen copy of the project (`<out>/_source`). The live project is checked before the render, after it, and against the copy. Any change in between is drift, and the run fails.
- A board is **incomplete** when a required resource (image, font, stylesheet, script, document, fetch, xhr) fails with HTTP 400 or more, fails outright, or is still pending after the page settles; when an `<img>` with a `src` is not loaded; or when the request goes to the network (http or https). A network request counts even if it succeeds, because the run does not pin it. An incomplete board keeps its PNG as evidence.
- Exit 0 only when every part reports zero hard errors, every declared board is either rendered or reported incomplete (no board is silently skipped), every declared board has a 1440x900 PNG, there are no extra PNGs, no drift occurred, and no board is incomplete. Or, with `--allow-incomplete`, the manifest is written and lists the incomplete boards with their reasons under `incomplete`.
- A failed run writes `_FAILED.json` and no manifest. Its PNGs stay in place for diagnosis and are never accepted as evidence.
- The output directory must be new, or hold only a `_RUN` marker naming the same run id. Earlier PNGs are never reused.
- The project must be committed. A dirty project is refused unless `--allow-dirty` is given, and the manifest records that.

Compare two runs:

    python3 design/b1-canvas/harness/compare_renders.py <baseline run> <candidate run> [--allow-incomplete]

The compare refuses (exit 2) when:
- a run has no manifest (the only exception is `--legacy-baseline` for the unmanifested original e8f6 baseline);
- any error report exists in either run (`_FAILED.json`, `_part-*.json` with errors, or a non-empty `_errors*` entry);
- a board is incomplete in either run. With `--allow-incomplete` such a board is listed under INCOMPLETE and is not counted as changed or unchanged;
- a declared board is missing on either side. The only exception is `--unverified-baseline A,B,C`, which names declared boards with no baseline render; each named board must really be missing, and undeclared names are refused;
- a PNG does not match its manifest sha256 (stale or edited);
- a PNG is not 1440x900;
- the runs differ in browser, playwright, font or settle inputs (unless `--allow-input-mismatch`);
- both runs come from the same source tree, so the comparison would be empty.

Tests (no browser needed for most; the browser tests are skipped when Chromium is absent):

    python3 -m unittest discover -s design/b1-canvas/harness/tests -v

The suite covers: stale-directory refusal, a crashed renderer, error reports with a zero exit, skipped and
undersized boards, a board with no report, a missing declared board, incomplete boards (refused by default,
manifested only with `--allow-incomplete`, excluded by compare), live and snapshot source changes during a
render, a failed rerun that cannot be compared against a good run, tampered PNGs, legacy and allowlisted
baselines, input mismatch, and the real `render-all.mjs` refusals. `RealBrowserTests` run the real renderer in
Chromium on fixture boards with a missing image, font, stylesheet, and an external stylesheet; they check that
each is incomplete and that the clean board is not. Set `HARNESS_CHROME` and `HARNESS_PLAYWRIGHT` to override
the default paths. `tests/fake_renderer.py` stands in for the browser in the other tests.

## Reproducibility inputs

Every input that changes the pixels is recorded in `manifest.json` and checked by the compare:

- source: git commit, a dirty flag, the status of the project, and a sha256 over every file under the project (relative path and content). The manifest records the snapshot directory name (`_source`);
- browser: the executable path (`--chrome`, default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) and the version it reports;
- playwright: the module path (`--playwright`, default `/home/user/cortana/node_modules/playwright/index.mjs`);
- font: the path (`--font`) and its sha256. The font is not in the repository. It is the Space Grotesk woff2 from the app build. Without `--font`, no font is injected and the manifest records `font: null`;
- settle time (`--settle-ms`, default 900), viewport 1440x900, part count;
- node and python versions;
- incomplete boards, with their reasons (`incomplete`);
- serving mode (`serving`: `http-local`, the boards are served from the project snapshot by a local server) and the asset map (`assets`: its directory, its manifest sha256 and a sha256 over the whole directory). The asset map is checked before the render and again after it. A change during the run is drift.

## Asset map

`assets/manifest.json` lists the network resources the boards load: the Google Fonts CSS and nine woff2 files. Each entry has a `url`, a committed `file`, its `sha256`, and its `contentType`. The renderer:

- fulfils a request whose URL is listed, from its committed file;
- answers `/_blob/<id>` only when it is listed, and otherwise returns 404, so the board is incomplete;
- aborts every other network request, so its board is incomplete ("not in the asset map").

Licence and provenance for the fonts are in `assets/google-fonts/README.md`. The licence of the fonts is separate from the repository licence.

The public map holds no private asset. A board that needs a `/_blob` image therefore stays incomplete in a public checkout, and the harness reports it as such.

The default paths are local to this environment. Pass the flags to run elsewhere. Changing any of them
makes the compare refuse until `--allow-input-mismatch` is given.

Manifests from before this repair (`tool: render_run/1`) use the older identity, which hashed only the `*.dc.html`, `support.js` and `canvas.json` files. They do not record incomplete boards and do not record a snapshot. Do not compare them against `render_run/2` manifests.

## Legacy files (kept as evidence, do not use)

- `legacy/render-all-02ad20d.mjs` and `legacy/compare-renders-02ad20d.py`: the unfenced renderer and compare. They exit 0 after page errors, leave earlier PNGs in place, and compare only the names both sides share.
- `legacy/changed-set-post-header49-unfenced.txt`: the output of the unfenced compare for the post-Header49 sources. Its numbers are superseded by the manifested run recorded in `../README.md`.
- The e8f6 baseline render (`composed/before` in the scratchpad, outside the repository) has no manifest. Its browser, font and settle inputs are not recorded, and its completeness is unknown, so any comparison against it uses `--legacy-baseline` and reports the inputs as unverified.
- The `render_run/1` manifests and runs made before this repair stay on disk in the scratchpad `composed/runs/` directory. They are kept as evidence and are not used.

## Not covered

- Visual acceptance. The harness reports raw diffs against a reference. Acceptance needs the visual criteria in the board matrix, and no board is accepted by this harness.
- Live canvas publishing. The canvas stays unpublished.
- Images and fonts inside shadow roots are not read directly. Their requests are still tracked, so a failing one still makes its board incomplete.
- Network resources are answered only from the committed asset map. Any other request makes its board incomplete. The map covers the Google Fonts the boards use. It does not cover the `/_blob` image, so the boards that use it stay incomplete in this public checkout.
- At 170884c every declared board is incomplete. Nothing in this environment is verified, see `../README.md` ("Harness status at 170884c").
