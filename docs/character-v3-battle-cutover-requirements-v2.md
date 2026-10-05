# V3新規対戦切替 — 要件候補 revision 2

- 状態: Accepted（[cc319所有者受入記録](evidence/cc319-owner-acceptance-2026-09-29.md)）
- 日付: 2026-09-29
- 決定者: プロダクトオーナー
- 前版: [revision 1](character-v3-battle-cutover-requirements-v1.md)
- 変更: 既決の物理削除を確定した前提として記述し、受入単位と残作業を整理。商品上の選択を再募集するものではない。

## 決定済みの到達条件

**R1 参加資格。** 新規対戦の両者は、アクセス可能なcurrentの不変V3 generationで、実経路の必須consumer集合 `battle-mechanics@3` を満たす。自キャラ一覧、相手候補、random/auto、直接APIは同じ参加資格を使う。V2は所有者の管理・後続移行の対象として扱う。

**R2 不変の根拠。** 新規対戦は両者のexact generation ID、digest、対戦用snapshot、compiler identityを作成時に固定する。以後の進行・再送・再読込・実況・表示はその根拠を使う。battle manifestの版とcharacter definitionの版は独立して識別する。戦場・実況スタイル・ルール等の既存の固定義務はAccepted ADR-0010を継承する。

**R3 未完了旧対戦の物理削除。** 切替時点に保存されている対戦のうち、切替前作成かつ `finished` 以外の全件を物理削除する。キャラクター版・manifestの有無にかかわらず同じ集合を使う。切替後は一覧から消え、個別取得・進行・HTTP/state再送・workerの遅延処理はいずれも、その対戦の終了した利用可能性を扱う。旧対戦の継続用データ補完に代わり、削除と再作成防止を検証する。

**R4 完了履歴。** `finished` の既存対戦は、記録済みの世代・snapshot・結果を保持し、既存の履歴として読む。歴史的に記録がないidentityはunknownのまま示す。記録内容が示す意味を維持する。キャラクターgenerationそのものの保持も継続する。

**R5 切替と証拠。** V3-only利用開始に先立ち、対象集合・関連データ・回復可能性を確認し、削除の読戻しを完了する。V3同士の完走、V2を含む新規要求の扱い、全再送経路、完了履歴の可読性を実経路で確認する。ローカル、Stage、productionを個別の適用範囲とし、それぞれに正確な対象・実行権限・読戻しを記録する。

## 継承する登録・移行の条件

Neva/Rioの正式登録には Accepted [V3 authoring revision 5](character-v3-authoring-requirements-v5.md) R18の候補レビュー・所有者確定・原子的append/CASを使う。前回のローカル直接登録は試験素材として利用し、残る登録経路をvt109で完成させる。

最終プログラムの複雑さを最小にする。旧完了履歴のデータ移行が必要になる場合、その実作業はADR-0038側を含む同一の合計30分枠で計測し、超過が見込まれた時点で、削除等の具体案を対象・失われる情報・回復方法とともに所有者へ示す。R4の履歴を削除する採否は、その時の所有者判断として記録する。旧・未完了対戦はR3の削除対象である。

## 要件から設計・適用へ渡すもの

[ADR-0039](adr/0039-v3-battle-lifecycle-and-cutover.md) と[基本・詳細設計revision 2](battle-lifecycle-boundary-design-v2.md)が、責務、削除済みIDの最小記録、transaction、再送、停止切替を具体化する。正確なStage対象件数、release、停止時間と回復確認はvt104/vt108で記録する。今回の候補作成は対戦データ操作の実行記録とは別に扱う。
