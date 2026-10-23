# Fail-closed render run for a B1 board set.
#
# One call = one fresh output directory = one run identity. The run renders from a frozen snapshot of the
# project (<out>/_source), checks that the live project and the snapshot still match the identity taken
# before the render, and writes manifest.json only when:
#   - every declared board is accounted for by its part (rendered, or reported incomplete with reasons),
#   - no part reported an error,
#   - every PNG is 1440x900,
#   - no board is incomplete, unless --allow-incomplete is given (then the manifest lists them),
#   - the source identity and the font are unchanged after the render (drift is refused).
# A failed run writes _FAILED.json and no manifest, so its PNGs cannot be mistaken for evidence later.
#
# Usage:
#   python3 render_run.py --project <project dir> --out <fresh dir> [--parts 4]
#       [--chrome <browser>] [--playwright <playwright index.mjs>] [--font <woff2>] [--settle-ms 900]
#       [--allow-dirty] [--allow-incomplete]
#
# Inputs that change the pixels are recorded in manifest.json: the browser, the playwright module, the font
# file (by sha256), the settle time and the source (git commit, status, and a hash of every project file).
import argparse
import datetime
import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERER = os.path.join(HERE, 'render-all.mjs')
WIDTH, HEIGHT = 1440, 900
TOOL = 'render_run/3'
ASSETS = os.path.join(HERE, 'assets')
SNAPSHOT = '_source'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def git(cwd, *args):
    return subprocess.run(['git', '-C', cwd, *args], capture_output=True, text=True)


def tree_sha256(root):
    """Hash of every regular file under root (relative path and content), in sorted order."""
    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            entries.append((os.path.relpath(path, root), path))
    h = hashlib.sha256()
    for rel, path in sorted(entries):
        h.update(rel.encode() + b'\0' + sha256_file(path).encode() + b'\n')
    return h.hexdigest(), len(entries)


def source_identity(project, allow_dirty):
    root = git(project, 'rev-parse', '--show-toplevel')
    if root.returncode != 0:
        raise SystemExit(f'render_run: project is not in a git repository: {project}')
    commit = git(project, 'rev-parse', 'HEAD').stdout.strip()
    status = git(project, 'status', '--porcelain', '--', project).stdout.strip()
    if status and not allow_dirty:
        raise SystemExit(f'render_run: project has uncommitted changes; commit them or pass --allow-dirty:\n{status}')
    tree, count = tree_sha256(project)
    return {
        'commit': commit,
        'dirty': bool(status),
        'statusSha256': hashlib.sha256(status.encode()).hexdigest(),
        'projectTreeSha256': tree,
        'projectFiles': count,
    }


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


def font_identity(path):
    if not path:
        return None
    return {'path': os.path.abspath(path), 'sha256': sha256_file(path)}


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
    ap.add_argument('--allow-incomplete', action='store_true',
                    help='write a manifest that lists incomplete boards instead of failing the run')
    ap.add_argument('--assets', default=ASSETS, help='committed asset map (network resources the boards load)')
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    out = os.path.abspath(args.out)
    if os.path.exists(out) and os.listdir(out):
        raise SystemExit(f'render_run: output directory exists and is not empty (never reuse a run dir): {out}')
    os.makedirs(out, exist_ok=True)

    with open(os.path.join(project, 'canvas.json'), encoding='utf-8') as f:
        declared = [e[:-len('.dc.html')] if e.endswith('.dc.html') else e for e in json.load(f)['order']]
    if len(set(declared)) != len(declared):
        raise SystemExit('render_run: canvas.json order has duplicate boards')
    run_id = f'{datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")}-{uuid.uuid4().hex[:8]}'
    with open(os.path.join(out, '_RUN'), 'w', encoding='utf-8') as f:
        f.write(run_id + '\n')

    # Identity before anything is rendered, then a frozen copy of the project. The renderers read the copy,
    # so a change to the live project during the run cannot change the pixels; the live project is still
    # re-checked afterwards, and any change is drift.
    identity = source_identity(project, args.allow_dirty)
    fonts = font_identity(args.font)
    assets_dir = os.path.abspath(args.assets)
    if not os.path.exists(os.path.join(assets_dir, 'manifest.json')):
        raise SystemExit(f'render_run: no asset map at {assets_dir}')
    assets_before = tree_sha256(assets_dir)
    assets_manifest_sha = sha256_file(os.path.join(assets_dir, 'manifest.json'))
    snapshot = os.path.join(out, SNAPSHOT)
    shutil.copytree(project, snapshot)
    snap_tree, _ = tree_sha256(snapshot)
    failures = []
    if snap_tree != identity['projectTreeSha256']:
        failures.append({'error': 'source changed while it was being snapshotted', 'before': identity['projectTreeSha256'], 'after': snap_tree})

    procs = []
    if not failures:
        for part in range(args.parts):
            argv = renderer_argv() + [
                '--project', snapshot, '--out', out, '--part', str(part), '--parts', str(args.parts),
                '--run-id', run_id, '--chrome', args.chrome, '--playwright', args.playwright,
                '--settle-ms', str(args.settle_ms), '--assets', assets_dir,
            ]
            if args.font:
                argv += ['--font', args.font]
            procs.append((part, subprocess.run(argv, capture_output=True, text=True)))

    for part, res in procs:
        if res.returncode != 0:
            failures.append({'part': part, 'exit': res.returncode, 'stderr': res.stderr[-1500:]})

    # Drift: the live project, the snapshot and the font must still match the identity taken before the render.
    after = source_identity(project, allow_dirty=True)
    after_snapshot, _ = tree_sha256(snapshot)
    if after != identity:
        failures.append({'error': 'source drift during render (live project changed)', 'before': identity, 'after': after})
    if after_snapshot != identity['projectTreeSha256']:
        failures.append({'error': 'source drift during render (snapshot changed)', 'before': identity['projectTreeSha256'], 'after': after_snapshot})
    if font_identity(args.font) != fonts:
        failures.append({'error': 'font changed during render', 'before': fonts, 'after': font_identity(args.font)})
    assets_after = tree_sha256(assets_dir)
    if assets_after != assets_before:
        failures.append({'error': 'asset map changed during render', 'before': assets_before[0], 'after': assets_after[0]})

    reports = {}
    incomplete = {}
    for part in range(args.parts):
        path = os.path.join(out, f'_part-{part}.json')
        if not os.path.exists(path):
            failures.append({'part': part, 'error': 'no part report written'})
            continue
        with open(path, encoding='utf-8') as f:
            reports[part] = json.load(f)
        rep = reports[part]
        if rep.get('errors'):
            failures.append({'part': part, 'errors': rep['errors']})
        if rep.get('runId') != run_id:
            failures.append({'part': part, 'error': 'run id mismatch in part report'})
        if rep.get('assetsSha256') != assets_manifest_sha or rep.get('serving') != 'http-local':
            failures.append({'part': part, 'error': 'part report used a different asset map or serving mode'})
        accounted = set(rep.get('rendered', [])) | {e['board'] for e in rep.get('incomplete', [])}
        unaccounted = sorted(set(rep.get('declaredInPart', [])) - accounted)
        if unaccounted:
            failures.append({'part': part, 'error': f'declared boards neither rendered nor reported incomplete: {unaccounted}'})
        for e in rep.get('incomplete', []):
            incomplete[e['board']] = e['reasons']

    boards = {}
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

    incomplete_names = sorted(incomplete)
    if incomplete_names and not args.allow_incomplete:
        failures.append({'error': f'{len(incomplete_names)} board(s) incomplete; pass --allow-incomplete to manifest them', 'incomplete': incomplete})

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
        'snapshot': SNAPSHOT,
        'declaredCount': len(declared),
        'declared': declared,
        'boards': boards,
        'incomplete': incomplete,
        'inputs': {
            'chrome': os.path.abspath(args.chrome),
            'browserVersion': browser_version,
            'playwright': os.path.abspath(args.playwright),
            'font': fonts,
            'serving': 'http-local',
            'assets': {'dir': assets_dir, 'manifestSha256': assets_manifest_sha, 'treeSha256': assets_before[0], 'files': assets_before[1]},
            'settleMs': args.settle_ms,
            'viewport': [WIDTH, HEIGHT],
            'parts': args.parts,
            'node': subprocess.run(['node', '--version'], capture_output=True, text=True).stdout.strip(),
            'python': sys.version.split()[0],
        },
    }
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    status = 'OK' if not incomplete_names else 'OK-WITH-INCOMPLETE'
    print(json.dumps({'runId': run_id, 'status': status, 'boards': len(boards), 'incomplete': incomplete_names, 'out': out}, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
