"""Verify a published prefix with public CLI reads and record exact reuse conditions."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import json
import subprocess
import time

base = Path('docs/evidence')
events = json.loads((base / 'character-current-source-closure-publication-events-2026-10-08.json').read_text())
refs = Path('.sealgraph/refs/seals')
def current_head(ref):
    return json.loads((refs / ref / '.ref').read_text())['head']
def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def check(e):
    assert current_head(e['ref']) == e['sealId']
    assert digest(e['path']) == e['sourceSha256']
    r = subprocess.run(['sealgraph', 'source', 'compare', e['ref'], '--format', 'json'], text=True, capture_output=True, check=True)
    value = json.loads(r.stdout)
    assert value['baseline'] == 'HEAD' and value['relation'] == 'WORKFILE_MATCHES_HEAD', value
    assert value['path'] == e['path']
    assert current_head(e['ref']) == e['sealId']
    assert digest(e['path']) == e['sourceSha256']
    return {'ref': e['ref'], 'sealId': e['sealId'], 'path': e['path'], 'sourceSha256': e['sourceSha256'], 'publicCompare': value}
start = time.monotonic()
with ThreadPoolExecutor(max_workers=4) as pool:
    checked = list(pool.map(check, events))
result = {'schema': 'kshiai/source-closure-prefix-readback/v1', 'observedAt': datetime.datetime.now().astimezone().isoformat(),
          'checkedNodes': len(checked), 'plannedNodes': 239, 'workers': 4, 'elapsedSeconds': round(time.monotonic()-start,3),
          'results': checked, 'reuseRule': 'Only reuse after fresh HEAD, source binding path and file SHA256 equality; immutable Seal unchanged. Final fsck and whole test Cause closure still required.',
          'scope': 'Prefix source readback only; no inventory change or formal test completion.'}
(base / 'character-current-source-closure-prefix-readback-2026-10-08.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['checkedNodes','workers','elapsedSeconds']}))
