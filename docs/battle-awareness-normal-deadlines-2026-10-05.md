# 新規通常試合の待機期限

ユーザーの2026-10-05「待機期限を十分な時間に調整してください」に基づき、[ADR0054](adr/0054-normal-awareness-waiting-deadlines.md)を実装した。対象は新規通常試合の意識パイプライン awareness-v5。試合束縛形式 v5や出力契約 awareness-output-v1、モデルは変更しない。

|対象|旧ポリシー awareness-v5-usage-v1|新ポリシー awareness-v5-usage-v2|
|---|---:|---:|
|潜在意識 Luna none|5秒|60秒|
|顕在意識 Grok|15秒|90秒|
|裁定・遭遇生成 Grok|10秒|60秒|
|実況 Grok|15秒|60秒|
|試合全体|180秒|600秒|
|実況公開|36秒|180秒|
|終端での実況待ち|15秒|90秒|

初期化時に新ポリシーをmanifest/runtimeへ保存し、実行時はその保存済みポリシーをrender、admission証明、潜在・顕在のprovider送信へ同じ値として渡す。実況は既に保存済みポリシーを最終引数で受け取る。新規provider構成の既定も新ポリシーにするが、既存試合のrole呼出しは古い保存済みポリシーを明示して新しい既定値を上書きする。

旧 certified trial-v1 / observed usage-v1 / isolated measurement-v1 の値と検証schemaは保持する。既存試合や明示的な旧試行candidateのpolicy/hashは移行しない。36tick・物理試行200・並列6・生成token上限・再考間隔・自動retry/fallbackなし・費用不明の扱いは維持する。物理終了不明がdeadline後にも残った際の3tick/5秒判定は、通常応答を待つdeadlineとは別の既存の保守的な終了条件であり変更しない。

実測に対する余裕として採用した有限の期限であり、全呼出しの成功や36tick完走を保証する統計値ではない。追加の有料呼出し、公開環境への適用、既存DBの書換えは行っていない。

要件: 所有者の待機延長指示、既存試合の不変束縛、実利用会計（ADR0051）。基本設計: 新しい通常ポリシー、保存済み値を各roleへ伝播。詳細設計: strict schemaはrevisionごとの値を保持し、model portに任意のinvocation policyを追加する。実装: awareness-policy/provider/factory/battle-service。検証: 新規既定の実保存と実SDK経路をテスト用HTTP応答で確認し、providerが旧値で作られていても新試合の保存値を適用すること、逆に新providerでも旧試合の5/15秒を適用することを確認する。

検証完了: 関連18件、通常全体テスト211件、全workspace型チェック、全workspaceビルドが成功。実LLMへの追加送信はなし。ビルドには既存のfrontend chunkサイズ警告が残る。

PERT `normal-waiting-deadlines` は完了、残内部作業0時間。観測区間は 2026-10-05T11:08:27+00:00 から 2026-10-05T11:16:45+00:00、単一実行者の開始から終了まで 0.138人時。親の実モデル完走検証は別の未完了作業として保持する。

検証範囲補足: 通常全体テスト211件はauthority selectorの選択37ファイルが対象であり、awareness関連群はunsealedとして除外されていた。関連18件の直接成功と期限伝播の確認は別に記録している。通常テスト成功だけでは新パイプライン全体やprompt意味整合性の確認にならない。[追加プロンプト点検](battle-awareness-prompt-inspection-2026-10-05.md)を参照。
