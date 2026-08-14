# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm workspace for a TypeScript web game. `backend/src/` contains the Hono API, SQLite repositories, authentication, battle services, and LLM adapters. `frontend/src/` contains the React/Vite UI; page components live in `frontend/src/pages/`, while static battlefield images live in `frontend/public/`. Shared schemas, DTOs, and deterministic game logic belong in `packages/shared/src/`. Keep operational files in `infra/` and `scripts/`, and architectural requirements and plans in `docs/`. Tests are currently colocated with shared code as `*.test.ts`.

## Build, Test, and Development Commands

Use Node.js 20 or newer and install all workspaces from the repository root:

- `npm install` installs workspace dependencies.
- `npm run dev` starts the backend and frontend watchers together; use `dev:backend` or `dev:frontend` to run one side only (ports 3088 and 5188).
- `npm run build` builds shared types first, then the backend and frontend.
- `npm run typecheck` checks every workspace; `npm run lint` currently aliases this command.
- `npm test` runs all configured Node test suites.
- `npm run sync:secdat` safely populates the ignored `.env` from `secdat` without printing secret values.

## Coding Style & Naming Conventions

Follow the existing strict TypeScript style: two-space indentation, double quotes, semicolons, and trailing commas in multiline structures. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and kebab-case filenames such as `battle-engine.ts`. Keep domain-neutral contracts in `@kshiai/shared`; do not duplicate them in frontend or backend code. No standalone formatter is configured, so match the surrounding file and rely on type checking.

## Testing Guidelines

Tests use `node:test` with `node:assert/strict`. Name files `*.test.ts`, colocate them with the module under test, and write behavioral `describe`/`it` descriptions. Add regression coverage for battle rules, ratings, balance, or schema changes. There is no configured coverage threshold; nevertheless, run `npm test` and `npm run typecheck` before submitting.

## Architecture Decision Records

Record material architectural and product-rule decisions as ADRs under `docs/adr/`. This includes changes to authoritative state ownership, battle ordering or resolution semantics, persistence and retry boundaries, public/internal API contracts, privacy boundaries, and deployment topology. Create or update the ADR before implementing the decision so the reason, alternatives, and migration impact remain reviewable alongside the code.

- For ADR-0015 and later, use a same-basename pair such as `0015-decision-title.think` and `0015-decision-title.md`. Start from `docs/adr/template.think` and `docs/adr/template.md`. The `.think` file is the authoritative causal and decision record; Markdown is its human-readable projection. Correct projection drift in favor of `.think`.
- Use one of these statuses: `Proposed`, `Accepted`, `Rejected`, `Superseded`, or `Deprecated`. Only `Accepted` ADRs authorize implementation of a new architectural direction. Acceptance requires an `OWNER_ACCEPTANCE` evidence statement and an `ACCEPTANCE` decision in the authoritative `.think` file that identify the exact ADR and owner-approved revision. Drafting, review, continuation, or implementation requests are not acceptance by themselves.
- Include context, decision drivers, considered options, decision, consequences, compatibility or migration impact, and links to relevant Issues, PERT tasks, evidence, and commits.
- Do not rewrite the decision or rationale of an accepted ADR. Record later changes in a new ADR and mark the old one `Superseded` with a link to its replacement.
- Keep exploratory plans in PERT or design documents. When implementation depends on a disputed or changing architectural choice, link the plan to a `Proposed` ADR and stop at the decision boundary until it is accepted.
- Run `npm run adr:check` after changing an ADR. `npm run adr:check:sealgraph -- <path.think>` is an optional advisory projection and is never an authority or required CI/release gate. It must create a new isolated graph from the `.think` source and referenced original artifacts, never depend on reading prior sealgraph storage, and discard its generated storage after the run. Missing or incompatible sealgraph is reported without changing or blocking the canonical ADR workflow.

Editable domain assets must be revisioned. Battles and other long-running workflows bind immutable asset revision IDs and snapshots at creation; they must not reread a mutable current character, narration style, battlefield, or policy definition during execution. Corrections create a new revision, while existing battles remain on their recorded revisions unless an explicit migration ADR defines otherwise.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects (for example, `Improve battle flow...`). Keep each commit focused. Pull requests should summarize behavior and architecture changes, list validation commands, link relevant issues or `docs/plan.pert` work, and include screenshots for visible UI changes. Call out database, environment, provider, or deployment impacts explicitly. Never commit `.env`, API keys, SQLite data, generated `dist/`, or user media.
