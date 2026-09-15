# キャラクター意味オーサリング 品質属性・レビュー十分性定義 revision 3

- 状態: Step 1候補、セルフレビュー済み、初回オーナーレビュー待ち
- 日付: 2026-09-15
- 決定者: プロダクトオーナー
- 置換候補: revision 2（受入済みではない）
- 適用候補: V3キャラクター作成・改訂・V2からV3への移行と、その配備・切替
- 正本文言: 本書の日本語本文

## 1. 目的

「安全」「互換」「高性能」「よりよい」のような比較だけで、必須範囲やレビューを増やさない。
品質の各主張を、対象、守る成果、測定方法、判定基準、証拠、扱いまで決定可能な形にする。
レビューは改善案を無限に探索する活動ではなく、固定された対象を既知の基準に照らして分類し、
結果を返した時点で完了する。

本書は新しいレビュー工程や承認ゲートを追加しない。既存の要件、ADR、計画、実装レビュー、
Stage評価、配備確認で同じ語を同じ意味に使い、どこでレビューを終えるかを定める。

## 2. 権限と適用範囲

### 2.1 維持する既存権限

次の受入済み文書の機能要件、禁止事項、既存上限、外部操作の権限境界を変更しない。

- 構造化意味オーサリング共通基盤要件 revision 3
- V3キャラクターオーサリング要件 revision 5
- キャラクター意味マイグレーション要件 revision 6
- ADR-0031と、それらが明示的に維持する既存ADR

本書が受け入れられた場合、上記を置き換えるのではなく、現在のキャラクター意味
オーサリングdeliveryで使う品質語彙とレビュー十分性を補足する。

### 2.2 対象外

- 未決のprovider、model、production policy、配備操作、pointer操作を選ぶこと
- 実LLMの成功率、遅延、費用、corpus構成を証拠なしに決めること
- 他の機能やrepositoryへ自動的に本書を適用すること
- テスト合格、レビュー完了、Stage合格を相互に代用すること
- 任意改善を受入必須条件へ昇格すること

## 3. 品質主張の共通形式

review開始前の品質主張は、少なくとも次の7入力項目と、`未評価`で初期化した結果slotを持つ。
7入力項目のいずれかが欠けた主張は、reviewerが補完せず、review後の結果を`判定不能`とする。

1. **属性**: 本書4章のどの属性か。
2. **対象**: revision、artifact、経路、操作、データ、利用者成果のどれか。
3. **境界**: 環境、version、producer/consumer、開始・終了、含む失敗を明示する。
4. **守る成果または避ける損失**: 何が保たれ、何が起きてはならないか。
5. **測定量または不変条件**: 単位、分母、percentile、比較方向を必要に応じて含む。
6. **判定基準**: 受入済み要件、固定値、baselineとの差、または明示的許容範囲。
7. **証拠方法**: fixture、corpus、観測期間、readback、trace、利用者判断など。

**結果slot:** review inputでは`未評価`とする。review報告でだけ、実際の結果として`適合`、
`不適合`、`判定不能`のいずれかへ確定する。`未評価`はreview結果ではない。

reviewerは必須claimを免除できない。適用しない対象は、review開始前に固定したscopeから除外し、
所見を`対象外`へ分類する。必須claim自体を外すには、そのclaimを定めたauthorityによる要件変更が
必要であり、review結果やowner以外の例外記録で代用しない。

属性名だけの主張、たとえば「安全な順序」「後方互換」「性能改善」は、レビュー所見や
配備理由として十分ではない。

## 4. 品質属性の定義

### 4.1 利用者価値・有効性

**定義:** 対象利用者が、定めた利用経路で意図した成果を得られる程度。

このdeliveryでは、作成・改訂・移行の各経路が実際のAPI/UI、worker、provider driver、
永続化を通り、完全なV3候補または説明可能な失敗へ到達し、所有者が候補を判断できることを指す。
部品の存在、テスト件数、レビュー完了、配備済みであることだけは利用者価値ではない。

### 4.2 機能正確性・意味品質

**定義:** 明示された機能契約と、保護された意味・許された創作・server所有事実の境界に、
結果が一致する程度。

構造妥当性と意味妥当性を分ける。Schema準拠だけでは意味品質を証明しない。
主観評価を使う場合も、評価質問、評価者、尺度、分母、合否規則を固定する。

### 4.3 安全性

**定義:** 指定した境界内で、指定した危害を発生させるリスクが、明示した許容範囲に
抑えられていること。ここでリスクは危害の重大度、発生可能性、影響範囲、可逆性で記述する。

このdeliveryで安全性として扱う危害は次に限定する。

- 保護されたキャラクター意味、元情報、世代、battle bindingの消失または無断変更
- 未受入候補、不整合候補、stale結果のactivationまたはlate resultの適用
- 権限のない開示、preservation情報の通常consumerへの流出
- 上限を越える自動実行、provider呼出し、token・費用・時間消費
- rollback不能または影響範囲不明の状態変更

安全性は「変更しないこと」「検査を増やすこと」「Stageを先に通すこと」の同義語ではない。
可用性、互換性、性能、セキュリティの主張は、それぞれ別属性でも判定する。

### 4.4 セキュリティ・プライバシー

**定義:** 認証、認可、機密性、完全性、監査可能性、データ最小化、保持・削除契約が、
指定した主体、資産、脅威、境界に対して満たされること。

「安全性」の一語で代用しない。owner認証、providerへ送る情報、preservation領域、
公開projectionは個別の主張にする。

### 4.5 互換性

**定義:** 指定したproducer、consumer、保存形式、versionの組が、指定した方向と操作で、
意味・identity・失敗契約を保って相互運用できること。

互換性の主張は次を必ず指定する。

- 対象version行列と方向: old→new、new→old、または双方向
- 操作: read、write、create、revise、migrate、battle bind/replay、rollback
- 保持するもの: bytes、schema、意味、identity、API形状、status、失敗契約
- 非互換時の扱い: reject、defer、migration、旧reader、rollbackのどれか

「既存互換」「後方互換」だけでは判定できない。新writerの出力を旧readerが読めることと、
新readerが旧データを読めることは別の主張である。

### 4.6 性能・効率

**定義:** 固定したworkloadと環境で、成果までの時間、処理能力、待ち時間、resource消費、
外部費用が、指定した基準内にあること。

性能主張は少なくともworkload、環境、warm/cold条件、成功・失敗の分母、測定区間、
p50/p95/p99等の統計、call・token・費用の集計範囲を指定する。平均値だけでtail latencyを
隠さず、call削減だけでtoken・費用増加を隠さない。

実行上限は暴走を止める安全制約であり、利用者が待てる時間や費用対効果を示す性能目標ではない。
速くなったという相対比較も、受入基準を満たすこととは別である。

### 4.7 信頼性・可用性

**定義:** 指定した期間と条件で、要求された成果または定義済み失敗を一貫して返せる程度。

成功率、失敗率、timeout率、再試行率、重複処理率、利用可能時間を、分母と観測窓を付けて扱う。
一度のsmoke成功は信頼性を証明しない。

### 4.8 回復性・可逆性

**定義:** 失敗または誤変更の後に、損失を限定し、既知の整合状態へ戻るか、元情報から
再実行できる能力。

source保持、failure receipt、idempotency、append/CAS、旧世代、rollback手順、RTO、RPO、
途中状態・late resultの扱いを必要に応じて指定する。rollback手順があるだけで、実行可能性や
データ可逆性を証明したことにはならない。

### 4.9 保守性

**定義:** 正しさを保ったまま、理解、変更、検証、廃止できる程度。

重複、複雑度、型、依存方向、変更範囲、運用負担などを測れるが、受入済み制約または今回の
明示的予算に結び付かない保守性改善は任意改善であり、利用者成果のblockerにしない。

## 5. 現deliveryの品質profile

次の行は完成済みquality claimではなく、現deliveryで使用するclaim templateである。
各reviewの開始前に、3章の7入力項目と`未評価`の結果slotをreview inputへ記録する。表にない境界、
測定量、証拠方法は、受入済みsourceまたは明示的なowner decisionから埋める。決まらない入力項目を
reviewerが創作せず、review報告の結果を`判定不能`とする。結果slotはreview後にだけ確定する。

| ID | 属性 | 判定対象 | 現在の基準template |
| --- | --- | --- | --- |
| QV-01 | 利用者価値 | create/revise/migrateの3経路 | 実API/UIから候補または定義済み失敗へ到達し、ownerが差分を判断できる。3経路のいずれかが部品だけなら不適合 |
| QC-01 | 正確性 | V3候補 | strict schema、reference、compiler、disclosure、consumer、preservation、accounting、coverage、最終意味reconciliationを満たす |
| QS-01 | 安全性 | 候補の保存・activation | protected source loss、無断変更、不整合/stale/late activationは許容0件 |
| QS-02 | 安全性 | 1 attemptの自動実行 | 既存の最大2 repair、6 provider requestと受入済み累積上限を越えない。新数値への変更は別決定 |
| QSP-01 | security/privacy | owner操作とpreservation | 認証済みownerだけがanswer/retry/acceptでき、preservationは許可されたmigrator以外へ露出0件 |
| QK-01 | 互換性 | historical V2 | 既存generationとbattle bindingを変更せず、新readerでread/replayできる |
| QK-02 | 互換性 | V3 adoption | public API、attempt identity、current pointer behaviorを既存契約どおり維持し、consumer非対応のV3を公開しない |
| QK-03 | 互換性 | rollback | code配備とpolicy activationを分離し、旧世代・旧policyへ戻しても既存データを破壊しない |
| QR-01 | 信頼性 | 代表3-mode corpus | 自動完了率、定義済み失敗率、不要質問率、重複質問率、recovery収束率の数値基準は未決 |
| QP-01 | 性能 | 代表3-mode corpus | end-to-end latencyのpercentileと上限は未決 |
| QP-02 | 効率 | 代表3-mode corpus | attempt当たりcall、token、費用の評価上限は未決。ただしQS-02のhard ceilingは維持 |
| QM-01 | 保守性 | 今回の変更差分 | `npm run typecheck`と、変更していないrepository設定による`npm run static`がexit 0。閾値・設定変更は別scope、合格後の追加refactorは任意 |

`QR-01`、`QP-01`、`QP-02`の未決値とcorpus構成は、実評価を判定する前にownerが固定する。
未決の間もレビューは`判定不能`として完了できるが、reviewerは適合・不適合・より良い値を
創作できない。既に判定できる他の主張まで再審査し続けない。

## 6. レビュー所見と終了条件

### 6.1 所見の分類

すべての所見を次のいずれかにする。

- **契約違反**: 受入済み要件または本書の明示基準に反する。対象条項と証拠を必須とする。
- **証拠不足／未決**: 必須主張だが、証拠またはowner決定がなく判定できない。
- **任意改善**: 測定可能な利点はあるが、現在の受入条件ではない。blockerにしない。
- **対象外**: 固定されたreview scopeに含まれない。

重大度は契約違反や証拠不足の影響を表す。重大度を付けても、任意改善や対象外を契約違反へ
変換できない。

### 6.2 レビューの完了

レビューは、固定snapshotと固定scopeに対して次を満たした時点で`completed`とする。

1. すべてのin-scope品質主張に3結果のいずれかが付き、すべての所見に4分類のいずれかが付いている。
2. 契約違反は、条項、対象、再現または証拠、影響する主張を特定している。
3. 証拠不足／未決は、不足物と決定者を特定している。
4. 任意改善と対象外をblockerまたは必須修正として扱っていない。
5. reviewer自身が次のreviewを開始していない。

`completed`は`適合`や`受入`を意味しない。不適合や判定不能が残っていても、レビュー報告は
完了してownerまたは実装者へ返す。

要件本文を含むreview対象のbytesが変われば、新しいsnapshotとして全in-scope claimに現在の
dispositionを付ける。以前のreview statusは持ち越さない。変更のないclaimの既存証拠は、source、
assumption、dependency、測定条件が新snapshotにも一致するcurrent-fit確認後に再利用できる。
新しく実行する検査は影響claimへ限定できる。新しい矛盾証拠または依存変更があるclaimは、
bytesが直接変わっていなくても再評価する。

### 6.3 「よりよく」の扱い

次のいずれかを満たさない改善提案は、任意改善として現在のreviewを終了する。

- 受入済み要件または本書profileへの具体的違反を解消する。
- ownerが固定した数値目標との差を埋める。
- 現在scopeの既知リスクを、指定した費用・期間内で許容範囲へ下げる。

将来価値があるだけの提案はbacklog候補にはできるが、現在snapshotの修正、再レビュー、
配備延期を自動的には要求しない。

## 7. 受入基準

1. 品質主張はreview前の7入力項目と`未評価`の結果slotで記録され、review後に3結果の一つへ確定し、属性名だけでは判定しない。
2. 利用者価値、正確性、安全性、security/privacy、互換性、性能、信頼性、回復性、保守性を区別する。
3. 安全性は指定危害のriskとして扱い、変更回避や検査追加と同一視しない。
4. 互換性はversion行列、方向、操作、保持対象、非互換時の扱いを指定する。
5. 性能はworkload、環境、統計、時間とresource/costの集計範囲を指定する。
6. hard ceiling、性能目標、成功率、利用者価値を相互に代用しない。
7. レビュー所見は4分類、品質結果は3結果で閉じ、reviewerによる免除と任意改善のblocker化を許さない。
8. レビュー完了、品質適合、owner受入、配備、activationを別状態として扱う。
9. 未決値は未決のまま決定者を示し、reviewerが値を創作しない。
10. 新snapshotでは全claimを現在形で判定する。既存証拠はcurrent-fit確認後に再利用でき、新規検査実行は影響範囲へ限定できる。
11. profile行はclaim templateであり、review inputで7入力項目と`未評価`の結果slotを完成させてからreviewする。
12. 本書はレビュー工程を追加せず、既存工程の語彙と終了条件だけを定める。

## 8. 未決事項

本候補の定義を採用しても、次の値は決まらない。

- 代表create/revise/migrate corpusの件数と構成
- 自動完了率、定義済み失敗率、不要・重複質問率、回復収束率
- end-to-end latencyの測定環境、percentile、上限
- attempt当たりtoken・費用の評価上限
- Stage観測期間と、production activation判断に必要な標本

これらは実評価開始前の別owner決定で固定する。値の選択は本候補revision 3の受入範囲外である。

## 9. revision 2からの変更

独立レビューF1だけを反映した。

- review前に必要なものを7入力項目と`未評価`の結果slotに分けた。
- review報告でだけ結果slotを`適合`、`不適合`、`判定不能`のいずれかへ確定する。
- 7入力項目が欠ける場合はreviewerが補完せず、結果を`判定不能`とする。

上記以外の品質定義、profile基準、review終了条件、未決値、authority境界は変更していない。

## 10. セルフレビュー

- source provenance: 受入済み3要件、ADR-0031、revision 2と独立レビューを参照した。
- prior authority: 既存要件を補足し、上書きしない。revision 1とrevision 2は未受入の履歴として維持する。
- finding closure: revision 2 F1は7入力項目、`未評価`slot、review後の3結果確定を分離して処理した。
- regression: revision 2で閉じた全claim current disposition、証拠のcurrent-fit再利用、影響範囲だけの新規検査、免除禁止を維持した。
- scope: 現deliveryだけを規範範囲とし、他機能への自動適用を除外した。
- compatibility/namespace: 外部schema、API、status、version名を追加・変更していない。
- unknowns: user評価、性能、費用、corpusの数値を未決のまま維持した。
- review sufficiency: review完了と適合・受入を分け、失敗を含む有限な終了状態を維持した。

## 11. 独立レビューへの提案入力

固定snapshotについて、revision 2独立レビューF1が閉じているかを確認する。特に、review前に
7入力項目と`未評価`の結果slotを用意し、review報告でだけ3結果の一つへ確定するため、事前に
実結果を要求する時系列矛盾がないかを確認する。

加えて、revision 2で既に閉じた事項と、安全性・互換性・性能等の定義、任意改善の非blocker化、
未決数値、既存authority、外部namespace、利用者価値の境界が意図せず変わっていないかを確認する。
