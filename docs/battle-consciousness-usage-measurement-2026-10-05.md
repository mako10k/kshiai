# 意識パイプライン awareness-v5：実利用計測の要件・設計

## 要件と権限

所有者の2026-10-05指示とAccepted ADR0051に従う。新規試合は試行運用ポリシー awareness-v5-usage-v1を束縛し、事前の料金証明がなくても起動する。実利用tokenと費用の計測経路を完成させる。旧切替試行の契約改訂は保留。有料試行・配備・既存試合の移行は範囲外。

## 基本設計

SDKの物理送信境界がusage ledgerへ開始・完了を記録する。ledgerは試合作成前にも使えるFK-freeのappend identityを持ち、token・provider metadataのみ保存する。ドメイン側はAsyncLocalStorageの狭いscope portでbattle/role/side/tick/receiptを付与する。コストreportはledgerのread modelと外部price tableだけに依存し、世界状態・判断・実況を変更しない。

## 詳細設計

各物理試行はcall IDとattempt ordinalで一意。送信前開始recordを書き、成功・HTTP失敗・timeoutを終端recordにする。usageはprovider原文を保持し、prompt/completion/total/cache/reasoningをnullableで検証する。completion内のreasoningを二重加算しない。parse failureでもusage保存は残す。取得不能usageを0へ補完しない。

新しいadmissionは certified と observed の判別unionにする。observedではfull prompt digest/output limitを固定し、事前input token/最大料金をnullとして表現する。未知の最大料金reservationもnullで持ち、known subtotalとunknown IDsを区別する。時間・同時数・物理attempt・出力上限は従来通り強制する。既に束縛されたcertified policyは証明がない場合拒否する。

価格表はprovider/model/revisionとinput/cache/output各単価を持つ。実usageに単価を適用した推定額と、未取得usage・単価なし・計算不可能の件数を返す。部分的既知費用を完全な試合総額に見せない。単価は捏造せずreport入力で指定し、観測原本は変更しない。

## 検証

SDK偽HTTPでsuccess/error/missing usage/invalid JSON/retryを確認。一時DBの再読込、試合作成前と実況のscope、遅着usage、未知費用、旧証明policy、新規observed policyを検証。実モデルの自然さ・実費はこのテストでは確認しない。
