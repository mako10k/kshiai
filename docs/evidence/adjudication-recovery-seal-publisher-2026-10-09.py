"""R: Publish reviewed delta Causes through public CLI, retaining unchanged records and all other HEADs."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

base = Path('docs/evidence')
plan = json.loads((base / 'adjudication-recovery-seal-plan-2026-10-09.json').read_text())
assert plan['reviewed'] and len(plan['entries']) == 108
checkpoint = base / 'adjudication-recovery-seal-events-2026-10-09.json'
events = json.loads(checkpoint.read_text()) if checkpoint.exists() else []
started = time.monotonic()

def cli(*args):
    p = subprocess.run(['sealgraph', *args], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout

def heads():
    root = Path('.sealgraph/refs/seals')
    return {str(p.parent.relative_to(root)): json.loads(p.read_text())['head'] for p in root.rglob('.ref')}

def normalized(links):
    return {c['target_seal']: {'previous': sorted(c['previous_revision_seal_of_target_seal']),
                              'messages': sorted(c['messages'])} for c in links}

def group(target, value):
    args = ['--target', '@' + target]
    args += [a for p in value['previous'] for a in ['--previous', '@' + p]] if value['previous'] else ['--no-previous']
    return args + [a for m in value['messages'] for a in ['-m', m]]

expected_heads = dict(plan['priorHeads'])
for event in events:
    expected_heads[event['ref']] = event['sealId']
assert heads() == expected_heads, 'HEAD change outside reviewed publication'
for index, entry in enumerate(plan['entries']):
    if index < len(events):
        continue
    if datetime.datetime.now(datetime.timezone.utc) >= datetime.datetime.fromisoformat('2026-10-09T13:25:00+00:00'):
        print(json.dumps({'published': len(events), 'required': len(plan['entries']), 'complete': False,
                          'reason': 'approved_worktime_handoff_window'}), flush=True)
        raise SystemExit(3)
    assert hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest() == entry['sourceSha256']
    expected = {}
    replacements = []
    for link in entry['links']:
        old_target = link['target_seal']
        target = events[link['replacementEntry']]['sealId'] if 'replacementEntry' in link else old_target
        value = {'previous': sorted(p for p in link['previous_revision_seal_of_target_seal'] if p != target),
                 'messages': sorted(link['messages'])}
        assert target not in expected
        expected[target] = value
        if 'replacementEntry' in link:
            replacements.append((old_target, target, value))
        elif old_target not in {c['target_seal'] for c in entry['priorCauseLinks']}:
            replacements.append((None, target, value))
    cli('add', entry['ref'], '--content-file', entry['path'], '--bind-source', '--non-root')
    for old_target, target, value in replacements:
        cli('link', entry['ref'], *group(target, value))
        if old_target and old_target != target:
            cli('unlink', entry['ref'], '--target', '@' + old_target)
    candidate = json.loads(cli('candidate', 'show', entry['ref'], '--format', 'json'))['candidate']
    assert normalized(candidate['cause_links']) == expected, 'candidate record mismatch'
    outcome = subprocess.run(['sealgraph', 'seal', entry['ref']], capture_output=True, text=True)
    if outcome.returncode:
        assert 'SEAL_ID_UNCHANGED' in outcome.stderr, outcome.stderr
        cli('candidate', 'discard', entry['ref'])
    seal = json.loads(cli('show', entry['ref'], '--format', 'json'))['seal']
    assert normalized(seal['cause_links']) == expected and not seal['draft'] and not seal['root']
    comparison = json.loads(cli('source', 'compare', entry['ref'], '--format', 'json'))
    assert comparison['relation'] == 'WORKFILE_MATCHES_HEAD' and comparison['path'] == entry['path']
    events.append({'ref': entry['ref'], 'path': entry['path'], 'sealId': seal['seal_id'],
                   'previousHead': entry['oldSealId'], 'sourceSha256': entry['sourceSha256'],
                   'exactCausesReadBack': True, 'causeLinks': seal['cause_links'],
                   'elapsedSeconds': round(time.monotonic() - started, 3)})
    checkpoint.write_text(json.dumps(events, indent=2) + '\n')
    print(f'{index + 1}/108 exact delta/source/Cause readback completed', flush=True)
current = heads()
assert all(current.get(ref) == sid for ref, sid in plan['priorHeads'].items() if ref not in plan['allowedHeadChanges'])
print(json.dumps({'published': len(events), 'complete': True, 'seconds': round(time.monotonic() - started, 3),
                  'otherHeadsPreserved': True}), flush=True)
