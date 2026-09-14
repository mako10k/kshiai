# 要件revision 2 — owner review入力

状態: requirement-authority-review step 1。レビュー経路未選択。独立レビュー未実施。

対象: docs/character-agency-requirements-v2.md
SHA256: 5a30f561ff4ffdbbcc51ec41e4cc6e989191f51ab191f92f8f94c1c4c3bfda76

出典は2026-09-09 ownerによる目標判断基準の訂正。
docs/evidence/agency-goal-criterion-correction-2026-09-09.mdに原文と旧authorityの処置を記録した。
旧v1レビュー・承認は履歴であり、この変更snapshotへの受入ではない。

変更対象: R1、目標入力、AC1。性格・価値・既知関係・状況による目標の妥当性を重視し、
作者確認・明示指定・LLM生成といった出典で優先／拒否しない。
旧R2/R3、状態・phase・無追加call・旧V1/V2互換、禁止規範とengine裁定は維持する。
新キャラenvelope・作者再確認・出典不明時の開始拒否は初回要件に含めない。

確認する問い:
1. 作者確認の有無に意味的妥当性を置き換える規則が残っていないか。
2. 性格・関係からの目標の導出と、通常の勝利、既存の禁止規範の区別は一貫するか。
3. 同じ内容で出典だけを変える場合と、性格・関係を変える場合をAC1/F01/F02で識別できるか。
4. 既存の状態・呼出し・互換範囲を維持し、新しいcriticやUIを隠れて追加していないか。

未知: 実LLMの意味的妥当性、上限内での品質は未検証。スキーマ成功を品質成功にしない。
追加の詳細設計はProposed ADR-0028 revision 2であり、要件のauthorityではない。
次はownerがこのsnapshotと入力を確認してレビュー経路を選ぶ。経路を推測して実行しない。
