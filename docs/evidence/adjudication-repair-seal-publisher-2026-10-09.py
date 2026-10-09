"""R: Publish only the reviewed adjudication handoff revisions and verify their exact Causes."""
from pathlib import Path
import hashlib
import json
import subprocess
import time

base = Path("docs/evidence")
plan_path = base / "adjudication-repair-seal-plan-2026-10-09.json"
plan = json.loads(plan_path.read_text())
assert plan["reviewed"] and len(plan["entries"]) == 108
plan["allowedHeadChanges"] = [e["ref"] for e in plan["entries"]]
event_path = base / "adjudication-repair-seal-events-2026-10-09.json"
events = json.loads(event_path.read_text()) if event_path.exists() else []
started = time.monotonic()

def cli(*args):
    result = subprocess.run(["sealgraph", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout

def heads():
    root = Path(".sealgraph/refs/seals")
    return {str(p.parent.relative_to(root)): json.loads(p.read_text())["head"] for p in root.rglob(".ref")}

expected_heads = dict(plan["priorHeads"])
for event in events:
    expected_heads[event["ref"]] = event["sealId"]
assert heads() == expected_heads, "observed HEADs changed outside verified publication"
for index, entry in enumerate(plan["entries"]):
    if index < len(events): continue
    assert hashlib.sha256(Path(entry["path"]).read_bytes()).hexdigest() == entry["sourceSha256"]
    expected = {}
    for link in entry["links"]:
        target = events[link["replacementEntry"]]["sealId"] if "replacementEntry" in link else link["target_seal"]
        assert target not in expected
        expected[target] = {"previous": sorted(previous for previous in link["previous_revision_seal_of_target_seal"] if previous != target), "messages": sorted(link["messages"])}
    def group(target, value):
        result = ["--target", "@" + target]
        result += [part for previous in value["previous"] for part in ["--previous", "@" + previous]] if value["previous"] else ["--no-previous"]
        result += [part for message in value["messages"] for part in ["-m", message]]
        return result
    first, *rest = list(expected.items())
    cli("add", entry["ref"], "--content-file", entry["path"], "--bind-source", "--non-root", *group(*first))
    for target, value in rest:
        cli("link", entry["ref"], *group(target, value))
    candidate = json.loads(cli("candidate", "show", entry["ref"], "--format", "json"))["candidate"]
    extra = {c["target_seal"] for c in candidate["cause_links"]} - set(expected)
    assert extra <= set(entry["priorCauseTargets"])
    for target in extra:
        cli("unlink", entry["ref"], "--target", "@" + target)
    outcome = subprocess.run(["sealgraph", "seal", entry["ref"]], capture_output=True, text=True)
    if outcome.returncode:
        assert "SEAL_ID_UNCHANGED" in outcome.stderr, outcome.stderr
        unchanged = json.loads(cli("show", entry["ref"], "--format", "json"))["seal"]
        unchanged_causes = {c["target_seal"]: {"previous": sorted(c["previous_revision_seal_of_target_seal"]), "messages": sorted(c["messages"])} for c in unchanged["cause_links"]}
        assert unchanged_causes == expected and not unchanged["draft"] and not unchanged["root"]
        unchanged_source = json.loads(cli("source", "compare", entry["ref"], "--format", "json"))
        assert unchanged_source["workfile_content"]["object_id"] == unchanged["content_blob_id"]
        cli("candidate", "discard", entry["ref"])
    seal = json.loads(cli("show", entry["ref"], "--format", "json"))["seal"]
    actual = {c["target_seal"]: {"previous": sorted(c["previous_revision_seal_of_target_seal"]), "messages": sorted(c["messages"])} for c in seal["cause_links"]}
    assert actual == expected and not seal["draft"] and not seal["root"]
    comparison = json.loads(cli("source", "compare", entry["ref"], "--format", "json"))
    assert comparison["relation"] == "WORKFILE_MATCHES_HEAD" and comparison["path"] == entry["path"]
    events.append({"ref": entry["ref"], "path": entry["path"], "sealId": seal["seal_id"], "previousHead": entry["oldSealId"], "sourceSha256": entry["sourceSha256"], "exactCausesReadBack": True, "causeLinks": seal["cause_links"], "elapsedSeconds": round(time.monotonic() - started, 3)})
    (base / "adjudication-repair-seal-events-2026-10-09.json").write_text(json.dumps(events, indent=2) + "\n")
    print(f"{index + 1}/108 exact source/Cause readback completed", flush=True)
current = heads()
assert all(current.get(ref) == sid for ref, sid in plan["priorHeads"].items() if ref not in plan["allowedHeadChanges"])
print(json.dumps({"published": len(events), "seconds": round(time.monotonic() - started, 3), "otherHeadsPreserved": True}), flush=True)
