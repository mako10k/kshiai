# V2キャラ更新廃止の完了照合

対象は通常のV2キャラ新規作成・更新の廃止と、現在／旧リビジョンの閲覧維持。明示的なV3移行、既存戦闘の記録更新、隔離された履歴fixtureはAccepted ADR0043の区別を維持する。

| 要件 | 現在の根拠 | 判定 |
| --- | --- | --- |
| 通常のV2新規作成を廃止 | focused V3生成に限定、provider不在は409。saveSheet／generic generation repositoryはV2作成を拒否。boundary testsはDB行不変を検査 | 適合 |
| V2を通常更新対象にできない | chat、visibility、restore、image、toggle、copy、improvement、deleteを409で拒否。保存済みV2候補確定／偽装された世代IDの有効化も拒否 | 適合 |
| 潜在的なV2実行経路も閉じる | provider candidate builder、portrait/toggle/restore直接呼出は処理前に拒否。queue/retry/backfillと中央保存境界の独立棚卸済み | 適合 |
| V2閲覧を維持 | current GET、戦闘に固定された旧snapshot、所有者／戦闘認可、現在V3に変更後も旧V2固定表示を回帰検査。所有者が「みき」と旧対戦リンクを確認済み | 適合 |
| 履歴画面からの実導線 | HistoryPageの明示的なキャラ名リンクはbattleIdを渡す。戦闘自体が開けない場合も独立して開ける。所有者「開けました」 | 適合 |
| 移行例外はV3のみ | V2入力からV3候補／有効化を検証。自動移行未提供環境はupgradeAction=null、操作ボタンを出さない。移行処理は今回未実行 | 適合 |
| origin PUSHとCI | fce86a5のorigin SHA一致、CI36997454018の4 job成功。証跡コミットは別途SHA／CIを読戻す | 製品source適合、証跡同期待ち |
| 必要な公開／previewデプロイ | fce86a5固定digest、Cloud Run public100%／両tagが新revision、Worker84fc100%、両origin9assets一致、API200、認証設定完全一致 | 適合 |

検査は現行の権威を持つ260件、typecheck、staticが成功。旧V2成功を要求するdisabled/unsealedテストは、現在の受入基準として扱わない。公開DBに破壊的な更新リクエストを実行する代わりに、実装された拒否経路とDB行不変を隔離テストで検査し、そのsourceと稼働imageの一致を確認した。

公開切替後に503を観測した。生成条件はサービスのmanual0と通常traffic割当の組合せ、triggerはpublic100%割当、検出不足はtag-onlyプレビューとtemplateのみの照合。automaticへの1回変更後、template／revision／traffic不変、public／preview200を別々に確認した。今後の切替ゲートはservice-level scalingと実効割当を必須にする。詳細は同日のpublic-result JSONとrecovery DSL／auditにある。

機能上の残作業は0分。より広いキャラV3機能の親ゴールcsm001／cm114は完了としない。canonical PERTのfollow-on提案はowner-controlledで未適用、推定値を実績・所有者承認に置き換えていない。今回は親計画の受入完了や自動移行の提供、旧戦闘本体の全再生を主張しない。
