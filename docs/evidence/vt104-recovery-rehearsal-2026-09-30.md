# vt104：隔離PG17復元rehearsalとcontrol候補

2026-09-30の「進めてください」に従い準備を継続した。クラウド・本番DB・remoteへのwriteはゼロ。Stage利用可能価値はまだ0で、今回の将来価値はPG17ツールとlocal復元検証経路を確定したこと。

[公式PGDG](https://www.postgresql.org/download/linux/ubuntu/)のInRelease署名（B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8）、Packages.gz SHA256、3packageのSHA256を検証し、server/client17.11とlibpq18.6を `/tmp/vt104-pg17-rehearsal/root` へ展開した。[provenance](vt104-pg17-tool-provenance-2026-09-30.json)。apt設定・system installation・既存clusterは変更しない。

local serverは127.0.0.1:55441と専用Unix socketへ起動。Node接続は専用CA・rejectUnauthorized=trueでTLS検証。3つの新規DB `vt104_synthetic_source/before/after` 以外に接続しなかった。全実験後pg_ctl停止を読み戻した。合成archiveとlocal server keyは一時領域にだけ置き、Gitへ含めない。再実行は新cluster、または明示的にこの実験の合成DBだけを片付けた状態から行う。既存DBを自動DROPするscriptではない。

[rehearsal script](vt104-pg17-rehearsal-2026-09-30.mjs)と[結果](vt104-pg17-rehearsal-result-2026-09-30.json)を保存した。26本のmigration→合成186対戦（18active/168finished、各2KiB程度、Unicode）・2世代/current・267会計等→custom dump/隔離復元→残4migration→実cutover関数→再送→再dump/復元。全public tables行hash、column/type/nullability/identity/default、constraints、effective ACL/owner/RLS、indexes、sequencesを読み戻した。anon/authenticatedのSELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAINも禁止と確認。

実測の最終runは、前dump164ms/restore300ms、cutover656ms、後dump213ms/restore362ms。row countsは本番棚卸しと同数にしたが、内容は合成で、snapshot byte規模・network・cloud停止・Supabase topologyは再現していない。本番回復R分や30分成立へ外挿しない。

初回は後migration表のraw ACL文字列（explicit owner-only/null default）に差があり、strict比較は失敗した。列・行・indexには差がなかった。[失敗記録](vt104-pg17-initial-comparison-failure-2026-09-30.json)を保存し、CLI llmthink監査後にeffective ACLとowner/各権限を比較する方法へ修正した。アクセス制御を検証から除外していない。same-clusterの合成roleを使った限界も保持する。

INSIDEの未達は[ADR-0040](../adr/0040-shared-cutover-runtime-control.md)の切替control採否・未実装と、本番回復方法・時間の未確定。OUTSIDEはvt105/108の実停止/配備/削除・本番snapshotと本番restore許可。BOUNDARY_DISPUTEはなし。次はADR/detail候補のowner受入後、指定file setのlocal実装・閉包試験。control2–4 agent時間＋実回復方法準備0.5–1時間、低確度。
