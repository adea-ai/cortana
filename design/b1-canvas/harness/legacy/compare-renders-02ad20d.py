# Compares two directories of board renders (1440x900 PNG, same names) and prints each board's
# share of pixels whose max channel difference is above 24. Boards present in only one directory
# are listed as unverified rather than compared.
# Usage: python3 compare-renders.py <baseline dir> <candidate dir>
import os
import sys

import numpy as np
from PIL import Image

base, cand = sys.argv[1], sys.argv[2]
names_b = {f[:-4] for f in os.listdir(base) if f.endswith('.png') and not f.startswith('_')}
names_c = {f[:-4] for f in os.listdir(cand) if f.endswith('.png') and not f.startswith('_')}
common = sorted(names_b & names_c)
changed, unchanged = [], []
for n in common:
    a = np.asarray(Image.open(f'{base}/{n}.png').convert('RGB')).astype(int)
    b = np.asarray(Image.open(f'{cand}/{n}.png').convert('RGB')).astype(int)
    pct = 100 * (np.abs(a - b).max(axis=2) > 24).mean()
    (changed if pct > 0 else unchanged).append((n, pct))
print(f'compared {len(common)}; changed {len(changed)}; unchanged {len(unchanged)}')
print(f'only in candidate (unverified, no baseline): {sorted(names_c - names_b)}')
print(f'only in baseline (not in candidate): {sorted(names_b - names_c)}')
print('CHANGED')
for n, pct in changed:
    print(f'{n}\t{pct:.3f}')
print('UNCHANGED')
for n, _ in unchanged:
    print(n)
