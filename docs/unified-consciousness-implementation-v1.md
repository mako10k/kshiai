# 統合意識 v1 実装・ローカル検証

現在の公式全体検証は未完了。2026-10-10の所有者指摘により、根拠不備28ファイルを除外した全体検証完了判断を撤回した。下記の成功件数は限定実行の歴史的観測として保持する。末尾の訂正とADR-0068 revision 1を参照。

2026-10-10。ブランチ `codex/unified-consciousness`。根拠はAccepted [ADR-0067 revision 2](adr/0067-unified-consciousness-priority-memory.md)と[統合意識の詳細契約 第1版](unified-consciousness-contract-v1.md) C1–C8。canonicalは[統合意識 PERT](unified-consciousness.pert)。

## 実装

試合束縛形式 v6 を内部の `startBattle({ consciousnessPolicy: UnifiedConsciousnessPolicyV1, ... })` で明示選択できる。公開作成APIの既定は試合束縛形式 v5。保存済み試合の再解釈や自動移行はない。キャラクター定義 v3 と既存の世界裁定・実況の境界を再利用する。

統合意識パイプライン unified-consciousness-v1 の出力は任意のaction、speech、memoryOperationsだけ。目標・感情・注意・行動指針の専用状態や意欲の強度・寿命は持たない。記憶は最大5件、各400 Unicode code points。順位1–5への挿入・後続押出し・末尾切捨てとID指定削除を最大10操作まで順番に適用し、一つでも不正なら全体を拒否する。現在の記憶を空配列も含め常に入力する。

初回・未処理出来事・最後の判断から3確定tickで起動する。知覚内容のdigestはtick番号とrevisionのみの変化を除く。必要なA/B判断を同じ確定世界から並列実行し、双方がそろってから世界を確定する。省略actionは新規行為なしで、既存のengine continuationを継続できる。省略speechは無言。発言の意味重複判定や強制言換えはしない。

送信前に私有runtimeへdecision IDと不変入力を予約する。prepared結果を再利用できるが、送信結果不明・予約中・失敗の判断を自動再送しない。期限やリースを失った返答は物理完了の記録だけを更新し、使用可能な結果にしない。世界、記憶、イベント消費、適用済み印、発言、実況outboxは一つのfenced transactionで確定する。失敗時は以前の世界と記憶を保ちincompleteで停止し、部分的な準備結果を証跡として保持する。

全体600秒・200物理attempt・同時6、意識は両側同時2・各側同時1。意識は初期境界と最大36tickで最大74call、1call出力1000token・60秒、入力24000code points。再試行・修復・fallbackは追加しない。既存openai/gpt-6-luna/noneを明示束縛する。USD 0.50は観測目標で、保証上限ではない。

## 永続化と互換性

追加DDLは `backend/migrations/0037_unified_consciousness.sql` とSQLite初期化schema。私有table `battle_unified_consciousness` にrevision、fencing token、snapshotを保存する。旧意識パイプライン awareness-v5 のruntime tableを維持する。世界裁定と実況に必要な運用・会計だけを共通projectionで渡し、実況workerへ私有記憶や判断入力を渡さない。実況の既存frozen receipt識別子は履歴互換のため維持する。

SQLiteの実transactionで原子性とrollbackを検証した。PostgreSQLのDDL・row lock分岐は実装したが、新tableの実PostgreSQLでの実行は未確認。本番migration、既定selector切替、配備、有料model比較はこのローカル作業に含まない。

## 検証

新規の有効なSealGraph登録テスト3ファイル、20件が通過。記憶順位・overflow・削除・Unicode上限・原子性、常時入力、無変化tick抑制、片側イベント起動と消費、並列barrier、partial失敗・再送防止・期限超過・lease喪失、世界CAS失敗およびtransaction中期限超過のrollbackを検証した。試合束縛形式 v6 の作成・口上・戦闘tick・発言・私有記憶・実況、および旧試合束縛形式 v5 の作成・口上・実況をoffline fixtureで確認した。発言付き実況は型付きprovider stubで確認し、実modelが発言を正しく配置できることは未確認。

`npm run build`、`npm run typecheck`、`npm run static`、`npm run adr:check`、`git diff --check` 成功。共有workspaceをbuildしてからbackendの検証を実行した。依存関係は既存lockに従い `npm ci` でそろえ、古いローカルSDK型との不一致を解消した。初期診断の失敗証跡は[設計時の記録](unified-consciousness-design-v1.md)に保持する。

新規テストの根拠は `adr/0067` と `unified-v1/source/*`、テストREFは `unified-v1/test/*`。scopeを確認した資料だけを登録し、既存のstaleテストの根拠を一括で付け替えていない。SealGraph fsckはok。登録は実model品質や本番受入を証明しない。

実modelの人物性、反応漏れ、速度、token、実料金の比較は未実施。呼出し抑制と並列化の実装から、改善率や品質合格は断定しない。

最終の `npm test` は有効222ファイル、1,338件成功・失敗0・skip0。既存の根拠がstaleの28ファイルは選択器がdisabledにし、実行していない。全ファイルの合格とは扱わない。今回追加の3ファイルは有効対象。ローカル診断ログは `/tmp/unified-tests-final.log`、`/tmp/unified-focused-readback.log`、`/tmp/unified-types-final2.log`、`/tmp/unified-build-final.log`、`/tmp/unified-static-final2.log`、`/tmp/unified-adrs.log`。これら一時ログはGit成果物ではない。

本人向け行為feedbackは実行有無だけを自然文で返し、内部の裁定理由を直接渡さない。原因は本人別知覚から読む。最終の全文reviewでこの境界を確認し、対象sourceの変更前impactを読み、確認したテストのCauseだけを後継Sealへ継承した。未確認の既存stale資料は残した。

## 全体検証完了の撤回 2026-10-10

所有者指摘により、上記の1,338件成功・28ファイル除外を全体検証完了として扱った判断を撤回する。根拠の古いテストは不要なテストではない。限定した実行結果は当時の観測として保持するが、公式全体検証は未完了である。[ADR-0068 revision 1](adr/0068-fail-tests-on-invalid-authority.md)に従い、staleを含むdisabledがあれば公式selectorを実行前に終了コード1で停止させる。28ファイルを一括で再Seal・削除していない。

[統合意識 PERT](unified-consciousness.pert)のfinishをCURRENTLY_VERIFIEDへ延長し、fullVerificationを未着手として追加した。過去のverify作業とwork eventは履歴として保持する。runner修正は[根拠不備ゲート修正PERT](test-authority-fail-closed.pert)がcanonicalであり、その修正完了は統合意識 v1 の全体検証完了を意味しない。

停止契約修正後の実 `npm test` はactive222・disabled28（stale27、source_diverged1）を検出し、テストを起動せず終了コード1。これは全体テスト合格ではなく、所有者指定の失敗動作の確認である。[停止結果と対象一覧 第1版](evidence/test-authority-fail-closed-2026-10-10.json)を保存した。修正ゲートの限定診断16件は成功し、実selectorのunit/e2e停止、一覧の維持、有効テストのみの起動を確認した。型チェック・静的解析成功。28件の実行資格回復と公式全体合格は引き続き未完了。
