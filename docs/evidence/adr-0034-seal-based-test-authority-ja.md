# ADR-0034 revision 1 日本語レビュー用全文

- 正本: `docs/adr/0034-seal-based-test-authority.think`
- 人間向け英語投影: `docs/adr/0034-seal-based-test-authority.md`
- 状態: Accepted
- 日付: 2026-09-16
- 決定者: Product owner

## 文脈

現在のテスト選択処理は、SealGraph の verification REF が登録された限定的な
テストと、それ以外のテストを区別しています。登録済みテストについては、REF
やソース束縛がない場合、作業ファイルが Seal 済み内容と異なる場合、または
verification の依存経路が stale の場合に無効化します。一方、登録外のテストは
`ungoverned` として実行し、「SealGraph 上の有効性根拠ではない」と警告するだけです。

これは今回確認された方針を満たしません。Seal のないテストには適切な根拠が
示されていません。Seal のあるテストも、その Seal と Cause Link が特定する厳密な
根拠に対してのみ証拠となります。その根拠が後に stale になったり、新しい revision
へ進んだりした場合、古いテストは新しい根拠に対する現行証拠ではありません。ただし、
不変な古い verification Seal は、もともとの根拠に対する歴史的証拠として残ります。

## 判断を分ける要点

- 未 Seal テストを、全体の緑のテスト結果の中で権威ある現行証拠に見せないこと。
- 上流の根拠から下流の verification へ向かう権威方向を維持すること。
- 上流の進行を検出しつつ、過去の証拠を破壊しないこと。
- テストファイルは、今後の根拠付け、修正、診断利用のために残すこと。

## 検討した選択肢

1. 未 Seal テストを権威ある全体テストで実行し続け、非統制だと警告する。この案は
   幅広い実行を維持できますが、根拠のない結果と現行根拠を一つの pass/fail に混ぜます。
2. verification Seal が一度あれば永久に現行とする。この案はテスト集合を安定させますが、
   古い根拠向けのテストを新しい根拠の検証として扱ってしまいます。
3. 正確なソースに束縛され、明示的な Cause Link を持つ verification Seal を必須とし、
   評価対象の主張に対して依存経路が現行であることも必須にする。これを提案します。

## 決定案

テストが現在の主張に対する有効な証拠となるのは、次のすべてを満たす場合だけです。

1. テストが既存の `verification/*` REF に対応付けられている。
2. REF の HEAD Seal が、そのテストファイルそのものにローカルでソース束縛されている。
3. 作業ファイルのバイト列が verification Seal の内容と一致している。
4. verification Seal が、根拠先を特定する明示的な Cause Link を少なくとも一つ持つ。
5. verification Seal と必要なすべての Cause 経路が、評価対象の主張に関係する現在の
   REF HEAD に対して stale ではない。

一つでも欠ける場合、そのテストを権威あるリポジトリテスト選択から無効化します。
テストファイルは削除しません。明示的に「非権威的な診断」とした調査では実行できますが、
その結果を現在の pass/fail 根拠として引用してはいけません。

Cause が stale になった場合、またはその REF が先の revision へ進んだ場合、verification
は新しい根拠へ自動的に持ち越されません。不変な古い verification Seal は、厳密な元の
Cause 世代に対する歴史的証拠として有効なまま残り、書き換えも削除もしません。新しい
現行主張には、該当する根拠をレビューし、その根拠に対する新しい下流 verification Seal
を作る必要があります。

この判断は、正確な ADR-0034 revision 1 として受理されました。

## 帰結

### 良い点

- 権威ある全体結果には、明示的かつ現行の根拠を持つテストだけが含まれます。
- 合格テストが、後から進んだ requirement、design、implementation の権威を暗黙に
  引き継ぐことを防げます。
- 歴史的証拠は、元の不変 Seal で引き続き調査できます。

### 不利な点とリスク

- 既存テストの多くは、根拠をレビューして Seal するまで無効になります。これは現行の
  権威あるカバレッジを減らしますが、存在しないカバレッジを装うことはしません。
- 未 Seal テストを調査に使う場合は、明示的な診断コマンドが必要です。
- Cause をレビューせず機械的に Seal を量産すると、構文だけ満たして意味上の権威を
  満たしません。そのため再 Seal は別の根拠付き操作として扱います。

## 互換性と移行

テストファイルも歴史的 Seal も移行・削除しません。変更対象は権威ある選択処理です。
inventory 未登録を、従来の active `ungoverned` から disabled `unsealed` に変えます。
既存の source-diverged と stale のテストは無効のままです。現在有効とされている既存の
verification Seal も、明示的な Cause Link がある場合に限って有効です。

## 検証

- 未登録テストが `unsealed` として無効になることを回帰テストで確認する。
- Cause Link のない Seal 済みテストが `missing_basis` として無効になることを確認する。
- 既存のソース束縛違い、ソース差分、direct/transitive stale の確認を維持する。
- inventory の読み戻しで、全発見テストが「現行証拠」または具体的理由付きの「無効」の
  どちらかに分類されることを確認する。
- 選択処理自身の回帰テストをこの受理済み判断の下流にソース束縛・Seal してから、
  その結果を現行証拠として引用する。

## 実装参照

- `scripts/test-authority.mjs`
- `scripts/test-authority.test.mjs`
- `scripts/test-authority-inventory.json`
- `docs/evidence/test-authority-v2-action-plan-2026-09-16.think`

## レビューと受理

2026-09-16、正確な ADR-0034 revision 1 とこの完全な日本語レビュー用全文を提示した直後、
Product owner は `ACCEPTします。計画を再検討` と回答しました。レビュー対象だった受理前の
正本 `.think` の SHA-256 は
`8602baf182a786e28d16a87c4cce707bc3b904a746e0b668851587ada65ebbdc` です。

選択処理の実装前に計画を再検討します。この受理は、一括再 Seal、commit、push、provider
call、deployment、migration、activation、production change を許可しません。
