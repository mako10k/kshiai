# 候補整理・スクロールのテスト因果契約

全テストの因果整理・成立・Seal指示の範囲で、既存2ファイル8件をコード・assertionの変更なしで検証する。

## 要件対応と先行点検の補正

requirements F-MTCH-07は、対戦セットアップの候補を種類ごとの最近使用順で表示し、名前・タグ・説明から検索できることを明記する。先行の独立点検ではF-UI-03のみが参照され、この条項が点検結果に含まれていなかった。今回、現行requirements.mdの§4.3を読み直し、最近順・種類別履歴・検索について根拠を確認した。原点検は履歴として残し、この確認を追記する。

match-selection-preferences.test.tsの3件は、記録されたusageから最近使用順と未使用候補の安定順を得ること、mine/opponentの履歴独立、複数の検索対象で大文字小文字・全半角・かなの差を吸収する検索を検証する。文字正規化方式はF-MTCH-07を満たす既存実装上の選択であり、要件がNFKC等の方式を指定したと偽らない。保存件数上限100、localStorage連携、全selector種類、実際の候補画面はこの3件だけでは検証しない。

Accepted ADR0015 Decision #10は、下部ナビゲーションを除いたusable viewportの検証を要求する。battle-scroll.test.tsの5件は、最新位置の判定でbottomInsetとscrollportBottomを考慮すること、最新位置より下へ移動した場合の追随状態、下部insetを除いて最新位置へスクロールする座標を確認する。既存の60秒待機・48px許容値と毎回の待機延長は実装回帰として保持する。上位ADRがこの数値を定めたとは扱わず、今回新たな時間・閾値の規則を制定しない。

## 検証と境界

Node22で2ファイル全件を実行する。frontendのimport形式に合わせてESNext/Bundlerでstrict型検査する。型検査を緩和するものではない。

純粋関数への入力fixtureの検証のみ。MatchPageとBattlePageでの利用箇所は読み取り確認済みだが、browser操作、DOM実測、timer動作、保存/再読み込み、認証、API、配備の合格には代えない。ADR0015全体のPlaywright受入完了も宣言しない。

既存8ケースとすべてのassertionを保持する。Sealはsource bytes・exact parent Seal IDs・読み戻し・fsckを確認する。未Sealがある正式全体テストは実行前に停止する。
