# 目標判断基準の訂正 — 2026-09-09

## 今回のowner指示（現行基準）

> ADR-0028 は訂正または supersede ですね。
>
> 作者が確認した目標かどうかは問題ない。
> 単に、キャラ性格と相手などの関係性から、正当な目標かどうかがポイントです。

この指示は作者由来の証明ではなく、性格・価値観・認知済み関係・状況との意味的妥当性を基準にする。
明示した／確認したというだけで目標に優先権を付けず、生成されたというだけで排除しない。
禁止規範・engine裁定、既存snapshot、心理と顕在意識の責務分離は変更対象ではない。

## 訂正前と原因

旧要件revision 1 R1は「作者の明示defaultObjectiveは拘束条件」としていた。
ADR-0028 revision 1 D1はさらに作者確認済み出典、CharacterGenerationEnvelopeV3、
agencyObjectiveV1/objectiveAuthority、出典不明時の開始拒否を追加した。
原因はキャラにとっての目標の妥当性を作者確認という権限問題に置換したこと。
設定と補完の区別だった、と後から過去の意図を説明し直した点も不正確だった。
後者は解釈の変更であり、元から同じ意味だったとは記録しない。

AntiPattern確認: 出典の曖昧さから作者再確認・開始停止まで必要と推論した制御の過剰化
（AP-007）。説明時に後の解釈を元の理由へ遡及した事後的な正当化（AP-004）。
監査の無警告やレビュー不足を、この意味の置換を生んだ根本原因とはしない。

## 原資料の処置とauthority

- 要件v1 SHA256 f733f85a153349e4be28785fef05d93006d057e0e5d507a8423b658f9bb7f444、
  旧レビュー・旧承認は正確な履歴として変更しない。
- ただしR1の作者明示優先とその派生制御は今回のowner指示により現行基準から撤回。
  旧承認を根拠にそれらを実装してはならない。
- [要件v2](../character-agency-requirements-v2.md)は改訂候補step 1。
  SHA256 5a30f561ff4ffdbbcc51ec41e4cc6e989191f51ab191f92f8f94c1c4c3bfda76。
  旧レビュー・受入は新版に継承しない。
- ADR-0028はProposedなので同番号のrevision 2に訂正。Accepted ADRのSupersedeは不要。
  revision 1の旧Seal d56356883a1c8e8dfa43345db82c3dbf64d80a3dc650d33c37af80cd71686720を保存。
- 現行要件候補とADR案は今回の指示に沿うが、文書全体をAcceptedにしたとは扱わない。
  要件候補のowner reviewとADRの正確な版の承認前にruntimeを実装しない。

## 関連範囲の是正

ADR D1だけでなく、authority、入力goalPolicy、facts種別、privacy記述、
キャラenvelope／UI追加、移行拒否、検証fixture、実装見積り、要件R1/AC1、
実装計画・責務設計・backlog・PERT・ADR索引まで同じ前提の影響を確認して訂正する。
新規の一般ルールや別の審査LLMを追加しない。目標妥当性の失敗を具体fixtureで検証する。

作者確認だけが異なる同内容では許容目標集合が同じ、性格・関係が異なれば
適切な集合が変わることを検証計画へ記載。これは未実行の品質検証である。
Schema/ref検証だけでは意味的妥当性を証明しない。

## 検証境界

CLI判断監査: agency-goal-criterion-correction-2026-09-09、fatal/error/warning=0、hint=4。
hintは共通根拠・判断の近接・書式であり、D1の履歴処置とD2の基準訂正を区別して保持。
ADR revision 2のCLI監査はfatal/error/warning=0、info=1（承認未了）、hint=37。
旧版監査JSONと検証メモは歴史資料で、今回の結果には転用しない。
変更前ADR impactは投影・索引・実装計画・責務設計・backlog・PERTの6参照。
本文確認・個別reseal後の結果は別readback JSONへ記録する。

runtime・課金・設定・キャラ・commit/pushは変更しない。
