# 正準確定から独立実況までのテスト因果レビュー

2026-10-07。対象12 whole files、原来の77ケース。Accepted ADR0051正本INHERITANCE/D01/D02/ACCEPTANCEを現行根拠とし、Superseded0050 D01/D02/D04/D10/D12はその継承範囲だけに使う。Accepted0006 Decisionのcanonical-first、別fenced lease、ordered terminal snapshotとoutbox delivery generationを継承する。Accepted0054 ACCEPTANCEが新規通常試合のpolicy awareness-v5-usage-v2とlatent60s/conscious90s/global600s等の待機期限を定め、明示的な旧policy/計測policyは保持する。Accepted0056 ACCEPTANCEが既存継続を含む最新出力指示へ置換し、凍結本文の事実・style・observer境界・確定speechを保護する。Superseded0055は独立根拠にせず、Proposed0038/0059を根拠にしない。

必須certified料金/input proofを新observed policyへ追加しない。0051はそれを任意化し、従来certified policyの契約だけを維持する。未判明費用は既知0ではない。独立レビューの根拠要約に「追加」とする誤記があったが、正本の「Replace compulsory certified cost/input token proof only for newly bound ...」とD01を主担当が再照合して訂正した。今回のテストの矛盾ではない。

各testは共通契約をこの文書へ一度結び、実際に呼ぶ実装と型・保存・dispatch境界の正確なSealIDへ接続する。同じ上位契約群を各testへ繰り返し登録せず、推移的な根拠を保持する。登録方式以外の受入条件は緩和せず、251全ファイルを維持し、未封印で正式実行を止める。

## レビュー境界とケース

- awareness-narration-worker 20件: SQLiteの実worker entrypointを通し、3receiptの一call/原子公開、異なるtarget/phase分離、世代付きwake待機/非選択wake再送、world leaseとの独立、proofなしzero-send、no-resend unknown physical attempt、期限・終端drain・late physical closure、bound policy、source/digest/coverage/recognition不正拒否、historyの認知状態を確認する。model/quoteは合成であり実料金証明・公開完走・PostgreSQLの根拠ではない。
- awareness-narration-continuation 1 outer case、4phase×3保持prompt revisionの12経路: 実transport/provider builderとSQLite publicationをfake requestJsonで通す。最新receipt配列・phaseごとのgrammar、旧grammar排除、保存済みrevisionを履歴として保持する。実providerのschema能力や自然さ、旧engine全移行の受入ではない。
- awareness-narration-queue 9件: pure queueのmax3 batch/oldest6s/urgent・terminal/capacity12、immutable input、digest重複/sequence、deadline、fence、physical未完了時の拒否、exact coverageとpublish順序。長い明示policyと旧policyを分離する。実DB・task deliveryや負荷計測ではない。
- awareness-narration-urgency 4件: posture/単なるworld revisionは通常batch、consciousness/speech/vision低下はurgent。全capability・SSE・実caller結線の網羅ではない。
- awareness-narration-convergence 5件: batchされた意識パイプラインawareness-v5の成功terminal・outbox完了・lease/blockerなし・正のclaim count、保持battle binding format v4の旧terminal/one attempt判定をpure predicateで確認する。複数no-send claimをphysical call増加と誤認しない。実公開試合や破棄した旧切替試行を復活させない。
- awareness-world-commit 10件: SQLiteのworld/runtime原子transaction、外側/内側clock期限、prepared/cutoff、canonical CAS rollback、準備後のready thought/accounting保持、technical incompleteのturn/world/winner保持、terminal generation invalidationとlate result拒否。実PG race・rating数式・同時複数workerを証明しない。
- awareness-expression-commit 5件: reflex/consciousの選択済みvoiceがphysical speech条件を満たした時だけutterance/聞こえるevidenceへ確定、無voice時に捏造しない、不能/失聴と別tick ID、private desire ID/strengthの不漏えい。shared utterance/projectionと純粋なcommit helper、全service/LLM品質ではない。
- awareness-adjudication-guard 8件: exact synthetic proofとpersist-before-send、certified proofなしzero-send、unknown slot/cost/restart拒否、physical完了後のunknown費用保持、quote/返答の期限、sticky failure/one-send、observed quoteなしrole usage scope。注入sendは実ネットワークではなく、価格の正確さや全budget ceilingを証明しない。
- normal-awareness-policy 1件: isolated SQLiteとfake HTTPで実startBattle→初回advance、battle binding format v5の通常immutable usage-v2/prompt-v4とruntime600秒、実SDK側latent/consciousへ2callsずつbound policyを渡す。実モデル・全試合完走・API相互運用能力・latencyを証明しない。trial候補reader/seedは合成入力の準備だけで、旧切替試行の受入/実行ではない。
- distributed-guard 3件: SQLiteでowner排他/expiry takeover、fence変更後checkpoint拒否、completed idempotency response replay/別request conflict。0006 fenced advanceとその関連designのidempotency機構を局所検証する。実multi-instance PG race、heartbeat/全atomic advance response、既定retentionの新製品保証ではない。
- battle-causal-narration 3件: 現在serviceのhelperでoffは無変更、guardedはactor consequenceと観測scene変更を投影、rejected evidence時はprojectionを付けない。requirements F-BTL-13/15/22/25、canonical placement separation0022、既存因果projectorの限定回帰。fixtureのresolveTurn/defaultBasicAttackを使うが数値balance/全engine policyを受入済みにしない。
- battle-consumer-wiring 8件: requirements F-BTL-14/15/44/45、Accepted0011のAction/relationship semanticsとConsumer disclosure、0022 D01/D02のobserver/unique-world分離に沿い、bound normのaction制限/metadata非露出、自己profileの凍結/優先、視点anchor/内面projection/確定manifestation、同world objectの自己未着用とscene配置、counterpart knowledge、legacy seeded frameを確認する。保持character definition v2のhelper回帰であり新規v2 authoring、意識パイプラインawareness-v5での全指針delivery、全秘密行列を証明しない。

INSIDE: standalone strictでworker provider overrideのmaterials/materialが4件implicit any。consumer fixturesは不完全manifest2箇所/turnRecords1箇所を最終正準型へcastし、cloneにも冗長castがあった。CLI RCA audit fatal/error/warning0後に、workerは実method parameter型を注釈、consumerは既存compiler/schemaで完全な合成manifestとturn recordを作る。production source/schema/決定は変えない。2修正ファイルの元111+72assertion全183と全test callsをAST比較で保持、12ファイル77case/0fail/0skip・strict exit0。workspace typecheckもexit0。ただしbackendの既存設定はnoImplicitAny:falseのため、今回は設定を継承しないstandalone strictを対象12ファイルと全importへ適用した。通常検査だけではimplicit-anyの解消を証明しない。RCA草稿の「テストが通常compiler対象外」はtsconfig一次確認で訂正済み。

OUTSIDE: 実provider品質/latency、実PostgreSQL concurrency、公開SSE/Cloud Tasks delivery、全試合acceptance、rating/engine数値規範はこの局所証拠で達成扱いにしない。これらの後続検証を、今回の未封印を除外/skipする代替にしない。

BOUNDARY_DISPUTE: このcohortを止める新しい上位決定の不一致は確認されていない。既存0059/authoring要求等の未決定項目は別経路に残る。

## 計測

12file共通単位で、実行と独立reviewを並行し、共通契約の照合・strict compiler・workspace compiler・正式gate・fsckを単位ごとに実行する。開始時刻と登録writer phaseを分けて記録する。前4fileの約411秒は登録だけの計測であるため、全レビュー時間を含む今回の総時間と直接比較しない。実測files/cases/refs/cause edgesと範囲を残す。終了見込みは進捗報告時に更新する。
