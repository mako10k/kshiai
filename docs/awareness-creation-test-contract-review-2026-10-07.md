# 意識パイプラインの作成・保存・初回進行のテスト因果レビュー

2026-10-07。6全ファイル、元29実行ケース。Accepted ADR0051 INHERITANCE/D01/D02/ACCEPTANCEを現在の根拠とし、0050 D01-D04/D08-D10/D12は0051で継承した状態所有・privacy/output・time/count・once-only durable operations・新規awareness-v5の範囲だけに用いる。Superseded0050を単独Accepted根拠にしない。0051は新しいobserved usage-v1から必須certified input/price proofを除き、実token/unknown costを保存する。0054 ACCEPTANCEは新規通常usage-v2の待機期限だけを延長し、observed accountingと旧明示bindingを保持する。0056 ACCEPTANCEは継続を含む最新output指示と凍結事実の保持、0006 Decisionはcanonical-first/independent narrator/ordered terminal receipts、0018正本Decisionはimmutable dialogue activationのsaved settings由来を根拠とする。0043は普通の新規V3資産と内部歴史fixtureを区別する。Proposed0059や旧切替試行の実行許可は使わない。

## テストが確認する範囲

- repositories/battle-awareness-creation 7件: private SQLiteのprepared→reserved→ready→adopted、厳密identity/idempotency、再dispatch拒否、deadline、battle/runtime adoption同一transactionとrollback、late/unknown physical feeの保持。claim fixtureの既定は保存済みcertified trial policyで、そのproof拒否は新規observedの要件ではない。実価格token上限・ネットワークretry・PGの証拠ではない。
- repositories/battle-awareness 9件: SQLite runtime CASとlease/fence、world/runtimeの原子rollback、unknown/cancelled予約保持、world lease解放後のconscious acceptance、narration-only terminal drain。多instance PG race、Cloud task/SSE配送や全privacyではない。
- services/awareness-battle-creation 1件: 正しい合成V3世代とtest-only SDK/fetch mockで実startBattle→initial advance、usage-v2/prompt binding、manifest immutability、作成adoption/idempotent replay、physical attempt role scopeとpublic state。証明なしprovider(false)でもobservedで実fixture request/createが許されるため、zero-send拒否の証拠として扱わない。全latest prompt指示/自然さ/正常公開完走は別証拠。
- services/awareness-battle-service 5実行ケース: 明示したcertified trial fixtureのroute/proof不足でcanonical world/fighters/winner/settlementを保存、設定済みprologue/combatでbody intent不在を勝手な行動へ置換しない、legacy role未呼出し、KOのcombat+aftermath同時確定/終端job取消とgeneration更新、必須semantic失敗なら初期bucketを保存しない。正常新規observedのproof要件に読み替えない。KO fixtureのpower/default rating式全体を受入するものではない。
- services/awareness-creation-encounter 6件: prepareAwarenessCreationEncounterとfake SDK fetchでcertified quote/persist-before-send、失敗/late/deadline拒否、explicit observedではbilling contractやpricesなしで成功。無policyのfixtureはhistorical certified AwarenessDefaultPolicy。実価格、外部network/model、global budget全閾値ではない。
- services/battle-create-idempotency 1 outer case: actual SQLite/startBattleとoffline rolesでsame battleIdのencounter一度だけ・one row・immutable V3/compiler/dialogue/battlefield binding、設定更新は新試合だけ・old snapshot保持、timeout/cap/DNS failureはdurable failedで再送しない・secondary routeへの黙ったfallback0・canonical battle row0。timeoutは即時throwされた文字列で経過時間のdeadline検査ではない。同caseはawarenessPolicy.revisionをassertしないためusage-v2 exact値の証拠には数えない。compilerの500はfixtureの投影値の局所回帰で新numeric policyの採用ではない。同IDと別bodyの全衝突、並行複数API、real model/PGは別検査。

## INSIDE: strict fixture inference

29ケース0fail0skipでもstandalone strictはawareness-battle-service.testのconst subjectiveをTS7022 implicit-anyと報告。source initializerに直接self referenceはなく、compiler内部cycleや歴史原因はunknownと明示した。getAwarenessRuntimeの戻り値とAwarenessPipelineStateSchemaの両sideは宣言済みAwarenessCharacterStateである。CLI RCA audit fatal/error/warning0後に、そのshared typeのimportとlocal annotationだけを追加し、initializer/control flow/全51assertion/元4test callと他5filesは保持する。runtime/schema/fixture値は変えない。backend noImplicitAny:falseの通常compiler成功に依存せず、対象とimportをstandalone strictで再検査する。

## OUTSIDE・境界

実provider/model品質・正確な料金・実PostgreSQL race・公開normal completion・CloudTasks/SSE/narrator独立fenceの全検査を今回の局所証拠で達成にしない。価格証明停止、旧切替試行破棄、未決定authoring/fallback/数値規範は変更しない。新しいOwner decisionを下位test期待値から作らない。BOUNDARY_DISPUTE: 本6files内で新Owner判断を要する矛盾は現時点で見つからない。

## 封印と計測

共通契約の1回照合と5filesの独立reviewを再利用し、追加idempotency1fileとannotation deltaだけ追加review。実行29/0fail/0skip、standalone strict、workspace checks、case preservationとsource/cause exact readback/fsckを記録。251全ファイルを保持し、unsealed停止を維持して全体合格を称さない。総時間とwriter時間を分け、前単位とsource/edgeの違いを性能改善と断定しない。
