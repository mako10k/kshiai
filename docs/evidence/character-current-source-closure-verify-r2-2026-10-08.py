"""Read-only whole-wave verification; refuses partial publication or source drift."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
import time

BASE = Path('docs/evidence')
plan = json.loads((BASE / 'character-current-source-closure-plan-r2-2026-10-08.json').read_text())
events = json.loads((BASE / 'character-current-source-closure-publication-events-r2-2026-10-08.json').read_text())
history = events
events = list({e['key']: e for e in history}.values())
assert len(events) == len(plan['publishOrder']) == 244, 'publication is incomplete'
assert set(e['key'] for e in events) == set(plan['publishOrder']), 'publication key mismatch'
refs_dir = Path('.sealgraph/refs/seals')
heads = {str(p.parent.relative_to(refs_dir)): json.loads(p.read_text())['head'] for p in refs_dir.rglob('.ref')}
assert all(heads.get(ref) == seal for ref, seal in plan['priorRefs'].items()), 'prior HEAD changed'
assert all(heads.get(e['ref']) == e['sealId'] for e in events), 'published HEAD changed'
assert all(hashlib.sha256(Path(e['path']).read_bytes()).hexdigest() == e['sourceSha256'] for e in events), 'source changed'

def read_cli(*args):
    result = subprocess.run(['sealgraph', *args], text=True, capture_output=True, check=True)
    return json.loads(result.stdout)

def compare(e):
    result = read_cli('source', 'compare', e['ref'], '--format', 'json')
    assert result['relation'] == 'WORKFILE_MATCHES_HEAD', (e['ref'], result)
    assert result['path'] == e['path'], (e['ref'], result)
    return {'ref': e['ref'], 'path': e['path'], 'relation': result['relation']}

start = time.monotonic()
# Four readers; no source/store mutations. Each future exception is surfaced.
with ThreadPoolExecutor(max_workers=4) as pool:
    comparisons = list(pool.map(compare, events))
graph = read_cli('graph', '--format', 'json')
nodes = {n['seal_id']: n for n in graph['nodes']}
for e in events:
    assert e['sealId'] in nodes, 'published Seal missing from graph'
    actual = nodes[e['sealId']]['causes']
    actual_ids = [c['target_seal_id'] if isinstance(c, dict) else c for c in actual]
    assert sorted(actual_ids) == sorted(e['causeSealIds']), ('Cause graph differs from verified publication journal', e['ref'])
# Inspect the proposed test heads before mutating the official inventory.
inventory = json.loads(Path('scripts/test-authority-inventory.json').read_text())
replacement = {e['test']['path']: e['newRef'] for e in plan['entries'] if e['test']}
replacement.update({n['path']: n['ref'] for n in plan['newNodes'] if n.get('replacesInventoryRef')})
assert len(replacement) == 88, 'affected whole-file mapping differs'
proposed = [{**t, 'ref': replacement.get(t['path'], t['ref'])} for t in inventory['tests']]
http = next(n for n in plan['newNodes'] if n['key'] == 'new:original-http-test')
assert http['path'] not in {t['path'] for t in proposed}, 'HTTP file already mapped unexpectedly'
proposed.append({'path': http['path'], 'ref': http['ref']})
assert len(proposed) == 248 and len({t['path'] for t in proposed}) == 248
reachable = set()
pending = [heads[t['ref']] for t in proposed]
while pending:
    sid = pending.pop()
    if sid in reachable:
        continue
    reachable.add(sid)
    assert sid in nodes, ('reachable Cause absent from graph', sid)
    pending.extend(c['target_seal_id'] for c in nodes[sid]['causes'])
bindings = read_cli('source', 'list', '--format', 'json')['bindings']
by_ref = {b['ref']: b for b in bindings}
prior_bindings = json.loads((BASE / 'character-current-source-closure-prior-bindings-2026-10-08.json').read_text())['bindings']
assert all(by_ref.get(b['ref']) == b for b in prior_bindings), 'original source binding changed'
reachable_bindings = [b for b in bindings if heads.get(b['ref']) in reachable]
with ThreadPoolExecutor(max_workers=4) as pool:
    reachable_comparisons = list(pool.map(compare, reachable_bindings))
fsck = read_cli('fsck', '--format', 'json')
assert fsck['result'] == 'ok', fsck
result = {'schema': 'kshiai/current-source-closure-readback/v1', 'publishedNodes': len(events),
          'priorHeadsUnchanged': True, 'priorHeadCount': len(plan['priorRefs']),
          'currentSourceRelations': comparisons, 'causeGraphMatchesPublicationJournal': True,
          'proposedMappedTests': len(proposed), 'reachableCauseCount': len(reachable),
          'allMappedTestReachableSourceRelations': reachable_comparisons,
          'priorSourceBindingsUnchanged': True, 'priorSourceBindingCount': len(prior_bindings),
          'fsck': fsck, 'elapsedSeconds': round(time.monotonic() - start, 3),
          'scope': 'Read-only wave verification. Original refs retained. Does not alter inventory or claim all formal tests passed.'}
(BASE / 'character-current-source-closure-readback-r2-2026-10-08.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'publishedNodes': len(events), 'elapsedSeconds': result['elapsedSeconds'], 'fsck': fsck}))
