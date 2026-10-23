# Regression tests for the fail-closed render and compare harness.
# Most tests run render_run.py with a fake renderer (no browser), so they check the harness logic itself:
# a failed, partial, incomplete or drifted run must never leave a manifest that a later compare would accept,
# and stale PNGs must never be reused. The RealBrowserTests run the real render-all.mjs in Chromium against
# fixture boards with a missing image, font and stylesheet; they are skipped when no browser is installed.
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
CHROME = os.environ.get('HARNESS_CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
PLAYWRIGHT = os.environ.get('HARNESS_PLAYWRIGHT', '/home/user/cortana/node_modules/playwright/index.mjs')


def git(cwd, *args):
    subprocess.run(['git', '-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', *args],
                   check=True, capture_output=True, text=True)


def make_project(root, names, missing=(), content='v1', file_names=False, bodies=None):
    """A git repo at root holding a project/ with canvas.json declaring `names`.

    file_names=True writes canvas.json entries as file names (Main.dc.html), as the real canvas.json does.
    bodies maps a board name to its exact HTML; other boards get a one-line marker.
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
            f.write(bodies[n] if bodies and n in bodies else f'<board {n} {content}>\n')
    if not os.path.exists(os.path.join(root, '.git')):
        git(root, 'init', '-q')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '--allow-empty', '-m', f'{content}')
    return project


def run_render(project, out, mode='ok', settle='900', parts='2', extra=(), env_extra=None):
    env = dict(os.environ)
    env['RENDER_RUN_RENDERER'] = json.dumps([sys.executable, FAKE])
    env['FAKE_MODE'] = mode
    env.update(env_extra or {})
    return subprocess.run([sys.executable, RENDER_RUN, '--project', project, '--out', out,
                           '--parts', parts, '--settle-ms', settle, '--chrome', '/bin/true',
                           '--playwright', '/bin/true', *extra],
                          capture_output=True, text=True, env=env)


def run_real(project, out, extra=()):
    env = dict(os.environ)
    env.pop('RENDER_RUN_RENDERER', None)
    return subprocess.run([sys.executable, RENDER_RUN, '--project', project, '--out', out, '--parts', '1',
                           '--settle-ms', '300', '--chrome', CHROME, '--playwright', PLAYWRIGHT, *extra],
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
        self.assertEqual(m['incomplete'], {})
        self.assertEqual(m['snapshot'], '_source')
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
        self.assertIn('neither rendered nor reported incomplete', res.stdout)
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

    def test_incomplete_board_fails_run_by_default(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'incomplete')
        res = run_render(project, out, mode='incomplete')
        self.assertNotEqual(res.returncode, 0)
        self.assertIn('incomplete', res.stdout)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        with open(os.path.join(out, '_FAILED.json')) as f:
            failed = json.load(f)
        incomplete = [x['incomplete'] for x in failed['failures'] if 'incomplete' in x][0]
        self.assertEqual(list(incomplete), ['Alpha'])
        self.assertTrue(os.path.exists(os.path.join(out, 'Alpha.png')), 'evidence PNG must be kept')

    def test_incomplete_board_is_manifested_only_with_allow_incomplete(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'incomplete-ok')
        res = run_render(project, out, mode='incomplete', extra=['--allow-incomplete'])
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        with open(os.path.join(out, 'manifest.json')) as f:
            m = json.load(f)
        self.assertEqual(list(m['incomplete']), ['Alpha'])
        self.assertIn('Alpha', m['boards'])

    def test_live_source_change_during_render_fails_run(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'drift-live')
        res = run_render(project, out, mode='mutate_live',
                         env_extra={'FAKE_MUTATE_PATH': os.path.join(project, 'Alpha.dc.html')})
        self.assertNotEqual(res.returncode, 0, res.stdout)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        with open(os.path.join(out, '_FAILED.json')) as f:
            self.assertIn('source drift during render (live project changed)', f.read())

    def test_snapshot_change_during_render_fails_run(self):
        project = make_project(self.path('repo'), NAMES)
        out = self.path('runs', 'drift-snapshot')
        res = run_render(project, out, mode='mutate_snapshot')
        self.assertNotEqual(res.returncode, 0, res.stdout)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        with open(os.path.join(out, '_FAILED.json')) as f:
            self.assertIn('source drift during render (snapshot changed)', f.read())

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


FIXTURES = {
    'Clean': '<!doctype html><html><body><p>clean board</p></body></html>',
    'MissingImage': '<!doctype html><html><body><img src="missing-image.png" alt=""><p>image board</p></body></html>',
    'MissingFont': ('<!doctype html><html><head><style>@font-face{font-family:Missing;'
                    'src:url(missing-font.woff2) format("woff2")}</style></head><body>'
                    '<p style="font-family:Missing">font board</p></body></html>'),
    'MissingCss': '<!doctype html><html><head><link rel="stylesheet" href="missing.css"></head><body><p>css board</p></body></html>',
    # Port 9 is closed here, so the request fails at once. The board is incomplete either way: network
    # resources are not reproducible from the manifest, whether or not they load.
    'ExternalCss': '<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:9/external.css"></head><body><p>external board</p></body></html>',
}
INCOMPLETE_FIXTURES = ['ExternalCss', 'MissingCss', 'MissingFont', 'MissingImage']


@unittest.skipUnless(os.path.exists(CHROME) and os.path.exists(PLAYWRIGHT),
                     'needs Chromium and playwright (set HARNESS_CHROME and HARNESS_PLAYWRIGHT)')
class RealBrowserTests(unittest.TestCase):
    """The real renderer in Chromium: a missing image, font or stylesheet makes its board incomplete, never clean."""

    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='harness-browser-')
        self.project = make_project(os.path.join(self.root, 'repo'), list(FIXTURES), bodies=FIXTURES)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def path(self, *p):
        return os.path.join(self.root, *p)

    def test_missing_resources_make_boards_incomplete_and_fail_the_run(self):
        out = self.path('runs', 'real-fail')
        res = run_real(self.project, out)
        self.assertNotEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertFalse(os.path.exists(os.path.join(out, 'manifest.json')))
        with open(os.path.join(out, '_FAILED.json')) as f:
            failed = json.load(f)
        incomplete = [x['incomplete'] for x in failed['failures'] if 'incomplete' in x][0]
        self.assertEqual(sorted(incomplete), INCOMPLETE_FIXTURES)
        self.assertTrue(any('image' in r for r in incomplete['MissingImage']), incomplete['MissingImage'])
        self.assertTrue(any('font' in r for r in incomplete['MissingFont']), incomplete['MissingFont'])
        self.assertTrue(any('stylesheet' in r for r in incomplete['MissingCss']), incomplete['MissingCss'])
        self.assertTrue(any('from the network' in r for r in incomplete['ExternalCss']), incomplete['ExternalCss'])
        self.assertNotIn('Clean', incomplete)
        for name in FIXTURES:
            self.assertTrue(os.path.exists(os.path.join(out, f'{name}.png')), f'evidence PNG kept for {name}')

    def test_allow_incomplete_manifests_the_incomplete_boards_explicitly(self):
        out = self.path('runs', 'real-allowed')
        res = run_real(self.project, out, extra=['--allow-incomplete'])
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        with open(os.path.join(out, 'manifest.json')) as f:
            m = json.load(f)
        self.assertEqual(sorted(m['incomplete']), INCOMPLETE_FIXTURES)
        self.assertEqual(sorted(m['boards']), sorted(FIXTURES))

    def test_renderer_exits_zero_for_incomplete_boards_and_reports_them(self):
        out = self.path('runs', 'direct')
        os.makedirs(out)
        with open(os.path.join(out, '_RUN'), 'w') as f:
            f.write('run-C\n')
        res = subprocess.run(['node', RENDER_ALL, '--project', self.project, '--out', out, '--part', '0', '--parts', '1',
                              '--run-id', 'run-C', '--chrome', CHROME, '--playwright', PLAYWRIGHT, '--settle-ms', '300'],
                             capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        with open(os.path.join(out, '_part-0.json')) as f:
            rep = json.load(f)
        self.assertEqual(rep['rendered'], ['Clean'])
        self.assertEqual(sorted(e['board'] for e in rep['incomplete']), INCOMPLETE_FIXTURES)
        self.assertEqual(rep['errors'], [])


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

    def test_incomplete_board_is_refused_unless_allowed_and_then_excluded(self):
        repo = self.path('repo')
        project = make_project(repo, NAMES, content='v1')
        base = self.path('runs', 'base')
        self.assertEqual(run_render(project, base).returncode, 0)
        with open(os.path.join(project, 'Beta.dc.html'), 'w') as f:
            f.write('<board Beta v2>\n')
        git(repo, 'add', '-A')
        git(repo, 'commit', '-q', '-m', 'v2')
        cand = self.path('runs', 'cand')
        self.assertEqual(run_render(project, cand, mode='incomplete', extra=['--allow-incomplete']).returncode, 0)
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2, res.stdout)
        self.assertIn('incomplete boards', res.stdout)
        res = run_compare(base, cand, '--allow-incomplete')
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('INCOMPLETE\nAlpha\tcandidate', res.stdout)
        self.assertIn('incomplete: 1', res.stdout)
        self.assertNotIn('Alpha\t', res.stdout.split('CHANGED\n')[1].split('UNCHANGED')[0])

    @staticmethod
    def edit_manifest(run_dir, change):
        path = os.path.join(run_dir, 'manifest.json')
        with open(path) as f:
            m = json.load(f)
        change(m)
        with open(path, 'w') as f:
            json.dump(m, f)

    def test_v1_candidate_manifest_is_refused_even_with_legacy_flag(self):
        base, cand = self.two_runs()
        self.edit_manifest(cand, lambda m: m.update(tool='render_run/1'))
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2, res.stdout)
        self.assertIn("manifest tool is 'render_run/1'", res.stdout)
        self.assertEqual(run_compare(base, cand, '--legacy-baseline').returncode, 2)

    def test_candidate_manifest_without_version_is_refused(self):
        base, cand = self.two_runs()
        self.edit_manifest(cand, lambda m: m.pop('tool'))
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2, res.stdout)
        self.assertIn('manifest tool is None', res.stdout)

    def test_current_manifest_without_incomplete_metadata_is_refused(self):
        base, cand = self.two_runs()
        self.edit_manifest(cand, lambda m: m.pop('incomplete'))
        res = run_compare(base, cand)
        self.assertEqual(res.returncode, 2, res.stdout)
        self.assertIn('no incomplete-board metadata', res.stdout)

    def test_v1_baseline_is_refused_unless_legacy_and_then_marked_unverified(self):
        base, cand = self.two_runs()
        self.edit_manifest(base, lambda m: (m.update(tool='render_run/1'), m.pop('incomplete')))
        self.assertEqual(run_compare(base, cand).returncode, 2)
        res = run_compare(base, cand, '--legacy-baseline')
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("LEGACY manifest, tool 'render_run/1', inputs and completeness UNVERIFIED", res.stdout)

    def test_baseline_manifest_without_version_is_refused_unless_legacy(self):
        base, cand = self.two_runs()
        self.edit_manifest(base, lambda m: m.pop('tool'))
        self.assertEqual(run_compare(base, cand).returncode, 2)
        res = run_compare(base, cand, '--legacy-baseline')
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn('completeness UNVERIFIED', res.stdout)


if __name__ == '__main__':
    unittest.main()
