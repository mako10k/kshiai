# 戦場補完と実況文字列抽出のテスト契約 — 2026-10-08

全247単体ファイル＋4E2Eを保持する封印目標のうち、原2ファイル6ケースを扱う。規範・既存compilerと実際に呼ぶhelperを分け、whole authoringやSSEの完成を局所試験から主張しない。

## 戦場定義の補完

Accepted ADR-0012の明示的legacy upgrade・structured definition・正準の外見/係数の保持、Accepted ADR-0010のasset/media不変性を守る範囲。既存shared schema/compilerのlegacy変換をfixture作成に使用する。原3ケースは、legacy空欄のgap list、natural string fillとID形状/効果/pressureの変換、基底係数/media ID保持、driftした候補から表示名/外見/係数を戻すことを確認する。isSystem:falseなのでF-BF-06のsystem preset read-onlyを実証しない。候補保存・provider生成・原子的activation・battle compilerの完全性・画像品質を証明しない。

producerの2つのcastをisRecord guardとtext propertyのin検査へ置換。safeParseを先に試し、fallback後もZodで最終検証する既存処理を維持する。原ケースは直接schema成功経路だけなので、wrapped textを持つraw recordからfallbackとproperty guardを通る1ケースを追加した。原3ケース/all assertionsは保持。

## 実況文字列の部分抽出

原3ケースはnarrator配列が始まる前のempty/null、完成行と未完成draft、escaped quoteの復号を確認する。sourceとtestは変更しない。現在のadapterにはこのhelperを呼ぶprogress sinkがあるが、その大きなdirty module全体をこの試験のsource証明へ束縛しない。requirementsの実況ストリーム画面は上位の用途であり、ここでは既存partial-string helperの局所挙動だけを検証する。完全JSON検証、SSEのphase/retry/done/error、UI rendering、意識パイプラインawareness-v5実況の受入を主張しない。

## 再検証する既存経路

SDLCのmodule-level R責務コメントを、local-media-store、image-service、sqlite-to-postgresの3修正済みmoduleへ追記した。各sourceは既存Seal本文と比較し、コメント以外byte-identicalを確認。実装の意味や既存Causeを拡大しない。local store→image wrapper→image/archive検証と、SQLite inspector→source検証をtopological順で再検証し、変更targetの旧revisionをCauseのpreviousとして記録する。observer自身の旧HEADをtargetのpreviousにしない。非対象HEADと旧source本文は保持する。

## 検証

戦場4＋stream3＋既存画像/DB helper18の診断25pass/0fail/0skip、workspace types0、独立whole-case/実装レビューPASS。25件はローカル診断であり、正式全251の実行・合格ではない。新規2whole filesの通常Sealと影響した既存6REFの再検証後も、残未封印を理由に正式テストを実行前で停止させる。
