"""R: Run the full original sealed suites against the repaired immutable source cohort without paid calls."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import time

out = Path("docs/evidence/formal-adjudication-recovery-2026-10-09")
out.mkdir(exist_ok=True)
old = json.loads(Path("docs/evidence/formal-adjudication-repair-2026-10-09/source-cohort.json").read_text())
inventory = Path("scripts/test-authority-inventory.json")
entries = json.loads(inventory.read_text())["tests"]
assert len(entries) == 251
assert sum(entry["suite"] == "unit" for entry in entries) == 247 if "suite" in entries[0] else True

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def heads():
    root = Path(".sealgraph/refs/seals")
    return {str(p.parent.relative_to(root)): json.loads(p.read_text())["head"] for p in root.rglob(".ref")}

sources = {path: sha(path) for path in old["sourceSha256"]}
changed = [path for path, digest in sources.items() if digest != old["sourceSha256"][path]]
expected_changed = {"backend/src/services/free-action-penalties.ts", "backend/src/services/free-action-service.test.ts", "backend/src/services/free-action-service.ts", "backend/src/services/normal-awareness-policy.test.ts", "packages/shared/src/awareness-policy.test.ts", "packages/shared/src/awareness-policy.ts"}
assert set(changed) == expected_changed, changed
old_context = subprocess.check_output(["git", "show", "44f2bd287e9cb68d071620ddb3a63d72e4f56545:backend/src/services/awareness-context.test.ts"], text=True)
current_context = Path("backend/src/services/awareness-context.test.ts").read_text()
original_names = re.findall(r'\bit\("([^"\n]+)"', old_context)
assert len(original_names) == 8 and all(name in current_context for name in original_names)
for path in expected_changed:
    if not path.endswith(".test.ts"): continue
    prior = subprocess.check_output(["git", "show", "44f2bd287e9cb68d071620ddb3a63d72e4f56545:" + path], text=True)
    names = re.findall(r'\bit\("([^"\n]+)"', prior)
    assert all(name in Path(path).read_text() for name in names), path
# Formal execution requires all original tests to be current before any runner starts.
status_run = subprocess.run(["sealgraph", "status", "--format", "json"], capture_output=True, text=True)
assert status_run.returncode == 0, status_run.stderr
statuses = {r["ref"]: r for r in json.loads(status_run.stdout)["statuses"]}
for entry in entries:
    status = statuses[entry["ref"]]
    assert status["draft"] is False and status["candidate_to_head"] == "NO_CANDIDATE", entry["ref"]
    assert status["local_source"]["path"] == entry["path"] and status["local_source"]["relation"] == "WORKFILE_MATCHES_HEAD", entry["ref"]
    stale = status["stale"]
    assert not stale["self"] and not stale["direct_target_seal_ids"] and not stale["transitive_paths"], entry["ref"]
if datetime.datetime.now(datetime.timezone.utc) >= datetime.datetime.fromisoformat("2026-10-09T13:20:00+00:00"):
    raise SystemExit("Formal execution deferred to preserve the approved 22:30 worktime window")
initial_heads = heads()
initial_inventory = sha(inventory)
mapped = [{"path": e["path"], "ref": e["ref"], "sealId": initial_heads[e["ref"]]} for e in entries]
env = dict(os.environ)
env.update(PATH="/home/katsumata-m/.nvm/versions/node/v22.22.3/bin:" + env["PATH"], DATABASE_URL="", LLM_PROVIDER="mock",
           AWARENESS_POSTGRES_TEST_URL="postgres://kshiai_test@127.0.0.1:55439/kshiai_awareness_test")
env.pop("E2E_GUI_BASE_URL", None)
pg = Path("/tmp/kshiai-stage-effort-pg-20261009")
ctl = str(pg / "runtime/usr/lib/postgresql/16/bin/pg_ctl")
assert (pg / "data/postmaster.pid").exists(), "owned private database is not live"

def run(args, name):
    started = time.monotonic()
    with (out / name).open("w") as log:
        result = subprocess.run(args, env=env, stdout=log, stderr=subprocess.STDOUT)
    return {"args": args, "exitCode": result.returncode, "seconds": round(time.monotonic() - started, 3), "log": str(out / name)}

result = {"schema": "kshiai/formal-all-tests/v1", "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "formalAuthority": True, "originalSourceCommit": "44f2bd287e9cb68d071620ddb3a63d72e4f56545", "driverSourceSha256": sha(__file__), "inventorySha256": initial_inventory, "registrySealId": initial_heads["all-tests-20261009/registration/current-test-inventory"],
          "mappedTestHeads": mapped, "sourceSha256": sources, "changedSourcePaths": changed, "originalDeclarationsRetained": True,
          "provider": "mock", "paidCalls": 0, "privatePostgres": str(pg)}
(out / "source-cohort.json").write_text(json.dumps({"sourceSha256": sources, "originalDeclarationsRetained": True, "changedSourcePaths": changed}, indent=2) + "\n")
try:
    print("Formal unit authority check and all 247 original files starting", flush=True)
    result["unit"] = run(["npm", "test"], "unit.log")
finally:
    result["postgresStop"] = run([ctl, "-D", str(pg / "data"), "stop", "-m", "fast"], "postgres-stop.log")
unit = (out / "unit.log").read_text()
result["unitSelection"] = {"active": 247, "provisional": 0, "disabled": 0} if "TEST_SELECTION suite=unit active=247 provisional=0 disabled=0" in unit else None
result["unitCounts"] = {label: sum(map(int, re.findall(r"^# " + label + r" (\d+)\s*$", unit, re.M))) for label in ["tests", "pass", "fail", "skipped"]}
(out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
assert result["unit"]["exitCode"] == result["postgresStop"]["exitCode"] == 0
assert result["unitSelection"] and result["unitCounts"]["tests"] >= 1474 and result["unitCounts"]["pass"] == result["unitCounts"]["tests"] and result["unitCounts"]["fail"] == result["unitCounts"]["skipped"] == 0, result["unitCounts"]
print("Formal unit suite passed; owned private PostgreSQL stopped; all 4 original E2E files starting", flush=True)
if datetime.datetime.now(datetime.timezone.utc) >= datetime.datetime.fromisoformat("2026-10-09T13:25:00+00:00"):
    result["complete"] = False
    result["deferredReason"] = "approved_worktime_handoff_window"
    (out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    raise SystemExit(3)
result["e2e"] = run(["xvfb-run", "-a", "npm", "run", "test:e2e-gui"], "e2e.log")
e2e = (out / "e2e.log").read_text()
result["e2eSelection"] = {"active": 4, "provisional": 0, "disabled": 0} if "TEST_SELECTION suite=e2e active=4 provisional=0 disabled=0" in e2e else None
result["e2ePassed10"] = bool(re.search(r"\b10 passed\b", e2e))
result["sourceCohortUnchanged"] = all(sha(path) == digest for path, digest in sources.items())
result["driverSourceUnchanged"] = sha(__file__) == result["driverSourceSha256"]
result["headsUnchanged"] = heads() == initial_heads
result["inventoryUnchanged"] = sha(inventory) == initial_inventory
result["finishedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
result["complete"] = result["e2e"]["exitCode"] == 0 and bool(result["e2eSelection"]) and result["e2ePassed10"] and result["sourceCohortUnchanged"] and result["driverSourceUnchanged"] and result["headsUnchanged"] and result["inventoryUnchanged"]
(out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
assert result["complete"]
print(json.dumps({k: result[k] for k in ["complete", "unitCounts", "e2ePassed10", "sourceCohortUnchanged", "headsUnchanged", "inventoryUnchanged"]}), flush=True)
