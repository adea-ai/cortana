# Stand-in for render-all.mjs used only by test_harness.py. It writes solid-colour PNGs whose colour
# depends on each board's source bytes, so an edited board changes its pixels. FAKE_MODE selects a behaviour:
#   ok              normal run
#   crash           exit 1 before writing anything
#   errors          writes a part report with errors and exits 1
#   errors_exit0    writes a part report with errors but exits 0 (must still fail the run)
#   skip            silently omits one declared board (it is neither rendered nor reported)
#   tiny            writes one board at 100x100
#   incomplete      writes one board's PNG but reports it incomplete instead of rendered (exit 0)
#   mutate_live     appends a byte to the file at FAKE_MUTATE_PATH (the live project) during the render
#   mutate_snapshot appends a byte to the first declared board in the --project directory during the render
import argparse
import hashlib
import json
import os
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    for flag in ['--project', '--out', '--part', '--parts', '--run-id', '--chrome', '--playwright', '--font', '--settle-ms']:
        ap.add_argument(flag, default=None)
    a = ap.parse_args()
    mode = os.environ.get('FAKE_MODE', 'ok')
    with open(os.path.join(a.project, 'canvas.json')) as f:
        declared = [e[:-len('.dc.html')] if e.endswith('.dc.html') else e for e in json.load(f)['order']]
    missing = [n for n in declared if not os.path.exists(os.path.join(a.project, f'{n}.dc.html'))]
    if missing:
        print(f'declared boards missing: {missing}', file=sys.stderr)
        return 1
    if mode == 'crash':
        return 1
    part, parts = int(a.part), int(a.parts)
    names = [n for i, n in enumerate(declared) if i % parts == part]
    rendered, incomplete, errors = [], [], []
    for n in names:
        if mode == 'skip' and part == 0 and n == names[0]:
            continue
        with open(os.path.join(a.project, f'{n}.dc.html'), 'rb') as f:
            digest = hashlib.sha256(f.read()).digest()
        size = (100, 100) if (mode == 'tiny' and part == 0 and n == names[0]) else (1440, 900)
        Image.new('RGB', size, tuple(digest[:3])).save(os.path.join(a.out, f'{n}.png'))
        if mode == 'incomplete' and part == 0 and n == names[0]:
            incomplete.append({'board': n, 'reasons': ['image HTTP 404: missing.png']})
        else:
            rendered.append(n)
    if mode in ('mutate_live', 'mutate_snapshot') and part == 0:
        target = os.environ['FAKE_MUTATE_PATH'] if mode == 'mutate_live' else os.path.join(a.project, f'{declared[0]}.dc.html')
        with open(target, 'ab') as f:
            f.write(b'\n<!-- changed during render -->\n')
    if mode in ('errors', 'errors_exit0'):
        errors.append({'board': names[0], 'pageErrors': ['boom']})
    with open(os.path.join(a.out, f'_part-{part}.json'), 'w') as f:
        json.dump({'runId': a.run_id, 'part': part, 'parts': parts, 'browserVersion': 'fake-1',
                   'declaredInPart': names, 'rendered': rendered, 'incomplete': incomplete, 'errors': errors}, f)
    return 1 if mode == 'errors' else 0


if __name__ == '__main__':
    sys.exit(main())
