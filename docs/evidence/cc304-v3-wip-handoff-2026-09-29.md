# cc304 引継 — V3登録完了・対戦設計受入済み

2026-09-29。今回の指示は「引継資料、非クリーン時WIPコミット、プッシュ」。継続先は既存 `codex/cc304-focused-revise`。作業場所は `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`。mainとこの作業用worktreeを維持し、追加ブランチ・worktreeは所有者の明示許可を得て作る。

## 到達点と次の作業

- **V3キャラクター登録（vt109）完了**。Neva/Rioの固定候補を通常の生成attempt・レビュー・所有者確定・世代有効化へ接続した。実装コミットは `af594d8`。元データ・実attempt由来・digest照合、同時/重複確定、discard後の新attempt、期限切れ、CAS失敗の原子性を検証した。[実装証拠](vt109-registration-2026-09-29.md)、[レビュー](vt109-registration-review-2026-09-29.md)。
- **対戦切替の要件・ADR・設計（cc319）受入済み**。所有者の回答は「この候補一式を採用して進める（推奨）」。[受入記録](cc319-owner-acceptance-2026-09-29.md)に提示時SHA-256と採用範囲を保存した。同じ採否の再質問は不要。
- **受入文書の子計画への引継（vt111）完了**。[読戻し](vt111-accepted-handoff-2026-09-29.json)でAccepted文書4点のhash一致を確認。親cm305、子VST_CONTRACT_READYはreached。
- **次は「対戦への不変リビジョン束縛（vt102）」の再開**。現在suspended。作成時のV3世代ID・digest・compiler入力・combat snapshotを、HTTP/SSE、進行、読戻し、ナレーション、workerまで維持する。過去WIPとAccepted契約を照合してから、PERTで実際の再開時刻を記録する。終了条件は全実経路で不変束縛を確認できること。今回の引継作業では追加実装を開始していない。

利用者が新V3対戦をStageで遊べる価値は、現時点で未達（実現値0）。今回の寄与は登録経路のローカル検証と対戦実装の受入根拠の確定。vt102、ライフサイクル/切替vt110、ローカル完走vt103、Stage適用・所有者試行を順に満たすことで利用できる。

## 固定した設計

[要件v2](../character-v3-battle-cutover-requirements-v2.md) → [Accepted ADR-0039](../adr/0039-v3-battle-lifecycle-and-cutover.md) → [設計v2](../battle-lifecycle-boundary-design-v2.md)を用いる。

新規対戦はV3同士、V4入力に作成時の世代を固定する。作成・読込・進行・破棄を狭い共通操作へ集め、旧未完了対戦を物理削除して、再作成防止にIDと切替identityの最小記録を保存する。入口/task投入の停止、処理の収束、削除・読戻し、再開の順で切り替える。完了履歴・キャラクター世代・会計記録を保持する。履歴移行は既決の合計30分枠を継承し、超過時は対象と消去等の具体案を提示する。

ADR-0010および保存枝の別内容ADR-0032は、ADR-0039 D4に列挙したR3対象の保存・継続句だけが置換対象。ADR-0010のauthoring/完了履歴と現行authoring時間境界ADR-0032は継続する。ADR-0038は従前の状態を引き継ぐ。

## ゴールまでの見込時間

2026-09-29のperttool出力では、初回Stage試行の子計画は先行関係3.000時間・資源制約3.245時間、後続移行/評価を含む親計画は5.938時間。これは所要作業時間の条件付き予測で、カレンダー上の完了日時は未算出。

速度はvt109一件の実測31分50秒（20:48:57–21:20:47）からperttoolが観測した `780p/191h`。cc319所有者検討時間と引継事務時間を速度へ混ぜていない。DEV容量1、vt102再開、外部待ち時間を別扱いとする条件。作業カレンダー/時刻anchorの不足と登録作業一件の偏りがあり、次の実装完了時に実績を追加して再推定する。

[PERT読戻し](cc304-handoff-plan-check-2026-09-29.json)：両計画document check・dag analyze（both）・dag nextを実行済み。親nextはcc314（子計画の集約）、子start候補は空で、vt102のresumeが継続地点。親には従来のPTDAG-208（閉包で到達したmilestone）の警告が残る。計画原本は[親](../character-semantic-migration.pert)・[子](../character-v3-stage-trial.pert)。

## 検証と実行環境

- `npm run typecheck` 成功。`npm test` は有効12ファイル117件、画面E2Eは3件成功。末尾空行修正後にも両テストを再実行した。provisional 2/disabled 146ファイルを成功件数へ含めていない。
- 実SQLiteで登録/レビュー/確定/選択を検証。画面テストはHTTPをinterceptするため、実SQLite routeテストと分けて扱う。実CLIを一時DBへ2回実行し、同じ2件のawaiting_owner_acceptanceと有効世代0を確認。
- PostgreSQL実行確認は残る。共通SQLと同時実行lockは静的に確認した。Stage適用準備では実PostgreSQL上の確認を含める。
- paid provider呼出し、実Stageデータ操作、merge/deployは今回の作業に含まれない。
- [検証JSON](vt109-validation-2026-09-29.json)、[テストauthority](vt109-test-authority-2026-09-29.json)、[実装manifest](vt109-implementation-source-2026-09-29.json)。EOF空行の除去後にSealGraph実装/テストcauseを更新済み。`sealgraph fsck` はok。これらは登録sliceの証拠であり、対戦全体の完成証明ではない。

ローカル実行時は以下のPATHを使った。Node 25は現在のbetter-sqlite3 ABIと一致する。リモートではNodeと依存関係ABIを揃えてインストールする。

```sh
export PATH=/home/katsumata-m/.local/bin:/home/katsumata-m/.nvm/versions/node/v25.1.0/bin:$PATH
node /home/katsumata-m/perttool/dist/cli.js document check docs/character-v3-stage-trial.pert
node /home/katsumata-m/perttool/dist/cli.js dag analyze docs/character-v3-stage-trial.pert --schedule both
node /home/katsumata-m/perttool/dist/cli.js dag next docs/character-v3-stage-trial.pert --format json
npm test
npm_config_offline=true E2E_CHROMIUM_EXECUTABLE=/home/katsumata-m/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome npm run test:e2e-gui
```

PERTは0.11.1を使用（インストール済み0.11.0との差に注意）。ブラウザ指定は当ホストにあるChromiumのパス。別ホストでは実在するブラウザを使用する。共有packageのbuildが必要な新規環境では先にbuildする。テストの有効集合はリポジトリのauthority selectorから選ぶ。

## 同期と継続

この資料を含むWIPコミットを同じリモートbranchへpushする。実行後、独立した `ls-remote` のSHAとlocal HEADを照合し、結果を会話の完了報告へ残す。この文書自体はpush前の資料である。

GitHub通信はmain worktreeのsecdat domainを使う（token値を表示しない）。次のホストでもrepository-startに従いdry-run injectionとtransportを確認する。

```sh
secdat --dir /home/katsumata-m/kshiai exec \
  --inject secret:only=GH_TOKEN --inject secret:require=GH_TOKEN \
  --inject route:prefer=secret --inject final:require=GH_TOKEN \
  -- git ls-remote --heads origin refs/heads/codex/cc304-focused-revise
```

継続者はこの資料、受入記録、現行PERTとGit状態を読み戻し、既存cc304上でvt102を再開する。実装終了時には束縛経路の証拠と計測実績を記録する。Stage適用時は対象・最大影響・復旧方法を具体化した実行範囲を扱う。
