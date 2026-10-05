# awareness公開候補の実行依存欠落

## 確認した事実

- Stage run [37311012189](https://github.com/mako10k/kshiai/actions/runs/37311012189) はコミット `1ec8b649443b3295d080ad76d951aaee40ecbc26`、タグ `v0.23.0-rc.3`、イメージdigest `sha256:caf0876899dfa7d2d7e1d677956d006fdc8b7df9f14b43d7f3a4b19f8213c8d4` を使用した。
- マイグレーション工程は成功した。Cloud Runリビジョン `kshiai-api-00168-zud` は `openai` の `ERR_MODULE_NOT_FOUND` により起動に失敗した。Worker uploadと新規試合観測工程は実行されていない。
- Cloud Runサービスの交通配分読戻しで、既存 `kshiai-api-speech-9ce565d` が100%を維持している。公開healthも同版で正常応答した。
- lockfileはSDK `6.49.0` を `backend/node_modules/openai` に配置する。runtime stageはrootの `node_modules` のみをコピーしていた。
- compiled backendとroot依存だけの隔離配置で、同じ欠落エラーを再現した。backend依存配置を追加すると、同じcompiled LLMおよびroutesのimportが成功した。有料モデル呼出しは行っていない。

## 原因・検出経路・修正

原因は、npm workspace内に置かれた実行依存を最終イメージのコピー対象から落としていた構成である。SDK配置の変更がこの既存の仮定を顕在化させた。8080の起動検査失敗はその結果であり、待機期限の不足という結論は採用しない。

ローカルの検証環境にはbackend依存が存在する。以前のbackend-image CIはbuildと脆弱性検査を行うが、完成したイメージのcompiled module graphを実行していない。この差が検出経路の不足だった。

Dockerfileでrootとbackend/shared workspaceのproduction依存配置を維持する。存在しない空workspace依存ディレクトリも作り、COPYを安定させる。CIで完成イメージからcompiled LLMとroutesをimportする。NODE_ENV=test、legacy auth、mock選択に限定し、API index起動・DB初期化・Cloud Tasks・provider呼出しは行わない。

## 次の検証と未確認

実イメージのimportは新しいbackend-image CIで確認する。ローカルDocker DesktopはWSL接続とWindows engine pipeの双方が利用できなかったため、Docker起動成功をローカル確認済みとはしない。固定済みrc.3を移動せず、新しいrc.4を公式stageで試し、成功した同一成果物を公開へpromoteして新規試合の正常完走・実況・実利用トークンを確認する。クラウド初期化とモデル実行の正常性はまだ未確認である。

判断監査は同名.thinkをCLIで監査し、fatal/error/warningはいずれも0。前回の計画更新候補は保留中の旧切替検証とのDAG接続を維持できず拒否され、計画は書き換えていない。旧切替試行の保留は維持する。
