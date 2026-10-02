# 2026-10-02 作業終了・V2更新廃止の引継ぎ

通常のV2キャラ新規作成・更新の廃止と、現在／旧リビジョンの閲覧維持は完了。機能上の残作業は0分。明示的なV3移行と既存戦闘の記録更新はAccepted ADR0043の例外を維持した。ユーザーの「CI終了後、引継資料・WIPコミット・pushして終了」に従う。

## 再開場所と正確な対象

- 継続worktree: `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`
- branch: `codex/cc304-focused-revise`。新しいbranch/worktreeを作らず、この作業を照合して再利用する。
- main／secdat domain: `/home/katsumata-m/kshiai`
- 稼働製品source: `fce86a53434f5561baa70fb567cd2196cb92ba17`
- 配備／完了証跡source: `a0e5f47d986ae8f0e87e10c6e434a405f7ad49bc`
- そのCI: [37000442643](https://github.com/mako10k/kshiai/actions/runs/37000442643) completed/success、validate／worker／security／backend-imageの4件成功。
- 製品sourceCI: [36997454018](https://github.com/mako10k/kshiai/actions/runs/36997454018) 4件成功。現行権威の260件・typecheck・static成功。
- この引継WIPは資料のみ。製品code／image／稼働設定を変更しない。引継commitのSHAはgit HEAD／originの独立読戻しで確認する。上記CI成功を引継commitへ読み替えない。
- [PR152](https://github.com/mako10k/kshiai/pull/152) は未merge。merge／tag／releaseは実行していない。

## 稼働環境

公開: https://kshiai.mk10.org/

プレビュー: https://v2-retire-458af76-kshiai-web.mako10k.workers.dev/

GCP project `kshiai`、region `asia-northeast1`、service `kshiai-api`。revision `kshiai-api-v2-retired-fce86a5` にpublic100%と `v2-retire-458af76`／`v3-trial-36954429062-1` の両tag。imageは `asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:53a0388834ea44c8755ee3c089cc19da53e58c1732a6d94f89a2dd067a454f6c`。Cloud Build `ed11e64c-b3b0-4d46-b435-518ac9d4308a` SUCCESS。

Cloudflare Worker `kshiai-web` のpublic versionは `84fcfed4-05a9-404e-b836-e2eebeb584d3` 100%。両originのfrontend9件が検証済みsourceと一致し、API health200／同じnewrevision／Worker runtime headerを確認した。Supabase設定は承認済みcallback設定と全体一致。自動キャラ移行provider／trialを有効化していない。

公開切替時にCloud Runの既存manual0設定が503を生んだ。tag-onlyのpreview成功では通常trafficの稼働を証明できなかった。CLI llmthink監査後、必要な復旧として `--scaling=auto` を1回実行。spec全体・revision・trafficを維持して復旧し、public／preview200を確認した。現在はautomatic、revision最大20、最低0。需要に応じた通常実行費用が発生する。旧V2コードへ戻していない。

次回のtraffic切替は、revision templateだけでなくservice-level scalingと実効instance割当を事前に確認し、切替後に通常public URLを独立して検査する。失敗時は状態を読戻し、曖昧な操作を再実行しない。

## 完了根拠と制限

[要件ごとの照合](evidence/v2-write-retirement-completion-2026-10-02.md)、[配備・復旧の観測](evidence/v2-public-write-retirement-result-2026-10-02.json)、[完了監査](evidence/v2-write-retirement-completion-audit-2026-10-02.json)、[CI読戻し](evidence/v2-retirement-closeout-ci-2026-10-02.json)を参照。

通常HTTP更新、中央saveSheet／generic generation保存、有効化、保存済みV2候補確定、queue／retry／backfill、潜在的provider builder／portrait／toggle／restoreを照合済み。V2表示、戦闘固定snapshot、認可、現在V3化後の旧V2表示を検査。ユーザーが「みき」と旧対戦からのキャラ導線を確認済み。利用できない自動移行ボタンは表示しない。

公開DBに破壊的な更新リクエストや有料LLM実行は行っていない。拒否とDB行不変は隔離テスト、そのsourceの稼働image一致で証明した。旧戦闘本体の全再生、自動移行の提供、キャラV3機能全体の完了は主張しない。履歴fixture／migration-source readers／狭い戦闘accountingは通常のV2定義更新とは区別する。

## 未完の親計画と保全したローカル状態

canonical PERTは `docs/character-semantic-migration.pert`、親 `csm001`／最終 `cm114`。より広い親ゴールは未完。このV2更新廃止の完了から親の受入完了を推定しない。follow-on提案 `docs/evidence/v2-write-retirement-plan-proposal-2026-10-02.json` はowner-controlledで未適用。現行計画には旧trial予定が残り、既存velocity観測はhistory incompleteで有効値なし。推定値を実績に置き換えたり所有者承認を偽って記録していない。

以前からあるdirty `docs/character-v3-stage-trial.pert`、Makoto／VT104–107等の未整理資料60件はこのWIPに混入させずローカル保全。[保全一覧](evidence/v2-retirement-preserved-local-state-2026-10-02.json)に全pathを記録した。これらの内容は未pushで、同期済みと扱わない。別の次回作業で対象／承認／秘密情報を照合してから処置する。破棄・一括stageしない。

次回は最新HEAD・origin・CI・public healthを読戻し、今回の完了を維持していることを確認する。親計画への反映／未整理試行証跡の同期を行う場合は具体的な対象を確定する。最初の再開照合は内部10～20分の暫定見積り（確度低）、以後の親作業時間は受入範囲を確定してcanonical PERTで更新する。今回の機能修正を再実装したり、新imageを作り直す必要はない。

Node実行は `/home/katsumata-m/.nvm/versions/node/v22.22.3/bin` をPATH先頭に使う。Node25のsqlite不整合を理由に依存をrebuildしない。GitHubに接触するgit／ghはmain domainのsecdat secret-layer GH_TOKEN route、dry-runとHTTPS認証確認を経由する。トークンは表示しない。
