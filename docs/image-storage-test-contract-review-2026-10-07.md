# 画像保存helperのテスト契約 — 2026-10-07

全251ファイルの封印目標のうち、r2-storage.test.tsの原3ケースとimage-service.test.tsの原4ケースを扱う。規則はNFR-11/F-BF-08の共有画像保存意図と外見・地形・障害・環境条件による画像入力、F-CHR-10とAccepted ADR0011のappearance-only image brief、immutable selectable asset/media契約に由来する。

## 原ケースの観測範囲

R2側は日時・generation suffixを明示したキー生成とURL組立て、ID traversalの拒否、注入writerに渡すPutObject commandのBucket/ContentTypeと返却URL prefixを確認する。最後のcase名は実証対象に合わせ、実R2の書込みやprivate ACLを証明したという誤解を避ける。アサーションやケースは削除しない。実R2/S3、アクセス制御、複数インスタンスからの読出し、永続性は未検証。

image-service側は外見・terrain/obstacle/environment・明示調整のprompt合成、戦闘係数を入力から外すこと、image briefを優先して歴史・人格・関係・秘密名等を除くこと、local revision URLとtraversal拒否、注入provider失敗時にplaceholder成功を返さないことを確認する。保存やDB更新の原子性・実Provider互換性・画像品質は証明しない。

V2 sheetはhelper互換性と失敗のfixtureとして使用する。Accepted ADR0043は通常のV2画像更新を除外しており、このSealでV2更新を認可しない。現在のV3 routeはprojected image briefを渡す（Accepted0049/既存V3 lifecycle）。

## 検証

独立読み取りレビュー担当 /root/llm_boundary_seal_audit が原2ファイル7ケースを上記の範囲で封印可能と確認。注入writer/providerを使うlocal診断で7 pass、0 fail、0 skipped。image-archive.test.tsはserviceを呼ばないcaseがあるため今回対象にせず、後で実接続の確認を修正する。全体テストや全statusの無警告達成を主張しない。
