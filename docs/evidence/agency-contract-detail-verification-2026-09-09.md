# ADR-0028具体化の検証 — 2026-09-09

## 対象とauthority

要件revision 1の承認を受けた具体設計。ADR-0028 revision 1はProposed。
主作業ツリーはcompact-psyche-repair-integration-kshiai、HEAD 0754ca7。
runtimeコード・prompt・schema、設定、キャラ世代、paid API、deployment、commit/pushは今回変更していない。
既存CA-00テストWIPを保持。要件原本SHA256 f733f85a153349e4be28785fef05d93006d057e0e5d507a8423b658f9bb7f444は変更なし。

## 正本・投影と監査

- .think SHA256: 131bae7b5975c917ba608c8379852caac5825c3a9bbe6a86281f6140284e11aa
- .md SHA256: 056c68d61c80d746e4bc5fe7d4afd862b5b739adb87157387449caa27f8de706
- CLI: llmthink dsl audit docs/adr/0028-versioned-conscious-agency-contract.think
- fileを直接再監査した結果: fatal=0、error=0、warning=0、info=1、hint=37。
- infoはOWNER_ACCEPTANCE未決。Proposed表示と実装停止で保持する。
- hint35件はdecision間の共通根拠、1件はD1/D2の近接、1件は長いdescription。
  D1はキャラ出典、D2は戦闘／設定の束縛で相互依存する別契約。共通根拠を独立証拠と数えない。
  D1〜D9は各責務・世代・失敗表と照合した。機械的hintは意味矛盾の確定ではないが、
  本セルフ確認も独立ADRレビューではない。owner reviewを残す。
- 正本と日本語投影のD1〜D9、Proposed、版、Supersedesなし、上限・失敗表を対応確認。
  出典不明時のV3開始拒否は要件そのものではなく、新たな設計判断として明示した。
- 先行するCLI判断: agency-contract-detail-2026-09-09。保存ファイルは同名.think。

npm run adr:checkはexit 1、Missing script: "adr:check"。
この作業ツリーにtemplate.thinkとcheckerがない。主checkoutのテンプレートを参照したが、
checkerは所在checkoutだけを走査するため、他checkoutの結果で代用していない。
CLI監査成功をnpm ADR gate成功とは報告しない。ツール導入は今回の変更対象外。

## 計画チェック

perttool document check docs/dialogue-expression-realization.pert --format json: ok=true。
PTDAG-208（38件、同一警告の重複出力を含む）とPTMAC-102（32件）を保持。
前者はclosureによるmilestone到達、後者は未宣言acceptance criterion。
タスク記載から新ADR受入や有料実行権限を推定しない。t027は案作成のみ完了、t028未完了。
既存完了履歴をadvanceで書き換えたり、架空の受入基準を追加しない。
t029=3pは出典確認経路を含む再見積り前の暫定値。
git diff --check: exit 0。runtime無変更のため670試験の前回結果を再実行結果として引用しない。

## Sealの影響確認とreadback

変更前plan/agency-implementationの下流はdesign/agency-responsibility、
backlog/character-agency、plan/dialogue-expressionの3参照。
新規レビュー／承認／ADR／投影／索引を登録し、本文確認した上記4計画を順にreseal。
旧依存Sealをpreviousとして新依存へ記録してから旧Causeをunlinkした。
Accepted要件の元Seal 669946bfb5eff943cece9714620639ca322a688a5c5d2436e9912c170bc92af5は保持。
Sealのdraft=falseは正確な内容の確定であり、文書Status=ProposedをAcceptedへ変えない。

検証時点: 41 refs、72 seals、全source WORKFILE_MATCHES_HEAD、NO_CANDIDATE、
stale --scanは空、fsck result=ok。登録表v5が現行、v1〜v4は履歴。
各candidateのraw内容を原本ファイルとcmpし、一致後にsealした。
Sealは登録済み依存の追跡で、未登録影響・モデル品質・実装適合を保証しない。
監査JSON／検証メモ／登録表／運用ログは補助証跡であり、自己参照Sealの循環を作らない。
保存先はローカルのみ。remote同期済みとは扱わない。
