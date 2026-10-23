# Regression tests for the fail-closed render and compare harness.
# They run render_run.py with a fake renderer (no browser), so they check the harness logic itself:
# a failed or partial run must never leave a manifest that a later compare would accept, and stale PNGs
# must never be reused.
#
# Run: python3 -m unittest discover -s design/b1-canvas/harness/tests -v
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDER_RUN = os.path.join(HARNESS, 'render_run.py')
COMPARE = os.path.join(HARNESS, 'compare_renders.py')
FAKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fake_renderer.py')


def git(cwd, *args):
    subprocess.run(['git', '-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', *args],
                   check=True, capture_output=True, text=True)


def make_project(root, names, missing=(), content='v1', file_names=False):
    """A git repo at root holding a project/ with canvas.json declaring `names`.

    file_names=True writes canvas.json entries as file names (Main.dc.html), as the real canvas.json does.
    """
    os.makedirs(os.path.join(root, 'project'), exist_ok=True)
    project = os.path.join(root, 'project')
    order = [f'{n}.dc.html' for n in names] if file_names else list(names)
    canvas = {'order': order, 'boards': {o: {} for o in order}}
    with open(os.path.join(project, 'canvas.json'), 'w') as f:
        json.dump(canvas, f)
    with open(os.path.join(project, 'support.js'), 'w') as f:
        f.write('// support\n')
    for n in names:
        if n in missing:
            continue
        with open(os.path.join(project, f'{n}.dc.html'), 'w') as f:
            f.write(f'<board {n} {content}>\n')
    if not os.path.exists(os.path.join(root, '.git')):
        git(root, 'init', '-q')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '--allow-empty', '-m', f'{content}')
    return project


def run_render(project, out, mode='ok', settle='900', parts='2'):
    env = dict(os.environ)
    env['RENDER_RUN_RENDERER'] = json.dumps([sys.executable, FAKE])
    env['FAKE_MODE'] = mode
    return subprocess.run([sys.executable, RENDER_RUN, '--project', project, '--out', out,
                           '--parts', parts, '--settle-ms', settle, '--chrome', '/bin/true',
                           '--playwright', '/bin/true'],
                          capture_output=True, text=True, env=env)


def run_compare(base, cand, *extra):
    return subprocess.run([sys.executable, COMPARE, base, cand, *extra], capture_output=True, text=True)


NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']


class RenderRunTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='harness-test-')

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def path(self, *p):
        return os.path.join(self.root, *p)

    def test_clean_run_writes_manifest_and_all_pngs(self):
        project = make_project(self.path('repo'), NAMES)
        res = run_render(project, self.path('runs', 'ok'))
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        with open(self.path('runs', 'ok', 'manifest.json')) as f:
            m = json.load(f)
        self.assertEqual(sorted(m['boards']), sorted(NAMES))
        self.assertEqual(m['declared'], NAMES)
        self.assertEqual(len(m['source']['commit']), 40)
        self.assertFalse(m['source']['dirty'])

    def test_real_canvas_format_with_file_names_renders_and_manifests(self):
        project = make_project(self.path('repo'), NAMES, file_names=True)
        out = self.path('runs', 'filenames')
        res = run_render(project, out)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        with open(os.path.join(out, 'manifest.json')) as f:
            m = json.load(f)
        self.assertEqual(m['declared'], NAMES)
        self.assertEqual(sorted(m['boards']), sorted(NAMES))

    def test_existing_output_directory_is_refused_and_untouched(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'stale')
        os.makedirs(out)
        stale = os.path.join(out, 'Alpha.png')
        with open(stale, 'wb') as f:
            f.write(b'stale-bytes')
        res = run_render(project, out)
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('not empty', res.stdout + res.stderr)
        with open(stale, 'rb') as f:
            self.assertEqual(f.read(), b'stale-bytes')
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))

    def test_crashed_renderer_writes_no_manifest(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'crash')
        res = run_render(project, out, mode='crash')
        self.assertNotEqual(res.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        self.assertTrue(os.path.exists(os.path.join(out, '_FAILED.json')))

    def test_error_report_fails_even_when_renderer_exits_zero(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'errors0')
        res = run_render(project, out, mode='errors_exit0')
        self.assertNotEqual(res.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))

    def test_renderer_reported_failure_fails_run(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'errors1')
        res = run_render(project, out, mode='errors')
        self.assertNotEqual(res.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))

    def test_skipped_declared_board_fails_run(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'skip')
        res = run_render(project, out, mode='skip')
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('no PNG', res.stdout)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))

    def test_wrong_dimensions_fail_run(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'tiny')
        res = run_render(project, out, mode='tiny')
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('expected 1440x900', res.stdout)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))

    def test_declared_board_missing_on_disk_fails_before_render(self):
        project = make_project(self.path('repo'), NAMES, missing=['Gamma'])
        out = self.path('runs', 'missing')
        res = run_render(project, out)
        self.assertNotEqual(res.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        self.assertFalse(any(f.endswith('.png') for f in os.listdir(out)))

    def test_failed_rerun_cannot_reuse_a_previous_run(self):
        """A failed rerun writes a fresh directory with no manifest. Comparing it against the good run is refused."""
        project = make_project(self.path('repo'), NAMES)
        good = self.path('runs', 'good')
        self.assertEqual(run_render(project, good).returncode, 0)
        bad = self.path('runs', 'bad-rerun')
        self.assertNotEqual(run_render(project, bad, mode='skip').returncode, 0)
        res = run_compare(good, bad)
        self.assertEqual(res.returncode, 2, res.stdout)
        self.assertIn('REFUSED', res.stdout)


RENDER_ALL = os.path.join(HARNESS, 'render-all.mjs')


class RealRendererChecksTests(unittest.TestCase):
    """The real render-all.mjs refuses before it starts a browser: stale directories and missing boards."""

    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='harness-node-')

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def render(self, project, out, run_id='run-B'):
        return subprocess.run(['node', RENDER_ALL, '--project', project, '--out', out, '--part', '0', '--parts', '1',
                               '--run-id', run_id, '--chrome', '/bin/true', '--playwright', '/bin/true'],
                              capture_output=True, text=True)

    def test_directory_claimed_by_another_run_is_refused(self):
        project = make_project(os.path.join(self.root, 'repo'), NAMES)
        out = os.path.join(self.root, 'runs', 'stale')
        os.makedirs(out)
        with open(os.path.join(out, '_RUN'), 'w') as f:
            f.write('run-A\n')
        with open(os.path.join(out, 'Alpha.png'), 'wb') as f:
            f.write(b'run-A-bytes')
        res = self.render(project, out, run_id='run-B')
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('belongs to another run', res.stderr)
        with open(os.path.join(out, 'Alpha.png'), 'rb') as f:
            self.assertEqual(f.read(), b'run-A-bytes')

    def test_unclaimed_nonempty_directory_is_refused(self):
        project = make_project(os.path.join(self.root, 'repo'), NAMES)
        out = os.path.join(self.root, 'runs', 'unclaimed')
        os.makedirs(out)
        with open(os.path.join(out, 'Alpha.png'), 'wb') as f:
            f.write(b'old')
        res = self.render(project, out)
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('not a run directory', res.stderr)

    def test_declared_board_missing_is_refused_before_claiming_directory(self):
        project = make_project(os.path.join(self.root, 'repo'), NAMES, missing=['Beta'])
        out = os.path.join(self.root, 'runs', 'missing')
        res = self.render(project, out)
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('declared boards missing on disk', res.stderr)
        self.assertFalse(os.path.exists(out))


class CompareTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='harness-cmp-')

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def path(self, *p):
        return os.path.join(self.root, *p)

    def two_runs(self, changed_name='Beta'):
        """Baseline at source v1; candidate at source v2 where only `changed_name` changed."""
        repo = self.path('repo')
        project = make_project(repo, NAMES, content='v1')
        base = self.path('runs', 'base')
        self.assertEqual(run_render(project, base).returncode, 0)
        with open(os.path.join(project, f'{changed_name}.dc.html'), 'w') as f:
            f.write(f'<board {changed_name} v2-changed>\n')
        git(repo, 'add', '-A')
        git(repo, 'commit', '-q', '-m', 'v2')
        cand = self.path('runs', 'cand')
        self.assertEqual(run_render(project, cand).returncode, 0)
        return base, cand

    def test_compare_reports_only_the_changed_board(self):
        base, cand = self.two_runs('Beta')
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        changed = res.stdout.split('\nCHANGED\n')[1].split('\nUNCHANGED\n')[0].strip().splitlines()
        self.assertEqual([line.split('\t')[0] for line in changed], ['Beta'])
        self.assertIn('unchanged: 4', res.stdout)

    def test_missing_candidate_png_is_refused(self):
        base, cand = self.two_runs()
        os.remove(os.path.join(cand, 'Delta.png'))
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2)
        self.assertIn('no PNG', res.stdout)

    def test_missing_baseline_png_is_refused_without_allowlist(self):
        base, cand = self.two_runs()
        os.remove(os.path.join(base, 'Alpha.png'))
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2)
        self.assertIn('baseline is missing declared boards', res.stdout)

    def test_error_report_in_either_run_is_refused(self):
        base, cand = self.two_runs()
        with open(os.path.join(cand, '_errors-0.json'), 'w') as f:
            f.write('{"Alpha": ["boom"]}')
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2)
        self.assertIn('error reports', res.stdout)

    def test_empty_legacy_error_object_is_not_an_error(self):
        base, cand = self.two_runs()
        with open(os.path.join(base, '_errors-0.json'), 'w') as f:
            f.write('{}')
        self.assertEqual(run_compare(base, cand, '--legacy-baseline').returncode, 0)

    def test_tampered_png_is_refused(self):
        base, cand = self.two_runs()
        with open(os.path.join(cand, 'Alpha.png'), 'ab') as f:
            f.write(b'\0')  # stale or edited image: bytes no longer match the manifest digest
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2)
        self.assertIn('does not match its manifest digest', res.stdout)

    def test_run_without_manifest_is_refused_unless_legacy(self):
        base, cand = self.two_runs()
        os.remove(os.path.join(base, 'manifest.json'))
        self.assertEqual(run_compare(base, cand).returncode, 2)
        res = run_compare(base, cand, '--legacy-baseline')
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('LEGACY', res.stdout)

    def test_legacy_baseline_missing_a_board_needs_explicit_allowlist(self):
        base, cand = self.two_runs()
        os.remove(os.path.join(base, 'Epsilon.png'))
        os.remove(os.path.join(base, 'manifest.json'))
        self.assertEqual(run_compare(base, cand, '--legacy-baseline').returncode, 2)
        res = run_compare(base, cand, '--legacy-baseline', '--unverified-baseline', 'Epsilon')
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('UNVERIFIED\nEpsilon', res.stdout)

    def test_allowlist_cannot_name_a_board_that_exists_or_is_undeclared(self):
        base, cand = self.two_runs()
        self.assertEqual(run_compare(base, cand, '--unverified-baseline', 'Alpha').returncode, 2)
        self.assertEqual(run_compare(base, cand, '--unverified-baseline', 'NotDeclared').returncode, 2)

    def test_different_render_inputs_are_refused(self):
        repo = self.path('repo')
        project = make_project(repo, NAMES, content='v1')
        base = self.path('runs', 'base')
        self.assertEqual(run_render(project, base, settle='900').returncode, 0)
        with open(os.path.join(project, 'Beta.dc.html'), 'w') as f:
            f.write('<board Beta v2>\n')
        git(repo, 'add', '-A')
        git(repo, 'commit', '-q', '-m', 'v2')
        cand = self.path('runs', 'cand')
        self.assertEqual(run_render(project, cand, settle='1200').returncode, 0)
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2)
        self.assertIn('render inputs differ', res.stdout)
        self.assertEqual(run_compare(base, cand, '--allow-input-mismatch').returncode, 0)

    def test_same_source_tree_is_refused(self):
        repo = self.path('repo')
        project = make_project(repo, NAMES, content='v1')
        a = self.path('runs', 'a')
        b = self.path('runs', 'b')
        self.assertEqual(run_render(project, a).returncode, 0)
        self.assertEqual(run_render(project, b).returncode, 0)
        res = run_compare(a, b)
        self.assertEqual(res.returncode, 2)
        self.assertIn('same source tree', res.stdout)


if __name__ == '__main__':
    unittest.main()
