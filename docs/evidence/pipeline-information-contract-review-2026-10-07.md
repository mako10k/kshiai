# 情報伝達契約照合の独立レビュー

対象：`docs/pipeline-information-contract-comparison-2026-10-07.md`。実施者：独立agent conscious_effectiveness_review。読取のみ。今回の課題に効果的な次の手かを評価し、後続の詳細設計を現在のblocking事項にしない。

コード照合で、動的指針のmetadata保持、旧consumerのoverlay、新awareness frameでの非転送、静的context構築を確認した。既存投影の明示受領と、該当なし/転送欠落を区別する契約・統合試験を支持。

推奨順序：開示可能な非空適用指針のfixture→上流義務と詳細設計対応→実promptまでの通過と非該当/非開示対照→接続除去時の局所および正式CI失敗確認。全roleを同時に是正するより、指針一経路を先に閉じる。

完了条件：正式CIで通常実行され、情報転送を除去すると失敗すること。登録や局所成功だけで達成としない。会話保持・圧縮・aware coreNeeds投影は別の調査/設計対象。単調化の根本原因は未確定。重大な境界争議なし。
