# キャラクター意味作成・移行基盤 — WIP 引継ぎ（2026-09-15）

## 再開対象

- 作業ツリー: `/home/katsumata-m/.codex/worktrees/compact-psyche-repair-integration-kshiai`
- ブランチ: `codex/compact-psyche-repair-integration`
- 本資料作成前の HEAD: `ea8a24fab989d2064e88b8b3fe67072839790854`
- 2026-09-15に取得した `origin/main`: `afcba30fb08c616eaae470ea16705ba2501433b4`
- WIPコミット: 本資料を含むブランチ先端。再開時に `git rev-parse HEAD` とリモートREFを照合する。

このブランチは `origin/main` に対して44コミット ahead、1コミット behindだった。
behind側は先行履歴のsquashコミットであり、終了処理ではmerge、rebase、resetを行っていない。

## 目的と現在価値

受入済みの共通構造化意味作成設計を、キャラクターのcreate、revise、V2-to-V3
migrationの実consumerへ接続する途中状態を保存する。

現在確認できる価値は開発・リスク制御上のものに限られる。実provider効果、実API/UIを
横断する3モード、Stage、production、policy cutoverは未検証または未実施であり、意図した
利用者が現在使える本番価値は0である。

## 保存したWIP

- 共通semantic-authoring kernelのdurable execution、execution policy、accounting、ports、
  orchestrationおよびcharacter adapterの拡張
- provider JSONのstrict parse、限定repairとOpenAI-compatible provider接続
- character focused create/revise/migrateのservice、repository、route、owner answer/retry、
  frontend review表示、共有DTOの接続途中実装
- migration `0026_character_focused_authoring_payloads.sql`
- ADR-0032（時間境界）とADR-0033（runtime Configをdurable run identityにしない）の
  受入記録、設計revision 6、品質定義、計画revision 7と関連証跡
- 既存テスト155ファイルの棚卸しと、現在スコープ20ファイルのSealGraph接続
- `scripts/test-authority.mjs`によるstale/source-divergedテストの実行対象外化
- 上位の受入済み要求から下位計画・検証へ向かうSealGraph Cause Linkと関連objects/refs

## 計画と権威状態

- `perttool document check docs/character-semantic-migration.pert`: OK
- 計画はGrammar 9。`dag analyze --schedule both`のクリティカル系列は
  `cc304 -> cc305 -> cc306 -> cc307 -> cg304 -> cb209 ... cb214`。
- `cc304` はsuspendedのまま。ADR-0033受入後のresume work eventはまだ記録していない。
- `cm304` の `THREE_MODES`、`RECOVERY`、`OWNER_FLOW` はpending。
- `cc305`以降のStage identity、R20評価、production配備、policy cutoverは未着手で、
  それぞれ別の権限境界を維持する。
- `plan/character-semantic-migration` の現在SealIDは
  `8586cd0e19a753fd63744751dfec620e8433b43f56e3af7c0f5cb5642a799204`。
  受入済み要求への新しいCause Linkは下向きに接続済みだが、別の歴史的targetにより
  REF全体は `STALE_DIRECT` のまま。一括resealは禁止。

## 既存テスト棚卸し

権威資料は `docs/evidence/test-authority-inventory-2026-09-15.md`、機械可読manifestは
`scripts/test-authority-inventory.json`。

- 棚卸し開始時の既存テスト: 155ファイル
- 現在のunit/deployment/release検出: 154、governed 19、active 138、disabled 16、
  ungoverned 135
- E2E検出: 2、governed 1、active 1、disabled 1、ungoverned 1
- 現在スコープ20ファイルの内訳: currentかつactive 3、stale 14、source-diverged 3
- invalidな17ファイルは実行前に除外される。除外は正しさ、削除、受入を意味しない。
- inventory証跡SealID:
  `ba36917cd617e691fe0a9e914164146d904a19160aabf4cbeb7cc3c03531f3a9`

repo全体135ファイルは未governedなので、aggregate PASSをSealGraph準拠の証拠とは扱わない。

## 終了時の検証

```text
llmthink dsl audit /tmp/kshiai-test-authority-inventory-2026-09-15.think  PASS (fatal/error/warning 0)
npm test                                                               PASS
npm run typecheck                                                      PASS
git diff --check                                                       PASS
sealgraph fsck --format json                                           PASS
  refs=380, seals=893, materials=559, provenances=817, blobs=2828,
  unreferenced_blob_count=0
scripts/test-authority.test.mjs（runner警告追加後の対象3件）             PASS
perttool document check docs/character-semantic-migration.pert          OK
```

`npm test`は16件の無効unit testを除外した上でactive testsが成功したという意味である。
focused-authoring E2E本体は実行していない。E2E inventoryによる除外だけを確認した。

## 再開手順

1. `$repository-start`でこのブランチのlocal HEAD、リモートREF、dirty状態を再確認する。
2. `npm run test:inventory` と `npm run test:e2e-inventory` を実行し、17件の除外理由が
   本資料と一致するか確認する。
3. `cc304`を自動resumeしない。ADR-0033受入と設計revision 6を前提に現在適合性を再確認し、
   次の実装スライスが実consumer接続を直接進めるか、先にstale/source-divergedテストの
   上流変更を分類する必要があるかを判断する。
4. テストを再有効化する場合は、各テストの上位要求・設計・実装とworkfileを個別に照合し、
   下位verification REFを新しいSealとして記録する。下位テストから上位要求・設計を
   すげ替えない。一括resealしない。
5. 実装を再開する場合も、`cc304`の完了条件はcomponent fixtureではなく、controlled HTTP
   replyが実API/UI、worker、driver、persistenceを3モードで通ること。paid provider call、
   deployment、Stage identity、production、policy activationは別途明示承認まで行わない。

## 未解決・境界

- 17件のscoped testが無効であり、対象挙動の現在の回帰証拠は不足している。
- 135件のrepo testはSealGraph未governed。今回の棚卸しはこれらを自動で正当化しない。
- plan REFの歴史的 `STALE_DIRECT` は未解消。
- 実provider、process-loss、stale result、answer continuation、source-based retryを含む
  全経路の受入証拠は未完成。
- merge、tag、release、deployment、production読取、schema-3 policy切替はしていない。
- `.env`、API key、SQLiteデータ、`dist/`、user mediaは保存対象外。
- user-wide `AGENTS.md` と `agent-antipatterns` の同期更新はこのrepository外であり、
  このWIPコミットやpushには含まれない。
