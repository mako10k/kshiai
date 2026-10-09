# ADR-0066: 新規試合の裁定待機を180秒にする

- Status: Accepted
- Date: 2026-10-09
- Decision owner: User
- Related: [裁定修正PERT](../adjudication-handoff-repair.pert), [Stage実測](../evidence/adjudication-rc20-stage-result-2026-10-09.json), ADR-0064, ADR-0065

## Context

C1: 配備候補rc.20の有料Stageでは、自由行動のGrok 4.5応答が49,223ms、57,680msで成功した後、次の呼出が60,011msでタイムアウトし試合が未完走になった。E1: 上記Stage実測の実利用記録と相関ログ。単純な輸送失敗であり、物理的な不可能判定とは扱わない。

C2: 所有者は「新規試合の裁定待機を180秒へ延長」を選択した。E2: 2026-10-09のこのチャットの明示回答。既存試合の記録済みポリシー、総呼出上限、有料再試行の承認境界は維持する。

## Decision drivers

- 成功応答の実測が現在の60秒上限に近い。
- 既存試合のrevision束縛を維持する。
- 遅い応答を、行動自体の不可能さとして記録しない。

## Considered options

1. 60秒を維持する。現在の成功応答に対する余裕が小さい。
2. 新規試合だけ180秒にする。失敗確定は最大2分遅くなるが、呼出数は増やさない。所有者が採用。
3. モデル変更や自動再試行を導入する。今回の採用範囲に含めない。

## Decision

A1 -> C1/E1, C2/E2: 新規試合に束縛する運用ポリシーを `awareness-v5-usage-v3` とし、裁定roleのdeadlineMsだけ60,000から180,000に変更する。アプリの配備バージョンとは別の運用ポリシーrevisionである。

同じ180秒は試合作成時の裁定role呼出にも適用される。総試合期限600,000ms、最大200呼出、他roleの期限、輸送再試行0回は維持する。実送信の期限は運用ポリシーの期限と総試合期限の残りの短い方である。既存の `usage-v2`、measurement、旧ポリシーは受理可能な過去snapshotとして保持し、再束縛しない。

A2 -> ADR-0064/0065: 行動負担検査を一般的な `invalid_proposal` だけで記録せず、欠落・旧policy不適合・基準revision不一致・原文引用不一致・部分実行契約不適合をログで区別する。これによってLLM出力と実行時入力の不一致を観測する。rc.20の最初の不採用原因は未特定であり、この変更で原因が解決したとは宣言しない。

## Consequences

### Positive

- 60秒付近の有効応答を待つ余裕が増える。
- 負担検査が止まった条件をログから追跡できる。

### Negative and risks

- 裁定1回の失敗確定が最大2分遅くなる。
- 総試合期限は増やさないため、遅い呼出が続けば期限不足は残る。
- タイムアウト時のプロバイダー処理終了・使用量は不明になり得る。未確定を0トークンとして扱わない。

## Compatibility and migration

運用ポリシーschemaに新revisionを追加し、旧revisionの内容は変更しない。既存試合・既存asset snapshot・過去テスト結果は保持する。新候補の有料StageはCI後に候補固有の承認を取り、rc.20の失敗に対する有料再実行は行わない。

## Verification

- 新規束縛180秒と旧usage-v2/measurement60秒のschema検査。
- 新規試合作成と進行が同じ運用revisionを受け取る検査。
- 各負担検査不適合が正しい理由ログになる検査。
- 変更したCauseをSealして正式試験・同一SHA CIを行う。
- 新候補の承認済みStageと本番の独立照合後に配備完了とする。

## Implementation references

- `packages/shared/src/awareness-policy.ts`
- `backend/src/services/free-action-penalties.ts`
- `backend/src/services/free-action-service.ts`
