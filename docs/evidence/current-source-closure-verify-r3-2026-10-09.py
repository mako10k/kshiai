"""Read-only whole-wave verification; refuses partial publication or source drift."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
import time

BASE = Path('docs/evidence')
input_paths = [Path(__file__), BASE/'current-source-closure-plan-r3-draft-2026-10-09.json',
               BASE/'current-source-closure-publication-events-r3-2026-10-09.json',
               BASE/'current-source-cohort-snapshot-2026-10-09.json']
input_hashes = {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in input_paths}
plan = json.loads((BASE / 'current-source-closure-plan-r3-draft-2026-10-09.json').read_text())
events = json.loads((BASE / 'current-source-closure-publication-events-r3-2026-10-09.json').read_text())
history = events
events = list({e['key']: e for e in history}.values())
assert len(events) == len(plan['publishOrder']) == 392, 'publication is incomplete'
assert set(e['key'] for e in events) == set(plan['publishOrder']), 'publication key mismatch'
expected_items = {'old:'+e['oldSealId']: {'ref':e['newRef'],'path':e['path'],'sourceSha256':e['sourceSha256']} for e in plan['entries']}
expected_items.update({n['key']: {'ref':n['ref'],'path':n['path'],'sourceSha256':n['sourceSha256']} for n in plan['newNodes']})
assert set(expected_items)==set(e['key'] for e in events)
for e in events:
    assert {key:e[key] for key in ('ref','path','sourceSha256')} == expected_items[e['key']], ('event differs from reviewed plan', e['key'])
ids = {e['key']:e['sealId'] for e in events}
old_keys = {e['oldSealId'] for e in plan['entries']}
def target(key):
    return key.removeprefix('external:') if key.startswith('external:') else ids[key]
expected_causes = {}
for e in plan['entries']:
    parents = [('old:'+c['target_seal']) if c['target_seal'] in old_keys else ('external:'+c['target_seal']) for c in e['oldCauses']] + e['additionalParents']
    expected_causes['old:'+e['oldSealId']] = sorted(target(key) for key in parents)
for n in plan['newNodes']:
    expected_causes[n['key']] = sorted(target(key) for key in n['parents'])
for e in events:
    assert sorted(e['causeSealIds']) == expected_causes[e['key']], ('journal Cause differs from reviewed plan',e['key'])
inventory_path = Path('scripts/test-authority-inventory.json')
inventory_start_sha = hashlib.sha256(inventory_path.read_bytes()).hexdigest()
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
replacement.update({n['path']: n['ref'] for n in plan['newNodes'] if n.get('test')})
assert len(replacement) == 134
assert sum(t['path'] in replacement for t in inventory['tests']) == 130
proposed = [{**t, 'ref': replacement.get(t['path'], t['ref'])} for t in inventory['tests']]
existing_paths = {t['path'] for t in proposed}
proposed.extend({'path': path, 'ref': ref} for path,ref in replacement.items() if path not in existing_paths)
snapshot = json.loads((BASE/'current-source-cohort-snapshot-2026-10-09.json').read_text())
original_tests = {path for path in snapshot['sourceSha256'] if path.endswith(('.test.ts','.test.mjs','.spec.ts'))}
assert len(proposed) == len(original_tests) == 251
assert {t['path'] for t in proposed} == original_tests
assert len({t['path'] for t in proposed}) == 251
assert sum(t['path'].startswith('e2e/') for t in proposed) == 4
assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest for path,digest in snapshot['sourceSha256'].items())
reachable = set()
pending = [heads[t['ref']] for t in proposed]
while pending:
    sid = pending.pop()
    if sid in reachable:
        continue
    reachable.add(sid)
    assert sid in nodes, ('reachable Cause absent from graph', sid)
    pending.extend(c['target_seal_id'] if isinstance(c,dict) else c for c in nodes[sid]['causes'])
for seal_id in {e['sealId'] for e in events} | {heads[t['ref']] for t in proposed}:
    assert nodes[seal_id]['revision_state'] == 'ACTIVE_LEAF', ('current published/test HEAD is not active leaf',seal_id,nodes[seal_id]['revision_state'])
status_rows = read_cli('status','--format','json')['statuses']
status_by_ref = {row['ref']:row for row in status_rows}
for ref in {e['ref'] for e in events} | {t['ref'] for t in proposed}:
    row = status_by_ref[ref]
    assert row['head_seal_id'] == heads[ref], ('coherent final HEAD differs',ref)
    assert row['candidate_to_head'] == 'NO_CANDIDATE', ('working Candidate remains',ref)
    assert row['draft'] is False, ('current draft HEAD',ref)
    assert not row['stale']['self'] and not row['stale']['direct_target_seal_ids'] and not row['stale']['transitive_paths'], ('current stale HEAD',ref)
# Graph nodes expose revision state but do not expose draft. Never default an absent
# draft field to False. Fresh public status supplies current HEADs; every uncovered
# ancestor is shown exactly through official CLI, without trusting archived flags.
draft_by_seal = {}
for row in status_rows:
    if row['candidate_to_head']=='NO_CANDIDATE' and row.get('head_seal_id'):
        sid = row['head_seal_id']
        assert isinstance(row['draft'],bool)
        assert sid not in draft_by_seal or draft_by_seal[sid] == row['draft']
        draft_by_seal[sid] = row['draft']
def ancestor_draft(sid):
    shown = read_cli('show','@'+sid,'--format','json')['seal']
    assert shown['seal_id']==sid and isinstance(shown['draft'],bool)
    return sid,shown['draft']
uncovered = sorted(reachable-set(draft_by_seal))
with ThreadPoolExecutor(max_workers=4) as pool:
    draft_by_seal.update(pool.map(ancestor_draft,uncovered))
assert all(draft_by_seal[sid] is False for sid in reachable), 'reachable draft ancestor'
bindings = read_cli('source', 'list', '--format', 'json')['bindings']
by_ref = {b['ref']: b for b in bindings}
for test in proposed:
    assert test['ref'] in heads and test['ref'] in by_ref, ('test ref absent',test)
    assert by_ref[test['ref']]['path'] == test['path'], ('test/source binding path differs',test,by_ref[test['ref']])
    expected_event = next((e for e in events if e['ref']==test['ref']),None)
    if expected_event:
        assert heads[test['ref']] == expected_event['sealId']
    else:
        assert heads[test['ref']] == plan['priorRefs'][test['ref']], ('retained test head differs',test)
with ThreadPoolExecutor(max_workers=4) as pool:
    test_comparisons = list(pool.map(compare,proposed))
prior_bindings = json.loads((BASE / 'character-current-source-closure-prior-bindings-2026-10-08.json').read_text())['bindings']
assert all(by_ref.get(b['ref']) == b for b in prior_bindings), 'original source binding changed'
reachable_bindings = [b for b in bindings if heads.get(b['ref']) in reachable]
with ThreadPoolExecutor(max_workers=4) as pool:
    reachable_comparisons = list(pool.map(compare, reachable_bindings))
fsck = read_cli('fsck', '--format', 'json')
assert fsck['result'] == 'ok', fsck
final_heads = {str(p.parent.relative_to(refs_dir)):json.loads(p.read_text())['head'] for p in refs_dir.rglob('.ref')}
assert all(final_heads.get(ref)==sid for ref,sid in heads.items()), 'HEAD changed during closure verification'
assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest for path,digest in snapshot['sourceSha256'].items()), 'source changed during closure verification'
assert hashlib.sha256(inventory_path.read_bytes()).hexdigest()==inventory_start_sha, 'official inventory changed during read-only verification'
assert all(hashlib.sha256(path.read_bytes()).hexdigest()==input_hashes[str(path)] for path in input_paths), 'verification input changed during readback'
proposed_bytes = (json.dumps({**inventory,'tests':proposed},indent=2)+'\n').encode('utf-8')
result = {'inputHashes':input_hashes,'proposedInventorySha256':hashlib.sha256(proposed_bytes).hexdigest(),
          'mappedTestHeads':[{'path':t['path'],'ref':t['ref'],'sealId':heads[t['ref']]} for t in proposed],
          'currentHeadsActiveLeafAndClean':True,'reachableDraftCount':sum(draft_by_seal[sid] for sid in reachable),'uncoveredAncestorCliReadCount':len(uncovered),'officialInventoryUnchanged':True,'officialInventorySha256':inventory_start_sha,'testMappingSourceRelations':test_comparisons,'planDerivedPublicationAndCauseMatch':True,'schema': 'kshiai/current-source-closure-readback/v1', 'publishedNodes': len(events),
          'priorHeadsUnchanged': True, 'priorHeadCount': len(plan['priorRefs']),
          'currentSourceRelations': comparisons, 'causeGraphMatchesPublicationJournal': True,
          'proposedMappedTests': len(proposed), 'reachableCauseCount': len(reachable),
          'allMappedTestReachableSourceRelations': reachable_comparisons,
          'priorSourceBindingsUnchanged': True, 'priorSourceBindingCount': len(prior_bindings),
          'fsck': fsck, 'elapsedSeconds': round(time.monotonic() - start, 3),
          'scope': 'Read-only wave verification. Original refs retained. Does not alter inventory or claim all formal tests passed.'}
(BASE/'current-source-proposed-test-inventory-r3-2026-10-09.json').write_bytes(proposed_bytes)
(BASE / 'current-source-closure-readback-r3-2026-10-09.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'publishedNodes': len(events), 'elapsedSeconds': result['elapsedSeconds'], 'fsck': fsck}))
