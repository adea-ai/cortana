# Strict comparison of two render runs of the same declared board set. Fail-closed:
#   - a run without manifest.json is refused, unless it is the legacy baseline and --legacy-baseline is given
#   - a manifest must be the current tool (render_run/2) and record its incomplete boards. An old or unversioned
#     manifest is refused, unless it is the baseline and --legacy-baseline is given; then the baseline is marked
#     LEGACY with completeness UNVERIFIED. A candidate is never legacy
#   - any error report (_part-*.json with errors, _errors-*.json, _FAILED.json) fails the comparison
#   - every declared board must exist on both sides; the only exception is an explicit --unverified-baseline list
#     that names declared boards with no baseline render, and each named board must really be missing
#   - a board listed as incomplete in either manifest is refused, unless --allow-incomplete is given; with it,
#     that board is reported under INCOMPLETE and is not counted as changed or unchanged
#   - each PNG must match the sha256 recorded in its run's manifest (stale or edited images fail)
#   - dimensions must be 1440x900
#   - the two runs must agree on the browser, playwright, font and settle inputs, unless --allow-input-mismatch
# Exit 0 only when every check passes; 2 otherwise.
#
# Usage:
#   python3 compare_renders.py <baseline dir> <candidate dir> [--legacy-baseline]
#       [--unverified-baseline A,B,C] [--allow-input-mismatch] [--allow-incomplete]
import argparse
import glob
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 1440, 900
THRESHOLD = 24


class Refused(Exception):
    pass


CURRENT_TOOL = 'render_run/2'


def check_manifest(m, label, legacy_ok):
    """Return 'current' or 'legacy'. Refuses any manifest that is not the current tool, unless legacy_ok.

    A current manifest must record its incomplete boards. A legacy manifest (old tool version or none) can be
    compared only with legacy_ok, and then its completeness is unverified.
    """
    tool = m.get('tool')
    if tool != CURRENT_TOOL:
        if legacy_ok:
            return 'legacy'
        raise Refused(f'{label}: manifest tool is {tool!r}, expected {CURRENT_TOOL!r}; old or unversioned manifests need --legacy-baseline and are not verified (candidates are never legacy)')
    if not isinstance(m.get('incomplete'), dict):
        raise Refused(f'{label}: manifest records no incomplete-board metadata; completeness cannot be verified')
    return 'current'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def load_manifest(run_dir, label, legacy_ok):
    path = os.path.join(run_dir, 'manifest.json')
    if not os.path.exists(path):
        if legacy_ok:
            return None
        raise Refused(f'{label}: no manifest.json in {run_dir} (use --legacy-baseline only for the unmanifested original baseline)')
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def check_no_error_reports(run_dir, label):
    problems = []
    if os.path.exists(os.path.join(run_dir, '_FAILED.json')):
        problems.append('_FAILED.json present')
    for path in glob.glob(os.path.join(run_dir, '_errors*')):
        # legacy renderer wrote an error object per run; an empty object means no errors
        try:
            with open(path, encoding='utf-8') as f:
                content = json.load(f)
        except (OSError, ValueError):
            problems.append(f'{os.path.basename(path)} is unreadable')
            continue
        if content:
            problems.append(f'{os.path.basename(path)} has {len(content)} entr{"y" if len(content) == 1 else "ies"}')
    for path in glob.glob(os.path.join(run_dir, '_part-*.json')):
        with open(path, encoding='utf-8') as f:
            rep = json.load(f)
        if rep.get('errors'):
            problems.append(f'{os.path.basename(path)} has {len(rep["errors"])} error(s)')
    if problems:
        raise Refused(f'{label}: error reports in {run_dir}: {", ".join(problems)}')


def check_png(path, name, label, expected_sha):
    if not os.path.exists(path):
        raise Refused(f'{label}: declared board has no PNG: {name}')
    with Image.open(path) as im:
        if im.size != (WIDTH, HEIGHT):
            raise Refused(f'{label}: {name} is {im.size[0]}x{im.size[1]}, expected {WIDTH}x{HEIGHT}')
    if expected_sha is not None and sha256_file(path) != expected_sha:
        raise Refused(f'{label}: {name}.png does not match its manifest digest (stale or edited)')


def input_key(manifest):
    inp = manifest['inputs']
    font = inp.get('font') or {}
    return {
        'browserVersion': inp.get('browserVersion'),
        'playwright': inp.get('playwright'),
        'fontSha256': font.get('sha256'),
        'settleMs': inp.get('settleMs'),
        'viewport': inp.get('viewport'),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('baseline')
    ap.add_argument('candidate')
    ap.add_argument('--legacy-baseline', action='store_true')
    ap.add_argument('--unverified-baseline', default='')
    ap.add_argument('--allow-input-mismatch', action='store_true')
    ap.add_argument('--allow-incomplete', action='store_true')
    args = ap.parse_args()

    try:
        cand_m = load_manifest(args.candidate, 'candidate', legacy_ok=False)
        base_m = load_manifest(args.baseline, 'baseline', legacy_ok=args.legacy_baseline)
        check_manifest(cand_m, 'candidate', legacy_ok=False)
        base_status = check_manifest(base_m, 'baseline', legacy_ok=args.legacy_baseline) if base_m is not None else 'none'
        check_no_error_reports(args.candidate, 'candidate')
        check_no_error_reports(args.baseline, 'baseline')

        declared = cand_m['declared']
        declared_set = set(declared)
        allow_missing = {n for n in args.unverified_baseline.split(',') if n}
        for n in allow_missing:
            if n not in declared_set:
                raise Refused(f'--unverified-baseline names an undeclared board: {n}')

        if base_m is not None and base_m['declared'] != declared:
            raise Refused('baseline and candidate declare different board sets')
        if base_m is not None and base_m['source']['commit'] == cand_m['source']['commit'] and base_m['source']['projectTreeSha256'] == cand_m['source']['projectTreeSha256']:
            raise Refused('baseline and candidate are the same source tree; the comparison would be empty')
        if (base_m is not None and base_m['source']['dirty']) or cand_m['source']['dirty']:
            raise Refused('a run was made from uncommitted sources')

        base_inputs_known = base_m is not None
        if base_inputs_known and input_key(base_m) != input_key(cand_m) and not args.allow_input_mismatch:
            raise Refused(f'render inputs differ: baseline {input_key(base_m)} vs candidate {input_key(cand_m)}')

        cand_inc = cand_m['incomplete']
        # A legacy baseline has no completeness record, so its boards are not known to be complete.
        base_inc = base_m['incomplete'] if base_status == 'current' else {}
        incomplete_any = sorted(set(cand_inc) | set(base_inc))
        if incomplete_any and not args.allow_incomplete:
            raise Refused(f'incomplete boards (refused without --allow-incomplete): {incomplete_any}')

        base_sha = base_m['boards'] if base_m is not None else {}
        cand_sha = cand_m['boards']
        base_names = set(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(args.baseline, '*.png')))
        missing_base = sorted(declared_set - base_names)
        unexpected_missing = [n for n in missing_base if n not in allow_missing]
        if unexpected_missing:
            raise Refused(f'baseline is missing declared boards (not in --unverified-baseline): {unexpected_missing}')
        stale_allow = [n for n in allow_missing if n in base_names]
        if stale_allow:
            raise Refused(f'--unverified-baseline names boards that do exist in the baseline: {stale_allow}')
        extra_base = sorted(base_names - declared_set)

        changed, unchanged, incomplete_rows = [], [], []
        for name in declared:
            check_png(os.path.join(args.candidate, f'{name}.png'), name, 'candidate', cand_sha[name]['sha256'])
            if name in allow_missing:
                continue
            check_png(os.path.join(args.baseline, f'{name}.png'), name, 'baseline', base_sha.get(name, {}).get('sha256') if base_m is not None else None)
            if name in incomplete_any:
                sides = [s for s, inc in (('baseline', base_inc), ('candidate', cand_inc)) if name in inc]
                incomplete_rows.append((name, ','.join(sides)))
                continue
            a = np.asarray(Image.open(os.path.join(args.baseline, f'{name}.png')).convert('RGB')).astype(int)
            b = np.asarray(Image.open(os.path.join(args.candidate, f'{name}.png')).convert('RGB')).astype(int)
            pct = 100 * (np.abs(a - b).max(axis=2) > THRESHOLD).mean()
            (changed if pct > 0 else unchanged).append((name, pct))
    except Refused as e:
        print(f'compare_renders: REFUSED: {e}')
        return 2

    if base_m is None:
        base_desc = 'LEGACY, unmanifested, inputs and completeness UNVERIFIED'
    elif base_status == 'legacy':
        base_desc = f'LEGACY manifest, tool {base_m.get("tool")!r}, inputs and completeness UNVERIFIED'
    else:
        base_desc = f'manifest {base_m["runId"]} @ {base_m["source"]["commit"][:12]}'
    print(f'baseline: {args.baseline}  ({base_desc})')
    print(f'candidate: {args.candidate}  (manifest {cand_m["runId"]} @ {cand_m["source"]["commit"][:12]})')
    print(f'declared: {len(declared)}  compared: {len(changed) + len(unchanged)}  changed: {len(changed)}  unchanged: {len(unchanged)}  incomplete: {len(incomplete_rows)}  unverified (no baseline): {sorted(allow_missing)}')
    if extra_base:
        print(f'baseline PNGs outside the declared set (ignored): {extra_base}')
    print('CHANGED')
    for name, pct in changed:
        print(f'{name}\t{pct:.3f}')
    print('UNCHANGED')
    for name, _ in unchanged:
        print(name)
    print('UNVERIFIED')
    for name in sorted(allow_missing):
        print(name)
    print('INCOMPLETE')
    for name, sides in incomplete_rows:
        print(f'{name}\t{sides}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
