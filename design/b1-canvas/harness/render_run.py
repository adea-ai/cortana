# Fail-closed render run for a B1 board set.
#
# One call = one fresh output directory = one run identity. The run writes manifest.json only when every
# declared board rendered, every part reported zero errors, and every PNG is 1440x900. A failed run writes
# _FAILED.json and no manifest, so its PNGs cannot be mistaken for evidence later.
#
# Usage:
#   python3 render_run.py --project <project dir> --out <fresh dir> [--parts 4]
#       [--chrome <browser>] [--playwright <playwright index.mjs>] [--font <woff2>] [--settle-ms 900]
#       [--allow-dirty]
#
# Inputs that change the pixels are recorded in manifest.json: the browser, the playwright module, the font
# file (by sha256), the settle time and the source tree (git commit plus a hash of every project file).
import argparse
import datetime
import glob
import hashlib
import json
import os
import subprocess
import sys
import uuid

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERER = os.path.join(HERE, 'render-all.mjs')
WIDTH, HEIGHT = 1440, 900
TOOL = 'render_run/1'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def git(cwd, *args):
    return subprocess.run(['git', '-C', cwd, *args], capture_output=True, text=True)


def source_identity(project, allow_dirty):
    root = git(project, 'rev-parse', '--show-toplevel')
    if root.returncode != 0:
        raise SystemExit(f'render_run: project is not in a git repository: {project}')
    commit = git(project, 'rev-parse', 'HEAD').stdout.strip()
    status = git(project, 'status', '--porcelain', '--', project).stdout.strip()
    if status and not allow_dirty:
        raise SystemExit(f'render_run: project has uncommitted changes; commit them or pass --allow-dirty:\n{status}')
    files = sorted(glob.glob(os.path.join(project, '*.dc.html')) + [os.path.join(project, 'support.js'), os.path.join(project, 'canvas.json')])
    tree = hashlib.sha256()
    for path in files:
        tree.update(os.path.basename(path).encode() + b'\0' + sha256_file(path).encode() + b'\n')
    return {'commit': commit, 'dirty': bool(status), 'projectTreeSha256': tree.hexdigest(), 'projectFiles': len(files)}


def check_png(path, name):
    with Image.open(path) as im:
        if im.size != (WIDTH, HEIGHT):
            raise ValueError(f'{name}: expected {WIDTH}x{HEIGHT}, got {im.size[0]}x{im.size[1]}')
        im.verify()
    return {'sha256': sha256_file(path), 'width': WIDTH, 'height': HEIGHT}


def renderer_argv():
    override = os.environ.get('RENDER_RUN_RENDERER')  # tests substitute a fake renderer here
    if override:
        return json.loads(override)
    return ['node', RENDERER]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--project', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--parts', type=int, default=4)
    ap.add_argument('--chrome', default='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ap.add_argument('--playwright', default='/home/user/cortana/node_modules/playwright/index.mjs')
    ap.add_argument('--font', default=None)
    ap.add_argument('--settle-ms', type=int, default=900)
    ap.add_argument('--allow-dirty', action='store_true')
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    out = os.path.abspath(args.out)
    if os.path.exists(out) and os.listdir(out):
        raise SystemExit(f'render_run: output directory exists and is not empty (never reuse a run dir): {out}')
    os.makedirs(out, exist_ok=True)
    # run marker: renderer parts accept this directory only for this run id

    with open(os.path.join(project, 'canvas.json'), encoding='utf-8') as f:
        declared = [e[:-len('.dc.html')] if e.endswith('.dc.html') else e for e in json.load(f)['order']]
    if len(set(declared)) != len(declared):
        raise SystemExit('render_run: canvas.json order has duplicate boards')
    run_id = f'{datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")}-{uuid.uuid4().hex[:8]}'
    with open(os.path.join(out, '_RUN'), 'w', encoding='utf-8') as f:
        f.write(run_id + '\n')
    identity = source_identity(project, args.allow_dirty)
    fonts = None
    if args.font:
        fonts = {'path': os.path.abspath(args.font), 'sha256': sha256_file(args.font)}

    procs = []
    for part in range(args.parts):
        argv = renderer_argv() + [
            '--project', project, '--out', out, '--part', str(part), '--parts', str(args.parts),
            '--run-id', run_id, '--chrome', args.chrome, '--playwright', args.playwright,
            '--settle-ms', str(args.settle_ms),
        ]
        if args.font:
            argv += ['--font', args.font]
        procs.append((part, subprocess.run(argv, capture_output=True, text=True)))

    failures = []
    for part, res in procs:
        if res.returncode != 0:
            failures.append({'part': part, 'exit': res.returncode, 'stderr': res.stderr[-1500:]})
    reports = {}
    for part in range(args.parts):
        path = os.path.join(out, f'_part-{part}.json')
        if not os.path.exists(path):
            failures.append({'part': part, 'error': 'no part report written'})
            continue
        with open(path, encoding='utf-8') as f:
            reports[part] = json.load(f)
        if reports[part].get('errors'):
            failures.append({'part': part, 'errors': reports[part]['errors']})
        if reports[part].get('runId') != run_id:
            failures.append({'part': part, 'error': 'run id mismatch in part report'})

    boards = {}
    if not failures:
        expected = set(declared)
        for name in declared:
            path = os.path.join(out, f'{name}.png')
            if not os.path.exists(path):
                failures.append({'board': name, 'error': 'declared board has no PNG'})
                continue
            try:
                boards[name] = check_png(path, name)
            except (ValueError, OSError) as e:
                failures.append({'board': name, 'error': str(e)})
        extra = sorted({os.path.basename(p)[:-4] for p in glob.glob(os.path.join(out, '*.png'))} - expected)
        if extra:
            failures.append({'error': f'PNGs not in the declared set: {extra}'})

    if failures:
        with open(os.path.join(out, '_FAILED.json'), 'w', encoding='utf-8') as f:
            json.dump({'runId': run_id, 'failures': failures}, f, indent=1)
        print(json.dumps({'runId': run_id, 'status': 'FAILED', 'failures': failures, 'out': out}, indent=1))
        return 1

    browser_version = reports[0].get('browserVersion') if reports else None
    manifest = {
        'tool': TOOL,
        'runId': run_id,
        'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': identity,
        'declaredCount': len(declared),
        'declared': declared,
        'boards': boards,
        'inputs': {
            'chrome': os.path.abspath(args.chrome),
            'browserVersion': browser_version,
            'playwright': os.path.abspath(args.playwright),
            'font': fonts,
            'settleMs': args.settle_ms,
            'viewport': [WIDTH, HEIGHT],
            'parts': args.parts,
            'node': subprocess.run(['node', '--version'], capture_output=True, text=True).stdout.strip(),
            'python': sys.version.split()[0],
        },
    }
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps({'runId': run_id, 'status': 'OK', 'boards': len(boards), 'out': out}, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
