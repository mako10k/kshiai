# 戦闘意識パイプラインv2：経済性改訂のレビュー記録

この記録はv2時点の履歴。[運用契約具体化の後続記録](battle-consciousness-operating-policy-review-2026-10-05.md)を参照。

2026-10-05。対象は要件投影v2 U13、基本設計v2 §8・9・13–15、ADR0050 Proposed revision2 D07/D08。所有者の「LLMの経済性を意識した構成」に基づく設計改訂。Accepted化、実装、モデル実行、実費測定、配備、pushは行っていない。

## 改訂とレビュー境界

潜在を必要な知覚frameで更新し、顕在を再考が必要な時だけ起動する。反射・感情・感覚投影は同じcallにまとめる。自然文投影・入力準備・競合解決の追加LLMは置かない。入力・出力を短くし、役割ごとに品質を満たす最小model tierを比較する。実況は確定場面の集約候補とし、取消・repair・fallback・使用量不明もphysical dispatchの予算へ含める。

現在のレビューは、これらの基本責務・継続・情報境界との整合性と経済性評価の定義を対象とする。モデル名、料金、数値上限、品質の閾値、具体的な実装は後続比較と所有者判断の対象。経済性を理由に重要刺激を捨てたり、意味的反応をサーバー規則で代替したりしない。

同一rootのread-only reviewerは重大なINSIDE指摘なしと報告。潜在の意味判断をLLMへ残すこと、idleだけで顕在jobを再生成しないこと、古い結果不適用、取消費用保持、追加補助callなし、予算予約と品質・遅延・費用の同時比較を確認した。

BOUNDARY残件：実況集約は既存Accepted ADR0016／0006のBeat close・receipt単位公開との結合を変更し得る。基本設計Q07へ後継決定の対応付けを追記した。ADR0038はProposedのまま。レビュー結果は所有者受入ではない。

## 検証

- authoring rationaleのCLI DSL audit：fatal=0、error=0、warning=0、info=1、hint=12。
- ADR0050 revision2のCLI DSL audit：fatal=0、error=0、warning=0、info=1、hint=59。hintは意味的受入を供給しない。
- 仮定例の算術：callは120+40+10+60=230、50+12+10+15=87。仮費用は600、216。独立reviewでも一致。実際の料金、現行実測baseline、節約率の証明ではない。
- ローカルリンク、Markdown/.thinkのProposed状態と改訂番号、diff whitespaceを確認。文書のみの改訂につきruntime testは実行しない。
- 先行v1検証で全体ADR checkerは既存ADR0039のAccepted marker欠落を報告した。本改訂の障害と混同せず、既存Accepted文書は変更しない。

## 次の判断

設計改訂の残作業は0。Q01–Q08の所有者判断とモデル比較が残る。起動頻度、最長反応待ち、実況待ち、試合予算、予算不足時の有限終了を具体化した後、同じシナリオで反応品質・合流遅延・全attempt費用を比較する。実装開始や有料実験の承認にはならない。既存PERTへの変更候補は未適用で、今回も正準計画を変更していない。
