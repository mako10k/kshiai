# Historical trial tests

These test sources are archival evidence, not the current executable regression suite.

On 2026-10-05 the owner requested removing unnecessary tests from the full suite. The following two combined scenarios assumed current new-battle creation produces battle binding format v4 through Mock, contradicting the new-battle-only consciousness pipeline awareness-v5 and battle binding format v5 under ADR0051. Their source is preserved verbatim as `.ts.txt`; exactly their two entries were removed from test-authority-inventory.json. Do not use a historical passing result as evidence for the current creation path.

- `routes-cutover-confirm.test.ts.txt`: formerly backend/src/routes-cutover-confirm.test.ts; verification/vt104-routes-cutover-confirm-20260930.
- `cutover-trial-dispatch.test.ts.txt`: formerly backend/src/services/cutover-trial-dispatch.test.ts; verification/vt104-cutover-trial-dispatch-20260930.

Other cutover configuration, control, authorization, HTTP, background dispatch and stage smoke tests remain unchanged. Existing-battle execution/narration compatibility checks also remain. Archival does not change old trial runtime tools or accept a revised stage-trial contract. These combined historical sources also contain confirmation/dispatch assertions; retaining other tests is not a claim that every archived assertion has equivalent coverage. Current pipeline SDK and immutable-binding checks are separately recorded in docs/battle-awareness-response-repair-2026-10-05.md.

This is removal of superseded scenarios, not failure suppression, skipping, or relaxation of live tests. Authority classification and all other inventory entries are unchanged.

Verification after removal: `npm test` succeeded across all selected groups (163 backend + 19 shared + 29 scripts = 211 passed, 0 failed). Selection remains authority-based; provisional/unsealed tests are not silently activated or removed. Both archived files were compared byte-for-byte against HEAD's original source and match. Historical evidence documents reporting the earlier two failures remain unchanged as past observations; those scenarios no longer block the current full suite.

All-workspace `npm run typecheck` passed after archival. Diff whitespace check passed. Inventory readback confirmed exactly the two entries were removed and all other entries/metadata are unchanged. This removal task has no remaining work; real-model acceptance of the consciousness pipeline is a separate pending task.
