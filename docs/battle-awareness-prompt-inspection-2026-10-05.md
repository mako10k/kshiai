# 意識パイプラインのプロンプト点検（2026-10-05）

対象は作業用checkout `codex/cc304-focused-revise` / HEAD `3a32c2d` の未commit実装。所有者の「なんでそんなことが起きるの？プロンプトの点検を行いましょう」に基づく、実装と出力契約の読み取り点検。潜在・顕在・遭遇生成・自由行動裁定・世界再調整・環境提案・最終裁定と実況4phaseを、投影→自然文→system構成→SDK送信→schema検証まで確認した。

要件は、自然文の入力、機械が読む出力、反射と感情の区別、顕在の凍結時点、正準状態の所有権、原文発声と不変資料の保持。今回の点検では矛盾・未確認事項・検証範囲を確定する。実装修正、出力schemaの緩和、既存資料の書換え、有料再送、配備は後続工程であり実施していない。review-phase-boundary / root-cause-analysis / cost-aware-orchestrationを適用し、独立の読み取り点検は実況に限定した。

## なぜ起きたか

旧実況builderは「何をどう描写するか」と「どんなJSON形式を返すか」を一体の `system` にしている。新しい意識パイプラインでは、その `system` 全体を凍結資料へコピーし、送信時に `receipts` 形式の指示を追加している。新しい形式を付けても旧形式の指示は消えないため、同じ一回の呼出しに二つの出力契約が残った。

この組立て条件は保存済み開幕資料から通信なしで再現できた。生成側の実装不備として確認できる。観測された旧単一形式は旧指示と一致するが、モデルがどちらを選んだ心理・内部生成過程までは不明。strict schemaが拒否したのは直接の検出点、測定ハーネスのfail-stopは今回の計測停止点であり、プロンプト矛盾を作った原因とは分ける。

## 確認した不整合

|ID / 分類|所見|影響・根拠|
|---|---|---|
|PI-01 / INSIDE P1|単一形式と `receipts` 形式が混在|開幕、戦闘、判定、後日談、別combat batch経路に共通。freezeが旧system全体を保持しwrapperが新形式を追記。|
|PI-02 / INSIDE P1|旧combat例が `focus` を返すよう指示|新receipt schemaには `focus` がない。envelopeだけ修正しても次に余分な項目で拒否しうる。|
|PI-03 / INSIDE P1|旧規則が句読点・表記の変更を許可|新wrapperと照合は発声 `sourceSide` と `text` の完全一致。意味が同じでも表記変更で拒否しうる。|
|PI-04 / INSIDE P2|テストが完成済みの正しい返答を用意|frozenテストのsystemはplaceholder、返答は手作りの正しいreceipts。実際の合成prompt内の競合指示を確認していない。生成原因と別の検出漏れ。|
|PI-05 / INSIDE P2|通常テスト211件はawareness群を選択していない|実行ログでunsealedとして除外。通常テスト成功を新promptの整合性へ拡張できない。関連直接テストの意味検証も別。|
|PI-06 / INSIDE P2|不正JSON回帰テストのfixtureが現行会計分類と不一致|`generateCharacterDefinitionV2` は現行taxonomyにない。HTTP前にPROVIDER_OPERATION_UNCLASSIFIEDになり、期待するJSON解析まで進まない。|
|PI-07 / INSIDE 観測限界|顕在の返答の終了理由・空判定が記録されていない|completionTokens=0と不正JSONは確認できるが、生の返答とfinish_reasonがなく生成原因は不明。これは診断上の限界であり、既存のtoken記録契約への違反とは断定しない。|
|PI-08 / OUTSIDE 改善候補|Luna入力3653〜4023token、target1800より大きい|prose化は実施済みだが全構造項目の展開が多い。入力縮約は情報境界を保持する後続設計。今回の形式拒否との因果関係は未確認。|

PI-01〜03の現行コード箇所: [旧combat](../backend/src/llm/openai-compatible.ts#L571)、[旧prologue](../backend/src/llm/openai-compatible.ts#L611)、[旧aftermath](../backend/src/llm/openai-compatible.ts#L666)、[旧judgment](../backend/src/llm/openai-compatible.ts#L705)、[凍結](../backend/src/llm/awareness-narration-phase.ts#L21)、[新wrapper](../backend/src/llm/awareness-frozen-narration.ts#L46)、[新strict schema](../backend/src/llm/awareness-frozen-narration.ts#L24)。構造化資料には各所見の全参照行を記載した。

## 他の役割

潜在・顕在のトップ項目、source、body/voiceの分離、行動intent例は現行schemaと一致。潜在の反射・感情分離、曖昧なfeltProjection、顕在の凍結された知覚・本人向け感覚も指示されている。旧v1の曖昧なaction指示は歴史的束縛として保持され、新規v2には既存action schemaで検証した例が付く。今回と同じenvelope矛盾は発見していない。ただし顕在の不正JSONの詳細生成原因は未確定で、これらの点検は実モデル成功の保証ではない。

遭遇生成、自由行動proposals、世界patch/nextSituation/environmentDecision、環境proposal、最終winnerSide/reason/reasonFactsは、それぞれ現行decoderと出力形状が一致した。combined世界/感覚経路はsensoryEvidenceを同じ返答へ追加すると明示している。正準の裁定資料はdispatch context内で機械的に自然文へ変換する。正準の事実を感情や実況の結果で置き換える指示は見つけていない。

現在のawareness transportは `json_object` を指定し、内容の契約はpromptとサーバ側schemaで確認する。このコード上の構成も、すべての生成が受理できる形になる保証にはならない。モデルごとのstrict response schema対応を変更する案は、互換性確認を伴う後続設計で扱う。

## オフライン検証結果

保存済みprologue資料から送信requestを再構成し、旧単一JSON指示と新receipts指示、句読点変更許可と原文一致要求が同時に存在することをassertした。正しいbatchは受理され、単一形と余分なfocusは拒否されることを確認した。拒否された実モデルの生の本文の再生ではなく、形状に対するオフライン確認である。通信を禁止し、隔離SQLiteだけを使用した。

関連6ファイル27件の直接テスト: 26成功、1失敗（PI-06）。この失敗を隠すための除外やテスト修正は行っていない。通常テストの再実行・型チェック・ビルドは、実装無変更の今回の点検には追加実施していない。原因整理のCLI llmthink auditはfatal/error/warningすべて0。

## 推奨する修正と確認条件

旧consumerの単一形式を保持しながら、phaseの描写規則と返答形式を別の責務へ分離する。新規awareness生成は、各phaseの描写規則に一つの完全なbatch出力契約を結合する。単にreceiptsの指示を追記する、正規表現で旧JSON行を削る、サーバが不正返答を都合よく補完する、schemaを緩める対処は採用候補にしない。安定したtyped builderとschemaで検証した各phaseの完全な例を使う案を推奨する。

完了確認は、実際の生成経路で作る全4phaseと別combat batchのpromptに出力契約が一つだけあり、battleId/turnReceiptId/phase/turnと必要phase項目が指定され、禁止focusが指示されず、発声を原文のまま一度含める規則が一貫していること。回帰テストは手作りの返答だけでなく、実builderを通した合成promptを確認する。PI-06は現行operation分類を使うfixtureへ修正してJSON解析まで到達することを確認する。テスト選択のSeal根拠も別途整え、直接テストと通常テストの範囲を明示する。

既存の凍結資料を書き換えず、既存consumerの契約を保持する。新しいpromptのrevisionと、継続試合が今後生成する資料への適用範囲は修正設計で明示する。顕在の不正JSONは、本文を保存・公開せず長さ/空判定/終了理由等の最小観測で識別する案を詳細設計へ渡す。

修正とオフライン確認の残内部作業は30〜90分の暫定agent見積もり（確信度低）。対象はPI-01〜06の経路/fixtureと必要最小限のPI-07観測設計。PI-08入力縮約と、単価・モデル変更・有料再測定はこの工数に含まない。親ゴールawareness-verifyへの寄与は、実モデル完走を妨げる出力契約不整合の特定。完走は未確認のままで利用者への完走機能の実現価値は未成立。今回の点検task `awareness-prompt-inspection` の完了条件は点検資料、原因/未知の区別、検証範囲と修正案の保存。修正はまだ実施していない。

[構造化点検資料](evidence/awareness-prompt-inspection-2026-10-05.json) / [監査DSL](evidence/awareness-prompt-inspection-2026-10-05.think)。

点検task完了: 2026-10-05T11:36:52+00:00〜2026-10-05T11:43:33+00:00。rootの開始から完了まで0.111人時相当の経過区間をPERTへ記録した。補助エージェントの独立工数を計測した値ではなく合算していない。点検の残内部作業0時間。observe-velocityは新taskの履歴baseline不足で採用可能値なし。次の修正taskを開始する場合は編集実働とモデル待機を分けて計測する。
