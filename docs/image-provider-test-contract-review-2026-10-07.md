# 画像Provider境界のテスト契約 — 2026-10-07

全テストの因果関係整理・封印の範囲で、F-CFG-07とrequirements.mdのImageProvider経由規則（391行付近）を根拠にする。画像生成とテキスト生成の独立、画像Providerの優先順、既存のImageGenerationResult.sourceUrl:string契約を扱う。新しいProvider選択・quota運用規則は採用しない。

## 発生条件と修正

成功JSONの型アサーションにより、data[0].url=123からsourceUrl:numberが返ることをローカルの注入fetchで再現した。成功した2ケースは正しい文字列を与えており、この条件を検出していなかった。

image-response.tsはJSONをunknownとして読み、record、data配列、先頭record、文字列URL/base64を確認してから型契約の結果を作る。HTTP adapterはリクエストとステータス処理に限定し、レスポンス解析・エラー診断を独立した純粋処理へ委譲する。修正経路の成功/エラーJSONの型アサーションを除去した。既存の正常URL/base64、moderation falseの拒否、HTTPエラー診断形式とraw500文字の保持、通常のProvider失敗後の順序fallbackを維持する。

## 原テストと追加回帰

元のopenai-compatible.test.tsの2ケースとassertionは、元ファイルの完全なprefixとして保持する。数値URL・object base64の拒否、正常base64とmoderation拒否、HTTPエラー3形式・raw500文字保持の3ケースを追加し、全5ケースが合格した。独立読み取りレビューと全ワークスペースの型チェックも合格。

根拠→設計→ImageProvider型契約→decoder/HTTP adapter/fallback→全テストファイルを結ぶ。型・実装に不変のsource hashを束縛し、通常Sealと読み戻しで確認する。原2ケースからtrim・HTTP path/headerを検証したとは主張しない。base64内容の真正性、quota休止、実Provider互換性、画像品質・共有保存や公開環境の成功は対象外。全251ファイルの目標は未完了。
