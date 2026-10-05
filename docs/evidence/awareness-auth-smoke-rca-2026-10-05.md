# 公開候補rc.4の認証検査と再開点

公式Stage [37313815167](https://github.com/mako10k/kshiai/actions/runs/37313815167) はCloud Run起動、receipt lifecycle、provider accounting、OIDC、Worker upload、edge/origin healthを通過した。認証検査ジョブ `kshiai-auth-smoke-clb96` は `CHARACTER_V3_WRITE_REQUIRED` で停止した。新規試合の有料モデル工程は未実行、公開へのpromotionも未実行である。公開APIの交通配分は既存 `kshiai-api-speech-9ce565d` の100%を維持していた。

## 原因と修正範囲

認証検査は保存済みV2キャラクターの読み取りと移行再開を確認する一時データを、V3専用の通常作成処理に渡していた。既存の認証検査テストでも同じエラーを再現した。通常writerの拒否は意図した契約であり、この検査用データの準備方法が拒否を生じさせていた。

一時キャラクターは既に検査内のSQLで作成・削除される。その同じ隔離された一時IDに、型付きのV2 generationとcurrent pointerをSQLで準備する。canonical contentとdigestを通常の共通関数で生成し、V3 appendは通常writerを使用する。既存cleanupは両asset tableを削除する。一般のV2書き込み制限と、運用スクリプトからtest-only helperを参照しない境界を維持する。

既存認証検査とwriter境界テストの15件が修正後に成功した。全体テスト201件、追加後のawarenessテスト275件、型検査、静的検査も成功した。これらをawareness CI対象に追加し、検査データ経路と通常writer拒否の双方を継続確認する。旧V3切替試行の保留範囲は変更しない。通常persistent battle E2Eの独立した読み取り点検では、同じ旧writer経路は見つからず、関連21件も成功した。

判断は同名.thinkをcommand-line llmthinkで監査し、fatal/error/warningは0。SDK欠落の前件とは異なる検査データ準備の問題である。

## 残作業と時間境界

所有者は2026-10-05 22:30 JSTの終了予定を維持した。新しい修正PRの必須CIを確認して統合し、固定済みrc.4を移動せず、新しいrc.5で公式Stageを再実行する。Stage成功の同一成果物だけを公開へpromotionし、公開新規試合の正常完走・実況完了・SDK実利用トークンを確認する。公開完走は未確認であり、ゴール達成やプロンプト固定条件の成立を宣言しない。

残り内部作業は暫定30〜60分、確信度低。CI・クラウド・モデル応答の外部待機は別枠。正式PERTの公開実行開始記録は、保留中の旧検証依存によりPTDAG-207で拒否された。依存を迂回する更新もPTDAG-204で拒否され、計画は変更していない。実際のStage開始時刻・結果はrc.3/rc.4 evidenceに保持する。次回はこの記録境界も、保留範囲を維持したまま確認する。
