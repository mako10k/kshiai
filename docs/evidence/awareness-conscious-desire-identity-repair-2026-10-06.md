# 顕在意識の行動意欲ID再利用：観測と修正範囲

## 現在フェーズと上位契約

Accepted ADR-0056 Decision/Compatibilityに基づく、正常完走前の最新版出力説明の修正。output-v1、意欲IDの不変性と再利用拒否、正準状態、モデル経路・期限・上限・追加呼び出しなしを維持する。独立レビューは説明補完が既存承認範囲と確認。実装・構築prompt検証が現在フェーズ、実モデル再現性と公開完走は後続フェーズ。新しいID命名規則をschema制約へ追加しない。

## 独立観測

- PR165/main aa3adb0e2841b05230a39b7e1f38f9f3e6667100、main CI37413764142の4job成功。
- rc.11タグobject9d4021861f8f122b779322432cade2df2dc5141f、peeled SHAは上記main。Stage37414189824は失敗。候補API kshiai-api-00176-jagは正常起動、タスク配送・利用記録・Worker・認証/SSE検査成功。公開Promoteなし。
- 試合btl_4485c7d55ebfb848d92f02e673187ef5：revision153、tick11、incomplete、理由AWARENESS_DESIRE_ID_REUSED。verified CA・BEGIN READ ONLY・transaction_read_only=on・ROLLBACKで読取。
- side aのissuedDesireIdsにdesire.voice.replyとdesire.body.waitが既にあり、sourceTick10の顕在job resultは同じ2IDを返していた。正準への受理を拒否する既存検査が作動した。モデル内部の生成理由は未知。
- 実SDK41行すべてcompleted、報告total不明0行。SDK応答完了はドメイン受理成功と別。金額は料金表未確定のため未知。
- 実況6batch/9entry成功。その後の2entryはAWARENESS_RUNTIME_INACTIVEで失敗。strict schemaはこの試合で実モデルが受理し成功応答したが、全実況・試合完走の受入証拠ではない。45件のbudget_lease_busy deferralはSDK呼び出しではない。

|役割|呼出数|入力token|出力token|SDK報告total|
|---|---:|---:|---:|---:|
|creation|1|1463|152|3434|
|conscious|6|26756|1960|35445|
|subconscious|24|138226|5780|144006|
|narration|6|64256|2292|66548|
|adjudication|4|31183|108|32635|

SDK報告total合計282068。入力+出力から報告totalの差分内訳は推測しない。

## 原因と対処の区別

生成条件として確認できるのは顕在応答が既受理IDを再使用したこと。潜在の説明はside/tick付き新IDを要求するが、顕在の説明には新規性の説明がない。この説明不足は再発防止対象であり、モデル内部の生成原因を断定するものではない。検出原因は既存mergeDesiresの再利用拒否。実況への波及はruntime終了後の既存拒否契約。

## 詳細設計

prepareAwarenessRequestの顕在経路で、今回のconscious・side・凍結sourceTick・応答内連番を含む新しい意欲IDを説明する。body/voice間でも重複しないよう明示し、固定例のIDを再使用させない。命名例は説明であり新しいschema制約ではない。サーバーによるID書換え、再利用許容、履歴入力の追加、追加のrepair LLM呼出し、retry/fallbackは導入しない。

構築promptを両side・異なるsourceTick・旧prompt revisionで検証する。既存型検査と関連テスト、独立実装レビュー後に新候補を公式Stageで1回実測する。無変更rc.11再試行、失敗試合の手動復旧・強制終了、公開切替は行わない。公開完走まで利用者の新pipeline利用価値は未実現。

## 証拠と残るゲート

判断DSLは同名.think。CLI auditがfatal/error/warning 0。Stage [37414189824](https://github.com/mako10k/kshiai/actions/runs/37414189824)、PR [165](https://github.com/mako10k/kshiai/pull/165)。正常な新Stage、Promote、公開Observeの正常終了・全実況成功・実利用ledger照合が未完了。PERT awareness-public-deployを継続し、旧切替試行は保留を維持する。

## 実装・独立レビュー

対象はawareness-request.tsと同testのみ。実入力のside/sourceTickから案内を構成し、body/voice共通連番と再利用禁止を明示。既存Rコメントをmodule先頭へ移動。旧prompt v1〜v4指定も最新案内を使用。関連25件とbackend typecheck合格。独立レビューのINSIDE指摘0。命名例は一意性の証明ではなく、同じsourceTickの再考jobでも再利用拒否が最終保護。実モデルの非再発は未確認。

全体build/lint（全workspace・deployment型検査・静的検査）成功。governed通常テスト201件成功。awareness304件中302成功、ローカルPostgres未提供の明示skip2、失敗0。実PostgresはCI serviceで別途検証する。
