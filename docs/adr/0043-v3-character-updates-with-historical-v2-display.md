# 0043: V3 character updates with historical V2 display

- Status: Accepted
- Accepted on: 2026-10-02, direct owner instruction
- Scope: Character version admission and historical character profile reads
- Authority: Owner instruction: 「表示のみは残す。更新系は、V2が関わるのは、V3への移行などを除き、V2を対象とできなくします」「旧バージョンを見たいとき（旧戦闘からリンクされたキャラなど）は、V2表示アリ」

## Context and decision drivers

Existing normal authoring and portrait/restore/copy routes still produce V2. A V3 character's ordinary chat revision can therefore produce an older-definition candidate. Battle profile links resolve the latest character rather than its recorded immutable revision. The owner requires removal of V2 update targets while retaining V2 historical display.

## Decision

Ordinary owner character mutations require a valid current V3 generation. Candidate persistence/activation require a V3 envelope; a preexisting V2 draft cannot bypass this boundary. Explicit V2-to-V3 migration may read V2, but it must produce V3 and cannot fall back to a V2 update. Normal create/revise must use the existing focused V3 authoring route or fail before provider work when that route is unavailable. Manual owner-directed JSON conversion remains a permitted V3 migration route.

Retain V2 schemas, immutable generations, display projections and migration-source readers. Do not delete character data. Internal historical/test import and operational battle accounting are distinct from ordinary character-definition updates.

A character link from a battle is a read-only view of that battle's matching recorded character snapshot. Authenticate battle access and character-owner access. If that snapshot is missing or mismatched, do not substitute the current character. Hide mutation controls in historical views, including when the viewer owns the character.

## Considered options

- Retain V2 update fallback: rejected by the owner's instruction.
- Delete V2 readers/data: rejected; old revisions remain viewable.
- Enforce V3 writes while preserving versioned reads: selected.

## Consequences and implementation scope

Remove ordinary exposure of legacy portrait/restore/copy writers. Those operations are not asserted to be V3-capable merely because they have UI controls. V3 implementations can be introduced as later bounded work. Metadata mutations such as visibility/deletion/coaching are admitted only for current V3 through ordinary owner routes. Read-only coaching data remains readable.

The current work is local code and regression verification; deployment, provider calls, existing-data migration and GitHub publication are not included.

## Authority disposition and verification

Preserve ADR-0010 immutable generation/CAS/disclosure guarantees and ADR-0028 V3 battle identity. This owner decision replaces continued V2 authoring behavior described by ADR-0011 for ordinary character writes. It does not remove existing V2 generations or change already-bound battles. Prior first-trial migration deferral remains historical scope; this is follow-on owner work.

Verify V2 GET succeeds; all ordinary V2 mutation routes reject without attempts/provider calls/data changes; no V2 candidate activation is possible; valid V3 activation remains possible; missing-provider create/migrate does not fall back; historical V2 snapshots remain exact after current migration and have no edit controls. See character-update-policy, character-v2-update-boundary and character-historical-view tests.

## Implementation readback, 2026-10-02

The repository-level `saveSheet` no longer creates a character from a legacy sheet and requires a current V3 target. Generic asset append/write/activation also require a valid V3 character envelope, preventing a schema3 label with V2 content. The former runtime V2 import activation API is removed. Historical database fixtures use testing-only modules with a runtime dependency regression check. Observer registration only reuses existing V3 character fixtures; it does not repair or create V2. Identity backfill skips old versions before provider work.

Existing battle accounting uses a separate narrow persistence method for record, recordOverall and opponentMemories. It rereads the saved row, retains its definition and immutable generation, and updates only those battle facts. This implements the existing operational-accounting distinction in the Decision; it does not reintroduce character authoring for V2.

Source audit and action scope: [runtime writer removal](../evidence/v2-runtime-writer-removal-2026-10-02.think). Runtime deployment is still outstanding.
