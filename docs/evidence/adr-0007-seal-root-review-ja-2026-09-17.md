# ADR-0007 既存Accepted本文のroot登録レビュー — 2026-09-17

状態: 2026-09-18、本人が「登録を承認する」と回答し、記載した原文不変rootを公開済み。本文・コード・テストadmissionは変更していない。

公開readback: `acceptance/adr-0007-existing-baseline` = `6c982de4ffcb50602b855449b797a1c9cbec2668023186e732128b4ab7da0057`。source一致、非draft・非stale、`sealgraph fsck` はok。以下の候補説明はレビュー時点の資料として保持する。

## 今回の判断対象

正本: `docs/adr/0007-provider-operation-ledger-and-observation-ceilings.md`（Accepted、2026-08-13）。全文を変更せず、`acceptance/adr-0007-existing-baseline` のrootとして登録する案。新しい製品仕様の採用、ADRの再決定、過去のRCAの現時点での再認定ではない。

目的は、物理的なprovider呼出しと使用量台帳の既存決定を、下流の実装・検証から正確に参照できるようにすること。今回の確認では、`provider-json.test.ts` が観測する使用量精算に対して、既存の直接Causeであるresponse-schema helperだけではcoverageが足りず、ADR-0007に対応するSealも見つからなかった。

変更前後の差は「既存Accepted本文の参照可能な根拠アンカーが加わる」ことだけ。本文、コード、DB、provider実行、retry仕様は変更しない。このrootを承認しても `provider-json-v1` は自動的に有効にならない。HTTP decode失敗とtransport retryの個別期待値、現行実装sourceの対応は別の未完了事項である。

選択肢:

- **原文不変のroot登録を承認する（提案）**: 既存台帳契約を下流から参照可能にする。rootは上位Causeを持たない境界となるため、その採用判断は本人が行う。真実性・実装適合・全テスト有効性を保証するものではない。
- 登録を保留する: 既存資料と歴史は保持する。当該根拠に依存するテストの現行admissionは保留のまま。独立した非root修復は妨げない。

レビュー範囲は正本全文。以下は全文の日本語訳で、省略部分はない。日本語はレビュー補助であり、別の正本ではない。

## 全文日本語訳

### ADR-0007: provider operation台帳と観測上限

- 状態: Accepted
- 日付: 2026-08-13
- 決定者: プロダクトオーナー
- 関連: GitHub Issue #98、`T_ACCEPT_PROVIDER_ACCOUNTING_ADR`、`docs/v0.17.3-provider-operation-accounting-rca.llmthink.dsl`、`docs/evidence/production-observation-0.17.3-2026-08-13.md`

### 背景

上限付きのv0.17.3本番観測では1試合が正常終了し、revisionログはretryやfailureの記録なしに58件の成功LLM operationを示した。しかし永続化された観測データではnarrationのHTTP attemptが0件となり、事前見積りのレイヤー予算から実際に発生したoperationが抜けていた。

独立している二つの契約が混同されていた。一つは実行開始可否を決める保守的な事前見積り、もう一つは開始後に消費された実際の物理provider attemptである。

narrationはアプリケーションが報告するattempt値を保存していたが、終端エントリーでは`active_attempt_id`が消され、観測用read modelはこの現在の所有権ポインタだけを通じて保存済みattemptを結合していた。他のbattle providerレイヤーには永続的な実operation台帳がなかった。provider adapterのretryは`LlmProvider`インターフェースの下で発生し、呼出元では数えられなかった。

これは状態所有権、永続化、retry、観測APIに関わる重要な判断である。そのため新しい永続台帳の追加やprovider transport境界の変更には、先にADRの受入が必要である。

### 判断の観点

- 承認された観測runが物理attempt上限を超える前に止める。
- 成功した論理呼出しだけでなく、失敗とretryを含む外向きattemptを数える。
- accountingを正確な観測runと不変のbattle identityに結び付ける。
- 開始可否の見積りと、測定した実消費を区別する。
- 未分類の観測呼出しを黙って集計から落とさず拒否する。
- providerのprompt、response、secret、非公開キャラ状態をaccounting台帳に入れない。
- 通常の非観測gameplayとの互換性を保ち、その成功を観測専用予算レコードに依存させない。
- tokenや価格の根拠が不明なら、0と報告せず不明のまま保持する。

### 検討した選択肢

1. 試合後に構造化Cloudログを数える。完了したrunの診断はできるが、すべての呼出しを確実に対応付けたり、超過前に次の送信を拒否したりできない。
2. 各`LlmProvider`メソッドで数える。論理operationは分かるがadapter内部の物理retryを捉えず、多数のメソッドにpolicyが分散する。
3. 共通provider transport境界で各物理attemptを予約・記録し、request単位の観測contextと永続run台帳を使う。永続化とcontext伝播が増えるが、承認済み物理attempt上限を強制できる唯一の案である。
4. 保守的見積りを増やしてnarrationだけの実績を残す。観測された過小見積りを避けられる可能性はあるが、完全性と実行時制御は証明できない。

### 決定

revision管理された網羅的な見積りregistryを伴う、選択肢3を採用する。

#### 単位と分類体系

application operation、論理provider call、物理provider HTTP attempt、adapter retry、narration receipt attempt、Cloud Tasks delivery attempt、tokenと金額見積りをそれぞれ別単位として扱う。

承認された観測が使うすべてのbattle provider operationは、revision管理された一つのlayerとoperation keyに属する。初期layerは`encounter`、`characterExpression`、`deepPsyche`、`environment`、`narration`、`referee`。battlefield具体化とencounter準備が同じencounter layerを使っても、registryは別のoperation keyを持つ。観測可能なprovider operationの対応が欠けると見積りテストは失敗する。

見積りは、有効なworkflow phaseとfeature policyから導く保守的な開始判定であり、実使用量として提示しない。

#### Runとbattleの所有権

観測runはbattle作成requestより前に永続化し、不変のrun ID、見積りrevision、承認済み物理attempt上限、予約数、lifecycle状態、timestampを持つ。E2E observerが既存DB権限でrunの作成と終了処理を所有する。

create requestが制限されたrun IDを運ぶのは認証済みE2E accountの場合だけ。battle作成はrun IDを新しく確保したbattleへ不変に結び付ける。battle構築中の呼出しも同じ事前確保済みbattle IDを使う。advanceとnarration-workerは保存済みbattle bindingから観測contextを導く。clientは別headerで既存battleを再bindできない。

既存・通常battleには観測run bindingがない。contextがないことによって通常のprovider挙動は変わらない。不明、非active、上限消費済み、別battleへbind済みのrunを指定するE2E requestはprovider処理前に拒否する。

#### 物理attemptの予約と台帳

共通provider transportはrequest前に一つの`logicalCallId`を割り当てる。adapter retryを含む各物理送信の直前に、次を原子的に行う。

1. runがactiveでbattle bindingが一致することを確認する。
2. operationに登録済みlayerがあることを確認する。
3. 承認上限未満の場合だけ`reserved_attempts`を増やす。
4. `(logicalCallId, attemptOrdinal)`で識別する台帳行を1件挿入する。

外部requestはtransactionのcommit後にだけ開始する。予約後のcrashでは、未解決結果として消費済みattemptを維持し、予算へ戻さない。完了時は成功・失敗、provider、model tier、経過時間、利用可能なusageを記録する。冪等な予約で同じattempt identityについて二重加算しない。

台帳にはprompt、response、header、credential、非公開キャラ状態、公開narration本文を保存しない。相関IDは不透明で長さに上限を持つ。台帳アクセスは内部とE2E observerに制限する。

#### Narrationのread model

`active_attempt_id`は引き続き現在の作業所有権だけを意味する。内部observabilityは最新の保存済みattemptを独立に選び、receiptとbattleの全保存attemptも別に集計する。放棄・失敗attemptも予算消費として残す。receipt attempt数、provider物理attempt数、delivery attempt数を別fieldで返す。

provider台帳が観測全体の物理attemptの正本である。narration集計は責務内のcross-checkであり、観測の受入前にnarration operationについて整合しなければならない。

#### 受入と停止の挙動

観測runを受入可能とする条件:

- run ID、battle ID、見積りrevision、上限が正確かつ不変。
- すべての物理attemptが分類されbindされている。
- すべての論理callと期待されるnarration receiptが終端状態。
- 台帳合計がlayer合計に一致し、予約数を超えない。
- narration receipt accountingがnarration台帳エントリーに一致。
- runが承認上限を超えて予約したことがない。
- tokenや費用の根拠欠如は明示的に不明のまま。
- live generation、lease、未解決attemptが残っていない。

上限消費時は次のprovider送信前に拒否し、自動advanceを止めて永続診断状態を残す。上限を増やす、別run IDでretryする、未計数providerへfallbackすることはない。

### 結果

#### 利点

- 物理的な費用境界で承認上限を強制できる。
- queue再配信をprovider処理と数えず、retryとfailureの消費を可視化できる。
- 不変の実績根拠と独立に見積りを改訂できる。
- 観測receiptをlayerとoperationごとに説明・照合できる。

#### 不利益とリスク

- 観測対象の各provider attemptで外部call前にDB transactionが増え、latencyと観測runのDB可用性依存が増す。
- 再bindやなりすましを許さず、API request、battle永続化、Cloud Tasks間でcontextを伝える必要がある。
- 予約直後のcrashで物理callを過大計数することがある。上限なしの重複を許すより保守的にする意図的な選択である。
- providerがusageを返さない場合、正確なtokenと金額は不明のまま。別の保守的token・価格policyが必要。

### 互換性と移行

- battleへnullableかつ不変の観測run identityを追加する。既存行と通常battleは`NULL`のままでbackfill不要。
- 一意性と上限制約を持つrun/物理attempt台帳tableを追加する。加算的migrationであり、過去ログを権威ある台帳エントリーと読み替えない。
- 既存narration attempt行は維持する。read modelの選択・集計方法だけを変更し、破壊的なデータ書換えはしない。
- 観測payload schemaは加算的に拡張し、既存見積りfieldを残しつつprovider台帳を実績と明記する。
- release、DB migration実行、deploy、queue変更、次の本番観測は別認可が必要。

### 検証

- `active_attempt_id=NULL`の完了済みnarrationでも最新保存attemptとusage合計を取得できる。
- 放棄attemptの後に成功attemptがある場合、両行を集計する。
- 見積りfixtureはcreation、prologue、combat、judgment、aftermath、任意deep psyche、environment処理、narration、referee経路をカバーする。
- fake provider transportで成功、各retry、終端failureそれぞれの予約を確認する。
- 同じattempt identityの繰返しは冪等で、次のordinalは新しい予約を1件消費する。
- 上限を超える最初のattemptはfake transport I/O前に拒否される。
- 不明、非active、上限消費済み、未分類、battle不一致のcontextを拒否する。
- 台帳fieldにprompt、response、secret、キャラ状態データを含めない。
- release判断の前に、対象テスト、全build/typecheck/test、生成物のclean確認、LLMなしStage receipt fixtureを通す。

### 実装参照

- LLMThink RCA: `docs/v0.17.3-provider-operation-accounting-rca.llmthink.dsl`
- 本番観測根拠: `docs/evidence/production-observation-0.17.3-2026-08-13.md`
- `docs/issue-98-battle-pipeline-plan.pert`

## 候補と確認記録

- 正本SHA-256: `5b602923955ad497a1d986551d1850e9fe51d035c42e4ecf3459a3653fc7e793`。
- 未公開Candidate: `acceptance/adr-0007-existing-baseline`。
- 予定Seal: `6c982de4ffcb50602b855449b797a1c9cbec2668023186e732128b4ab7da0057`。
- `root=true`、`draft=false`、Causeなし、HEADなし。Candidateは現行根拠ではない。
- 原文不変root登録の限定LunaレビューはPASS。本文が既存Acceptedであること、現行対応Sealの欠落、root登録とテストadmissionの区別を確認した。
- 正本全文の日本語訳とレビュー構成についてもLuna確認PASS。重要な節・制約・数値・識別子の省略なし。
- 主担当の登録判断CLI監査 `ProviderLedgerRootReview` はfatal/error/warning各0。過去RCAの再認定に用いない。
- 本人承認前にSeal公開しない。承認の対象はこの原文・予定Sealに限定する。
