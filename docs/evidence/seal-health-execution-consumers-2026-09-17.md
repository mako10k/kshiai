# M1 実行制御・adapter・関連テストの根拠照合

状態: 作業中。cc304実装、移行実行、M1全体の完了ではない。

## 範囲と判断根拠

- E-EXEC-001: 本人は、実行制御・adapter・関連テストの現行根拠照合、承認済み範囲の修復、Lunaレビュー、再Sealを確認した。ADR-0007 rootは保留。仕様変更、cc304実装再開、commit/push、外部環境変更は除外。
- E-EXEC-002: 作業ツリーは `compact-psyche-repair-integration-kshiai`、HEAD `e022fdc`、既存WIPあり。追跡REF `85c5647` より1commit先行。remote最新性は未確認。コード・テスト本文は変更しない。
- E-EXEC-003: 現行design rev6 REF `design/structured-semantic-authoring-kernel-v1-current` とADR-0032-currentはsource一致、非draft、非stale。前回修復したpure7件は限定されたsource適合であり、全実行経路の証明ではない。
- C-EXEC-001 📜 高信頼: 本人確認範囲の非root根拠修復を続行できるが、確認できないconsumerを現行根拠へ一括昇格できない。根拠: E-EXEC-001〜003。
- A-EXEC-001 🚀 [実行中]: 各sourceをLunaで意味照合し、適合範囲が確定したものだけ登録・読戻しする。参照: C-EXEC-001。原文・旧Sealを保持する。

CLI監査 `ConsumerContinuation` はfatal/error/warning各0。未知のconsumer適合はpendingとして残し、監査の成功を意味適合の代替にしない。

## 通信portとタイムアウト検証の保留

- E-EXEC-004: `ports.ts` の `expireOutstandingSemanticAuthoringV1` と `acceptSemanticAuthoringDeliveryV1` はtimeout時、別のcontrol failureがなければ `resource_exhausted` を返す。timeout判定には `reservation.elapsedMs` を使う。
- E-EXEC-005: `scripted-ports.test.ts` のtimeoutケースはreceipt category `resource_exhausted` を期待する。`conformance.test.ts` F14も同じportを呼び、terminalとlate rejectionを検証する。
- E-EXEC-006: Accepted design7.2とADR-0032 D1–D3は、provider transport timeout、worker境界、非時間資源上限を区別する。timeoutのtyped receipt、回復可否、新規予約の資源判定は別段階である。
- C-EXEC-002 📜 高信頼: 上記portとscripted timeoutテストを、現行design7.2に適合するものとして再Sealできない。根拠: E-EXEC-004〜006。Lunaも同じ具体的不一致を確認。
- A-EXEC-002 ⛔ [保留]: portとscripted-ports testの現行昇格を保留。conformance全体も未確認のまま保持する。参照: C-EXEC-002。テスト期待値や実装を変更しない。

CLI監査 `TimeoutConsumerAdmission` はfatal/error/warning各0。60秒というテストfixture自体を製品仕様違反とは扱わない。問題はtimeoutの結果分類である。実際のprovider経路全体への影響と生成原因は未確定であり、この照合をRCA完了とは扱わない。

## 登録・検証結果

個別Lunaの意味レビュー、source identity照合、登録後readbackを以下に記録する。未確認のadapter、テスト、実行経路の有効性は含めない。

| REF | Seal | 範囲 |
| --- | --- | --- |
| `implementation/semantic-authoring-kernel-v1-current` | `9c6282d8a555cfbdc81294604903dab66a9fe63080b6eaf0793935a544e8c41a` | design4.4の隔離staging、revision一致、hard check、finding重複排除。Causeはdesign/foundation/contracts-current |
| `implementation/semantic-authoring-orchestration-v1-current` | `fe9cf9616775c79be272331192251a83422699fa2a9eb45767101c87ba5be6ae` | design3–4/6/7.3/8.2の作業選択・候補適用・進捗・終端制御。Causeはdesign/foundation/contracts/accounting/capability/progress/kernelの現行7件 |

両件Luna意味レビューと独立readback PASS。非root・非draft・非stale・source一致・Candidateなし。実装bytesは不変。kernel SHA256 `283f85c87235d4a77327827d4971e0ec453e7dbcaa96c91d814681cce0584b43`、orchestration SHA256 `e3773f7c625315530b38f18d8f686b568cffc384ea8de00c2fa1194843949a09`。

## キャラadapterの保留範囲

Lunaがcharacter contracts/context/source ledger/adapter本体の4ファイルを照合。contractsの型・payload構造は限定PASSだが、依存するV3 schema実装REF `23e91480` はsource不一致、change-set実装REF `787d83e3` は推移的stale。依存元を未確認のまま新しい現行Sealへ付け替えない。

`character-v3.ts` の `propose_deferral` はacceptedを返してもobligation等を更新していない。design5のtyped ledger更新との具体的な差分として保持する。`reconcileAffected` はfindingsをそのまま返し、`assessQuestion` は常にask=false、`applyAnswer` は固定question IDと空のaffected claimsを返す。他層が責務を補っているかは未確認で、システム全体の不備や原因は断定しない。

一方、ledger contextが全normsを含むこと、source-ledger単独で意味同値性を証明しないこと、未知ID処理、discard完了経路は境界確認が必要な事項である。これらを直ちに違反とは扱わず、新しい移行精度条件も課さない。4ファイルとも今回昇格しない。CLI監査 `AdapterProvenanceHold` はfatal/error/warning各0。コードの修正や追加仕様判断は実施していない。

## 共通基盤テストの期待値と上位根拠

Lunaは以下2ファイルの期待値を個別照合した。初回は旧Cause/source不整合で保留し、修復済みcurrent実装への依存対応を再確認して、意味・coverageの限定PASSとなった。旧根拠へのテストSealを保持し、新しい根拠には別のcurrent REFを用いる。テスト本文・期待値は変更しない。

| 対象・期待値群 | 現行根拠 | 限界 |
| --- | --- | --- |
| kernel-foundation: 予約・累積資源・同時計数、whole-attempt時間上限を使わない | design7.1/7.2、foundationF3/F15、ADR0032 D1–D5 | fixturesは本番の時間既定値を作らない |
| 進捗窓・回復・反復検知 | design7.3、foundationF2/F9/F15 | adapterの意味的進捗判定自体の証明ではない |
| staging・revision・trusted state保持・finding重複排除 | design4.4、foundationF6–F8/F15 | DB transactionやlive routeではない |
| capability・binding・selector/schema・失効 | design4.2、foundationF4/F10/F15 | 実provider transportの証明ではない |
| resolver/state終端区分・outstanding形状 | design3/8、foundationF5/F11/F15、ADR0033 D1–D3 | cancel/expiryをresolver結果と混同しない |
| decoder・focused schemas | design4.1–4.3、foundationF4/F5/F7 | 入力文字列境界とschemaの限定検証 |
| pure orchestration・owner Q&A条件・late/recovery guard | design3–8、foundation対応節 | 完全な製品適合やキャラadapterのQ&A完成ではない |
| shared semantic-authoring: closed resolver、outstanding、終端、typed adapter境界 | design3/8、foundationF1/F2/F4/F5/F8/F11/F12 | stubAdapterと空ledgerはfixture |

kernel test SHA256 `a8047e4cb87dd8171c2bdc2cb915bc0de4999724c611617531aaa9c20cf8c63e`、shared test SHA256 `33216c5bc6b2aeef30a7cf8d2288c38fd36a75b13ef10ac36e0081dcd8a97683`。kernel testの実import根拠はcontracts/accounting/capability/kernel/orchestration/progress/run-state/decoderのcurrent8件、shared testはcontracts-current。両者にdesign/foundationを直接Causeとして加える。shared exportは同じsourceへのroutingであり、別の意味適合を代表するCauseにしない。

CLI監査 `ReviewedTestRouting` はfatal/error/warning各0。登録後にinventoryの該当2REFだけを更新し、inventoryとその変更に依存するselector検証の根拠を再照合・再Sealする。selectorのロジックやテストは変更しない。正式選別・実行結果は読戻し後に記録する。

上記手順を実施した。新検証2件はLuna最終readback PASS、nonroot/nondraft/nonstale、source一致、Candidateなし。inventoryの旧Seal `71534515` のraw contentとの比較で変更は2mappingのみ（cc304の既存mappingは不変）。その限定wiringのLunaレビューもPASS。

| REF | 現行Seal |
| --- | --- |
| `verification/semantic-authoring-shared-contracts-v1-current` | `2154dc04be218596caa4eb9917ecc2b4f725beee0b670b895eb469a49dc9e6c6` |
| `verification/semantic-authoring-kernel-foundation-v1-current` | `09cf6446d96834aa021a812a7f60cbb9edf48fbf77a8ef8b3ab440d8a6ff04bd` |
| `implementation/test-authority-inventory-v2` | `1685c58a123d9c4bbedf4f75919348b62881fa15194c2d45c685e616b8c76fc3` |
| `verification/test-authority-selector-v2` | `301c057a9a29a83a19f16a37910068b8a5d6dae1a8da994a0dfc9ef6209a9fd4` |

selector検証はテスト本文・他Causeを変えず、新inventory Causeに旧 `71534515` とのrevision関係を記録した。過去のSealとその根拠は保持する。

登録後の選別実測はunit156件、active5/provisional1/disabled150。増えたactiveは上記2ファイルのみ。現在のshared sourceをbuildした後、2ファイルの45テスト成功、再Seal後selector9テスト成功。先に行ったselector9件の診断実行は正式結果に代用せず、登録後に再実行した。通信port、conformance、キャラadapter、provider、DB、Stageの動作証明には広げない。

最終検証: `npm test` は正式選別5ファイルで62件成功（backend50/shared3/selector9）、provisional1とdisabled150は実行対象外。`npm run typecheck`、`git diff --check` 成功。inventoryとselector検証のLuna最終readbackもPASS。fsckはok、939 Seals/415 HEAD REFs、未参照blob1は未公開ADR-0007 Candidateの内容。今回追加6 Sealsのうち新REF4、既存REF更新2。

用途台帳は415件すべてのcurrent_headをfilesystem REFと再照合し、一致を確認。過去観測は分離。現在用途62・履歴14・未確認339は用途分類で、テスト数・完了率ではない。今回の機能コード・テスト本文変更は0、inventory mapping変更は2件、commit/push/provider実行・配備は0。実装の不一致をリンク修復で隠さず、旧根拠の記録とWIPを保持した。

## 残件と価値

アプリ利用者が移行を使えるようになった増分は0。今回の寄与は、再開に使える実装・テストの根拠と、現行設計に対する未完了箇所の切り分けである。実利用にはM1残件、M2接続、別途認可するM3 Stage試行が残る。費用・全体完了時期は未確定。
