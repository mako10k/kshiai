# 実LLM検証結果 — 初回スキーマ拒否

2026-09-10 / semantic-migration-grok-2026-09-10-v1 / 承認済みの1回を消費。
準備証跡a724ae39、実装スナップショット502b5ea1を変更せず実行した。

## 結論

**移行品質は未評価。初回の構造化出力スキーマがAPIで拒否された。**
実行したのは1要求で、再送・修正・レビュー要求は0件。改善／改善なしを判定できない。
HTTP 400の本文は次のとおり。

> Unsupported response format. Self referenced definition are not supported.

日本語訳：対応していない応答形式です。自己参照する定義には対応していません。

## RCA

C-PROBE-002（高信頼）は、HTTP応答（E1）、送信済みJSON Schema（E2）、
共有型とプロンプト・送信コード（E3）に基づく。
result-rca.thinkのCLI LLMThink監査はfatal/error/warning=0。

- 根本原因：内部用の汎用JSON再帰型を、そのまま外部providerのstrict-output文法に使用した接続設計。
  CharacterMigrationJsonSchemaは配列要素・オブジェクト値に自身を許す。
  操作valueがその型を参照し、zodResponseFormatの生成結果にも自己参照が残った。
  probeはそれをstrict=trueで送った。内部の再帰型そのものが誤りなのではなく、
  このprovider境界で対応文法へ変換せず同じスキーマを利用したことが不整合である。
- 寄与条件：汎用の操作valueを共通の1型で表現し、変換結果をそのままproviderへ渡す構成。
- 検出経緯：ローカルのHTTPテストダブルはxAIのスキーマ制限を検査していない。
  これがローカル成功と実API拒否が両立する理由であり、欠陥を作った根本原因ではない。
  実API受理は準備レビューでも未確認として開示していた。
- 是正候補（未実施）：許可された移行先の型から、providerで表現可能な非再帰の出力用スキーマを導出する。
  内部値はTypeScriptの型のまま扱い、サーバー側の全体検証を維持する。
- 再発検出候補（未実施）：出力用スキーマのprovider文法制約を回帰検査する。
  検査の追加だけで、境界の不整合が直ったことにはしない。

自己参照以外に未対応の構文がないとは確認できていない。
JSON文字列化やjson_objectへの緩和は別の設計選択であり、自動的に採用しない。
モデルの意味判断、トークン不足、生成内容を今回の原因とする証拠はない。

## 実行・保全

- 記録済み要求数：1。HTTP応答あり。生成結果・usageは返されていない。
- B4状態：pending、terminal receiptなし。HTTP拒否自体は既知だが、会計は不明。
- 費用：実usage・実費用ともに不明。0 USDとは断定しない。
  送信前予約0.17413625 USDは保守的な見積りであり、実課金ではない。
- 合成SQLite：/tmp/kshiai-semantic-probe-Me4suO/probe.sqlite。削除せず調査用に保持。
- 現在世代は前後で同一、activated=false。本番DB・本番キャラへの操作なし。
- live-startが残り、同一runの再実行は禁止。成功風の終了コードではなく、
  live-resultのpendingとHTTP 400を結果として扱う。

証跡：acceptance-ja.md、execution-acceptance.think、live-start.json、
call-1-before.json、call-1-response.json、live-result.json、result-rca.think。
既存のowner-review-ja.mdは実行前の提示履歴として保持する。
A（実行済み）は承認された1回の検証と結果保全のみ。修正・追加実行・本番反映は未実施。
