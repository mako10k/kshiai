# 再利用資産の公開範囲：要件候補 revision 1

状態: Step1自己レビュー済み候補、未採用。既存実装/診断合格はルールの所有者承認としない。

## 対象と既存契約

packages/shared/src/asset-visibility.test.ts元3ケースとbackend/src/repositories/asset-visibility.test.ts元1ケースの共通公開範囲規則を判断する。対象はキャラ・戦場・語りスタイル等の再利用資産を所有者以外の選択/参照候補へ出せるかであり、非公開の構造化定義やsourceを返す許可ではない。

Accepted ADR0010のready/compiler/disclosure条件、ADR0011の運用metadataと定義の分離、ADR0012/0013の公開projection、ADR0024の読み取りと生成/更新権限の分離、ADR0043のキャラクター定義v3更新境界、既存account/realm制限を維持する。これらは下記の正確なpublic/friends/private/default規則の承認とは扱わない。以前の数値ではない公開ルールの有効な承認は未確認。

非規範的比較資料は共有asset-visibility.ts、backendのasset-visibility.ts/friends.tsと元2テスト。既存コードは実現性と現在挙動の資料で、規範的な根拠ではない。

## 現在動作を維持する採用候補

1. 公開範囲はpublic（公開）/friends（フレンド）/private（非公開）。共有正規化関数に未指定・null・不明値が入った場合はpublicとする。例: undefinedと文字列secretはpublic。これが不明値を非公開へ閉じる挙動ではないことを明示して判断する。入口schemaの厳密検証は緩めない。
2. 所有者は自身の資産を参照できる。サーバーがsystem資産と判定したものもこの公開範囲filterでは通す。公開範囲がprivateでもこの2条件は優先する。system識別は既存サーバーmetadataに基づき、一般クライアントへ付与権限を広げない。backend現行filterはisSystem=trueまたはownerUserId=nullをsystemと判定する。
3. 他の閲覧者はpublicなら公開範囲filterを通る。privateなら、フレンドでも通さない。friendsなら所有者のフレンド一覧に閲覧者が含まれるときだけ通す。閲覧者が所有者を登録しただけでは通さず、相互登録を追加条件にしない。現在の有向friendshipを使う。
4. 同じ所有者のfriend判定は1回の一覧filter内でcacheできる。cacheは公開範囲の意味を変えず、別リクエストへの永続的な許可には使わない。
5. このfilterが通っても、既存のrealm、owner、ready generation、compiler対応、利用可能状態、disclosure-filtered公開projectionの条件を別途満たす必要がある。構造化定義/私的心理/sourceの公開、資産編集権限、フレンド一覧自体の公開を付与しない。

## 境界・互換性

この候補は現在ルールの採用判断で、コード、保存visibility、DB、API名、資産/試合のimmutable bindingを変更しない。unknown入力を通常APIが受理する契約へ広げない。元2wholefile4ケースを削除/skip/緩和しない。本番データ修復、フレンド登録、資産設定の一括変更、公開配備、旧切替試行復活は範囲外。

## 代案・リスク・未確定事項

A: 現在ルールを採用する。既存のpublic既定と有向フレンド公開を維持できる。不明値がmapperまで届いた場合はpublicとして扱うため、非公開を意図した不正値を公開寄りに解釈する余地がある。system判定metadataが誤っていればfilterを通る。既存入口検証と他の公開境界は維持するが、この候補で欠落データの意味を推測しない。
B: 不明値を拒否/非公開へ倒す、未指定だけpublicへ残す、system例外やフレンド方向を変える等の別revisionへ戻す。既存保存値・未指定の古い資産・候補一覧・機械試験に影響するため、移行と不明値の扱いを先に定める。現行assertionを消して成立した扱いにしない。
C: 見送る。元ケースを保持し未封印のままとする。

未確定: 過去の所有者承認、不明値が実際の通常入口へ届く経路の全網羅、旧欠落metadataの意図。正常fixtureや実装履歴から埋めない。

## 受入条件と独立レビュー入力

exact候補、上記Accepted境界、共有/DBfilter/friendsの実装、元2wholefile4ケースを比較する。①public/friends/private/未指定/不明値、②owner/system例外、③所有者→閲覧者のfriendship方向、④公開可能性とready/編集/disclosure権限を混ぜていないこと、⑤元ケースと旧bindingを保持した次工程を確認する。新しい共有制度や全APIの監査を追加受入条件にしない。

一次所有者レビューでREVISE、REVIEW_THEN_REVISE、REVIEW_THEN_DECIDEまたはREVIEWを選ぶ。REVIEWなら本bytesを変えず独立レビュー後に二次判断へ戻す。一次判断で採用/ADR/Seal/コード変更/外部実行を許可したとは扱わない。
