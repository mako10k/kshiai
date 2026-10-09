# 実況クライアントのテスト因果契約

ユーザーが承認した全テストの因果整理・Sealの範囲で、次の既存2ファイルをそのまま検証する。新しいプロダクト規則、コード変更、公開反映は含めない。

## 上位契約

- Accepted ADR0006 Decision: 公開実況は受領IDで識別し、終端snapshotで置換し、at-least-once配信のevent IDを重複排除する。戦闘内のsequence順序を保つ。
- 同ADR Consequences / Compatibility: queued・generating表示から完成したブロックへ移る。既存embedded logの読み取りは残す。
- requirements F-UI-04: 実況の表示。F-UI-08: ローディングとエラー等の明示。
- battle-narration-stream-design.md Frontend state machine: receipt単位のブロック、sequence順序、queued/generating/completed/failed。旧ADR0005は直接のAccepted根拠にしない。

## ケース対応

battle-narration.test.tsの既存2件は、同じreceiptのcompleted置換、同じeventの重複排除、逆順到着したreceiptのsequence整列を検証する。

battle-screen.test.tsの既存4件は、実況entryがある場合の表示源の選択、entryがない場合だけの旧snapshot log表示、generatingの空ブロックと待機文言、停止・処理中・通常進行・失敗の状態文言を検証する。日本語文言や見出しの文字列は既存表示の回帰検査であり、上位契約に新しい文言規則を追加するものではない。

## 証拠の境界

入力済み公開DTOを受け取る純粋関数の6件だけをSealする。公開DTO生成、認証、DB永続化、SSE再接続、reset配線、React描画、ブラウザ操作、現在の全戦闘パイプラインの受入を証明するものではない。旧logのfallbackを最新実況の生成源として認めるものではない。

2ファイルをNode22で実行し、strict型検査を行う。全ケースとassertionを残す。Sealのsource bytes、親Seal ID、読み戻し、fsckを確認し、未Sealが残れば正式な全体実行を停止する。
