# 戦闘数値補正の要件候補 revision 1

状態：候補・未採用。対象は packages/shared/src/balance.test.ts の元4ケースを維持するための補正契約。実装が存在すること・過去のテスト合格は、下記数値の所有者採用を意味しない。

## 由来と境界

Accepted F-CHR02bの利益への代償、F-BTL02/03の機械的な数値決定、ADR0010/0011の不変定義とmechanics/文章の分離を維持する。structured-character-definition-designのcurrent balance validationは存在するが、以下の全数値を採用したexact記録は今回未確認。現行balance.ts SHA b4f9df44c30e9cedfb711b6113f19309fc60aae334f9a255dfca19c23bcf4723、元test SHA b1d5a5b57ac238f46f2a240fc7dd4a668e9a69ccab8678e0f0bfd4c3d1a3c09cを非規範的比較資料とする。

候補は既存補正helperの現在ルールを明文化する案である。通常試合のpacing policy選択・critical/決着圧力・cooldown/反復・自動回復・レーティングを採用しない。既存のfrozen世代/試合の数値を書き換えない。新provider呼出し・DB変更・配備も対象外。

## 提案ルール

### 能力値

不足値は既存defaultParametersで補い、下表のmin/maxに挟んだ値vを中心softに対して soft+(v-soft)×0.55 として四捨五入する。非有限値はsoftとする。これは一度の補正であり、繰返し補正の同値性は保証しない。

|項目|min|max|soft|
|---|---:|---:|---:|
|hp/maxHp|70|140|110|
|mp/maxMp|20|70|45|
|stamina/maxStamina|30|70|50|
|atk|6|20|14|
|def/spd/mag/res|6|20|13|
|focus|6|18|12|
|luck|4|18|12|

現在値hp/mp/staminaは補正後の対応max以内にする。max(atk,mag)≥16ならdef/res≤14。def/res両方≥16ならspd≤12、atk≤14。キャラ間勝率・公平性を保証する基準とはしない。

### 技と通常攻撃

技powerは非有限なら1、その後0.55〜1.85。効果deltaは整数化し、hp/mp/staminaと対応maxは±25、他は±10。非数値/ゼロ相当は0。正負の効果の絶対値合計が正でMP/STAコスト両方0なら代償が必要。power>1.6ならMP≥12/STA≥10、1.45<power≤1.6ならMP≥6/STA≥5（無料効果ありならSTA≥6）、power≤1.45で無料効果ありならSTA≥6。その他のコストは保持する。通常攻撃powerは0.55〜1（max値を対象にする場合上限0.7）、ゼロ/非数値相当は0.75から補正する。

### 装備

不在はnull。atk/def/mag bonusを整数化して−2〜6。atk≥5かつdef≥4ならdef=2、atk≥5かつmag≥4ならmag=2。装備効果は技と同じdelta補正。正のbonusと効果delta合計をPとする。P>0で負のbonus/deltaが一つもなければ、先頭3効果を保持してstamina −min(12,max(2,ceil(P/3)))を追加する。従って元の4件目以降の効果が除かれる場合がある。既存の負の代償があれば追加しない。

この自動代償は作者の文言を書き直さないが、数値効果は変わり得る。数値と説明の意味整合をこの4ケースで保証したとは扱わない。

### HPダメージ補正helper

rawDamageを整数化し最低1とする。skillPower>1.3では round(damage×(1−min(0.25,(power−1.3)×0.35)))。その値を max(8,round(targetMaxHp×0.26)) 以下に抑え、最低1で返す。

26%はこのhelper出力の上限であり、最終HP減少全体の上限ではない。現行engineはその後にapplyDecisivePressureを適用する。またmaxHpが小さいと最低上限8により26%より大きい値になり得る。候補はその後段政策を変更・採用しない。

### 文章と入力保存

balanceCharacterCombatFieldsはbasicAttack欠如を拒否し、上の各補正を組み合わせる。traits/narrativeBlurb/技・装備descriptionは入力のまま保持する。権威定義やfrozen snapshotをこのhelperの再実行で自動更新しない。

## 受入方法と代案

元4ケース・assertionを保持し、極端値補正、文章保持、helper出力26%（maxHp100の例）、無料状態技/有利装備の代償を検証する。全体の勝率・単調化防止・実モデル品質の保証は範囲外。追加の実測は別作業。代案は数値/代償を修正したrevision2、または数値契約を保留したまま元テストを未封印として保持すること。元ケースの削除やsubset合格への置換は行わない。

## 一次所有者確認と独立レビュー入力

このexact候補の数値をreviewへ進めるか、先に修正するか、保留するかを所有者が選択する。独立レビューは「元4ケースを規範的に成立させる次の手として有効か」「Accepted代償/定義不変/文章保持契約と矛盾しないか」「4効果目以降の削除や再補正による変化を採用するか」を中心にする。より良い手があれば任意/将来候補として分類し、勝率保証などを無断で追加しない。一次確認後の独立レビュー結果を再度所有者へ提示し、exact bytesの採用後にだけ下流契約を更新する。
