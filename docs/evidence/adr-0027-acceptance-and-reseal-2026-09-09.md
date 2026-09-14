# ADR-0027 revision 1 — 承認反映と影響先reseal

2026-09-09。ownerの「OKです。承認します。」を0004/0027比較後の本版承認として記録した。
承認対象の正本SHA-256は
`74606d5bb31688b42c2ed228268e1f8d7976caac59fd328443f04949f054f055`。
D1–D8の決定本文は変更せず、OWNER_ACCEPTANCEとACCEPTANCEを追加した。
ADR-0004はSupersededに変更し、旧本文の理由は保持した。
ADR-0008/0011/0025/0026は互換scopeが両立するためSupersedeしていない。

## 影響と完了範囲

- 変更前の登録下流15件を個別確認。訂正7件（資料5、実装コメント2）、互換維持8件。
- 論理REFを後継0027へ継続。旧Sealを保存し、確認済みobserverのCauseに旧版を明示した。
- 変更直後のStale 15件から、個別根拠を付けたreseal後は0件。
- 新規に旧0004のSuperseded表記、実装prompt、Mock、実装影響資料を登録。
- 最終22 REFすべて元ファイルとHEADが一致、未Seal候補なし、fsck=ok。
- 現在の境界から下流20 Seal/REFを検出。all-pathsの打切りなし。

これは登録した責務境界のレビュー完了であり、新しい顕在意識の実装完了ではない。
維持可の実装も、旧世代契約を残すことと移行課題を確認したうえでSealしている。
登録外の依存は検出できない。今回の調査で見つかったprompt/Mockの追加により範囲を補ったが、
repository全体の依存網を完全登録したとは扱わない。

## 実装への主な影響

既存advanceCharacterAgentは行動とセリフを同じ呼出しで返している。
主な課題は心理に残る目標・意図の配置と、顕在意識の知識・状態受入・永続化である。
後攻の行動再判断、行動却下と発話受理の組合せも整合性の検証対象とする。
詳細は[実装影響調査](adr-0027-implementation-impact-2026-09-09.md)に記録した。
具体schema・writer・寿命・世代は引き続き設計対象。PERTの次候補はt026。

## 検証

- CLI LLMThink実行判断: `adr0027-acceptance-2026-09-09`、fatal/error/warning=0。
- Accepted正本のCLI再監査: `adr0027-accepted`、fatal/error/warning=0。
- `npm run typecheck`、`npm test`: 成功。
- TypeScript printerでコメント除去後の4変更ファイルをHEADと比較: 全件同一。
  prompt/Mock自体にもGit差分なし。runtime・prompt文字列・schemaの変更なし。
- PERT document check: errors=0、既存PTDAG-208/PTMAC-102 warningsあり。
- `npm run adr:check`: この作業ツリーではscript未定義で実行不可。
  別checkoutのscriptは自身の配置場所をrootにするため流用していない。
  0027正本のCLI監査成功はrepository全体のadr:check成功とは区別する。

## 証拠と保存境界

- [承認前の個別レビュー](adr-0027-all-impact-review-2026-09-09.md)は歴史記録として保持。
- [置換直後のStale](adr-0027-stale-before-reseal-2026-09-09.json)。
- [旧新Seal・個別根拠・最終readback](adr-0027-reseal-readback-2026-09-09.json)。
- [現在の登録表](../sealgraph-registration-v2.json)、[運用手順](../sealgraph-operations.md)。

作業ツリーのローカル保存のみ。commit/push・remote同期・有料LLM実行・deploymentは未実施。
