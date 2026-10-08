# スキル再使用待ち・同じ行動の反復：要件候補 revision 2

状態: Step1 自己レビュー済み候補。未採用。revision1の通常policyの記述を訂正した後継候補。revision1の一次質問は本候補で置き換え、旧bytesへの回答を本候補の採用として流用しない。現行実装の存在や診断合格を仕様承認としない。

## 対象と目的

現在のskill-cooldown.test.ts元3ケースとbattle-engine.test.ts元46ケースのうち、受理済み数値契約を確認できなかった再使用待ちと反復ペナルティを正式に判断できるようにする。既存のAccepted要件・ADR0001/0021/0022、明示済みF-BTL-09の二回強制攻撃、F-BTL-30の必殺時刻などは維持する。これは新しいバランス調整の提案ではなく、現在動作をそのまま採用する候補である。入力比較資料は非規範的な packages/shared/src/skill-cooldown.ts と battle-engine.ts。過去に当該数値の有効な所有者承認があったかは未確認。

## 採用候補

1. スキルのpowerが有限でなければ1として扱う。powerを0.5〜2へ制限し、C = 1 + round(((power-0.5)/1.5)*8)を1〜9に制限した整数を再使用待ちにする。power0.5以下はC1、power1はC4、power2以上はC9。同一skillをTで成功使用したらcurrentTurn < T+C+1の間は再使用不可。例:T5/C1ならT6不可・T7可、T5/C4ならT6〜9不可・T10可。残りはmax(0,T+C+1-currentTurn)。履歴なし/非有限の前回時刻は待ちなし。別skillの待ちを変更せず、成功時刻をskill IDごとに記録する。
2. 反復回数は、そのsideの前回行動と今回の実効行動のkindとskillIdが等しければ前回回数+1、異なれば1。free_actionの説明文の差だけではこの判定を変えない。反対sideの回数は混ぜない。
3. basic_attack/skill/free_action/reflectを同じ種類で2回以上続けたとき、通常の行動消費とは別にstaminaを2追加消費し、4回以上は4追加消費する。残量を超えて追加消費しない。2回目は軽い息切れ、3回以上は同じ動きを読まれた旨のstatusを記録する。
4. 実効行動のdamage係数へ max(policy.repeatedActionDamageFloor, 1-(反復回数-policy.repeatedActionPenaltyStart+1)*0.1)を掛ける。開始回数未満は1。既存のpolicy境界と係数clampは維持する。currentBattlePacingPolicyの開始3回/下限0.7なら、3/4/5回目以降の反復倍率は0.9/0.8/0.7。現在の通常試合作成はLOCAL_TWELVE_TURN_PACING_CANDIDATEを束縛しており、その開始4回/下限0.9なら4回目以降は0.9で下限に達する。保存済みpolicyの値をそのまま計算に使い、この候補で作成selectorやpolicyの値を変更・採用しない。名前がLOCALでも実接続が通常作成にある事実を保持する。12turn policyの全数値と自動回復の採用根拠は別途未解決で、この候補の承認から補わない。

## 境界と互換性

型/schema/保存済みasset revision/戦闘のbinding ID/公開APIの名称を変更しない。現行battle-engine-v1の既存実装を文書化する候補で、コード・データ・policy切替・世代移行をこの候補で実行しない。実装と候補が矛盾したら採用を推定せず差し戻す。既存Accepted契約を上書きしない。履歴の承認日や完走結果を再解釈しない。有料LLM、公開配備、戦闘の実施、既存試合の処分は対象外。

## 選択肢とリスク

A: 上記現在動作を採用する。現状の再使用待ち・反復疲労を保つ。高powerのskillは9turn待ち、free_action/reflectの反復も疲労対象、反復判定は説明文を見ない点を明示して受け入れる必要がある。
B: 数式/適用対象を変える要件候補へ戻す。戦闘の選択肢・疲労・進行・履歴継続へ影響するため、別revisionで互換性を定める。今回の旧assertionを削除して解決した扱いにしない。
C: 採用を見送る。元テストを残し未封印で停止するため全体合格は未達のままになる。

## 受入条件と独立レビュー入力

exact本候補・既存Accepted契約・上記2実装・元49ケースを比較する。レビューでは①現在動作との数式/時刻/対象の一致、②旧Accepted契約との矛盾、③既存policy/bindingを黙って移行していないこと、④削除/skipせず全ケースを成立させる次工程を確認する。新規の最適バランス/LLM品質/他policy全数値採用を条件に追加しない。

まず所有者の一次レビューでREVISE、REVIEW_THEN_REVISE、REVIEW_THEN_DECIDEまたはREVIEWの経路を選ぶ。REVIEWなら本bytesを変更せず独立レビューし、二次所有者判断へ戻す。一次レビューだけでは採用/ADR/Seal/実装を許可したと扱わない。
