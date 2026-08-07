# Persistent E2E observation realm

This mechanism repeatedly exercises the production battle pipeline without
mixing its synthetic data into the general-player population.

## Access model

`users.account_kind` is a server-owned value with four allowed states:

| Kind | Realm | Visible character population |
| --- | --- | --- |
| `general` | general | general only |
| `developer` | test | test and E2E |
| `test` | test | test and E2E |
| `e2e` | test | test and E2E |

Administrators can inspect characters in both realms. Test-realm custom
battlefields and narration styles are shared by administrators, test users,
and E2E users. A normal general user sees neither those assets nor test-realm
ratings. Custom assets belonging to another general user do not become shared
merely because the viewer is an administrator.

Administrators, developers, test users, and E2E users can open the unlinked
`/internal/observations` screen and its `/api/internal/observations/*` API.
General users receive `404 not_found`. This is a separate diagnostics screen;
it adds no control, link, or state to the normal battle screen. The first slice
lists retained battles and exposes the exact battle JSON, public narration log,
E2E observation record, current canonical semantic/world state, and per-turn
engine facts. Battles created after this release also retain the full semantic
and mechanical-world transition for each turn. Older records remain viewable
but accurately report that per-turn transition detail is unavailable.
Administrators and developers may inspect all retained battles; test and E2E
users remain restricted to battles owned by the test realm.

For turns created after the agent-trace release, the same screen also renders a
per-turn pipeline DAG. It starts with the resolved current turn and canonical
transition, then shows the isolated Site A and Site B character-agent consumer
input, provider output, and server-accepted output. The accepted `nextAction`
belongs to the following turn, while accepted speech feeds the current
narrator call. The DAG then shows the exact bounded narrator call input,
provider/fallback disposition, provider output, and final public block. It does
not retain provider credentials, transport headers, raw HTTP envelopes, or
hidden chain-of-thought. Older turns remain readable and report the trace as
unavailable rather than reconstructing it from prose.

The narrator-model payload is a role-labelled `turnBrief`, not a second copy of
the full internal view. It separates:

- `turnResult`: actions without duplicate outcome prose, resolved event text,
  causal chains and explicit semantic/world change status;
- `currentState`: the scene, canonical scene facts and participant conditions;
- `staticBackground`: stable battlefield flavor that did not necessarily change
  this turn; and
- `observationBoundary` plus `presentation`: perspective-safe perception,
  labels, rendering anchors and bounded continuity.

This is an input-shaping change. It adds no narrator claim validator, prose
rejection, repair loop, or mechanical authority, and the narrator remains free
to choose the wording and emphasis of its response.

The production administrator allowlist is deployment configuration, not a
client claim. Stage binds `ADMIN_EMAILS=mako10k@mk10.org`, and Promote refuses
an artifact that does not contain that binding.

## Reused identities and fixtures

The observer job provisions these confirmed non-human Supabase accounts once
and then reuses them:

- `codex-e2e-observer@example.test` (`e2e`)
- `codex-e2e-opponent@example.test` (`test`)

Their runtime password is randomized on every run and is never stored in the
repository or artifact. The auth identities and mapped application users are
not deleted.

The job creates the two fixed characters, the rainy-alley battlefield, and the
causal-observation narrator only when their stable IDs do not exist. A later
run reuses the existing records without overwriting battle records, ratings,
or edits. An ownership mismatch or soft-deleted fixed character stops the run
instead of silently replacing data.

Every observation creates a new cross-account battle through `/api/battles`,
advances it through the production SSE endpoint until prologue, turns, and
aftermath are complete, and reads the persisted public battle back. No cleanup
is performed on either success or failure, so an incomplete battle remains
available for diagnosis.

## Running an observation

After a release is promoted, select that exact tag in GitHub Actions and run
**Observe persistent E2E battle** with:

- the same release tag;
- the active Cloud Run revision from Promote;
- a maximum advance count from 1 through 30 (normally 24);
- confirmation `OBSERVE <revision>`.

The protected workflow verifies the tag's required checks and the active
immutable revision before deploying a Cloud Run Job from that exact image. A
successful run validates the sanitized observation inside that trusted Job,
records both the full public observation in `balance_events` and the battle in
`battles` indefinitely, and uploads a non-sensitive execution receipt for 90
days. The durable observation contains synthetic account labels, fixture
disposition, per-advance timing, the public result, and public narration. It
excludes access tokens, auth/application user IDs, raw character parameters,
private semantic state, and rating internals. The GitHub deploy identity does
not receive broad project-log access merely to copy this data into an artifact.
