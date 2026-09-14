# A3+B8 統合 Stage 候補レビュー（2026-09-14）

## 対象と結論

対象は PR #147 の `e943c0d` である。これはレビュー対象の A3/B8 統合実装
`898e6dd` と、レビュー中に加えた限定的なセキュリティ更新を含む。
A3/B8 の機能差分に修正必須の指摘は見つからず、ローカル検証と更新後の
リモート CI は成功した。PR は別途 merge/tag を判断できる merge-ready 状態である。

## Claim / Evidence / Action

### C-A3B8-101 📜✅

主張: `e943c0d` に含まれる A3/B8 統合実装は、受入済み R24 と統合計画の範囲に一致する。

根拠:

- E-A3B8-101: generation ID から V2/V3 を厳密に分岐し、asset identity と content digest、mixed tuple を検査するコードとテストを確認した。
- E-A3B8-102: Stage smoke は V2 を current のまま保ち、V3 を non-current として追加し、provider request 0 件で migration work を再読込する。
- E-A3B8-103: A3 create smoke は既定 `false` で、明示的な `true` の場合だけ一時 owner に1リクエストを送り、accept/activate せず discard する。
- E-A3B8-104: schema 3 policy、有効 pointer の V3 移動、本番昇格、新規 type escape は当該コミットに含まれない。

実装判断:

- A-A3B8-101 🚀 [実行済み]: 13ファイルの差分と受入条件を照合し、機能レビューを完了した。
  - 参照: C-A3B8-101

### C-A3B8-102 📜❌

主張: PR #147 の `security` と `backend-image` 失敗は A3/B8 コードの退行ではなく、
現在の依存版とランタイムOSパッケージが新しい脆弱性情報に該当したことによる。

根拠:

- E-A3B8-105: GitHub Actions run `34799933363` は `validate` と `worker` が成功し、`security` と `backend-image` が失敗した。
- E-A3B8-106: npm は Hono `<4.13.5` と Sharp `<0.35.4` を報告し、image scan は Debian `libpcre2-8-0 10.42-1` に対して修正版 `10.42-1+deb12u1` を示した。
- E-A3B8-107: `898e6dd` は dependency manifest と `backend/Dockerfile` を変更していない。`origin/main` の最終成功は 2026-09-08 で、今回の検出より前である。

原因区分:

- root cause: repository が現在脆弱判定される依存版と未更新 runtime package を解決できる状態だった。
- surfacing condition: 2026-09-14 時点の npm advisory と image vulnerability database がそれらを検出した。
- escape cause: 直前の main CI 成功は今回の脆弱性情報が反映される前だった。

実装判断:

- A-A3B8-102 🚀 [実行済み]: Hono `4.13.7`、Wrangler `4.131.1`、Sharp `0.35.4` へ更新し、runtime image に `libpcre2-8-0` の限定更新を追加した。
  - 参照: C-A3B8-102

## 検証結果と未確認事項

- E-A3B8-108: 更新後の `npm audit` は 0 件。
- E-A3B8-109: 更新後に shared 349、backend 437、frontend 20、deployment 3、release 5、合計814テストが成功。
- E-A3B8-110: `typecheck`、`build`、`static`、`git diff --check` が成功。`adr:check` は exit 0 で、既存の ADR-0015/0016/0017/0019 の指摘のみ継続。
- E-A3B8-111: PR #147 のリモート head は `e943c0dacf7838223deef46810c70eac6558b315` でローカル HEAD と一致し、GitHub は `MERGEABLE` / `CLEAN` と判定した。
- E-A3B8-112: GitHub Actions run `34814481846` は `validate`、`security`、`backend-image`、`worker` の4ジョブがすべて成功した。`backend-image` 成功により、更新後 runtime image のビルドと脆弱性検査も通過した。
- 制約: この WSL には Docker がないため、runtime image のローカル実行確認は行っていない。リモート `backend-image` ジョブの成功を当該確認に用いる。
- 未実施: merge、tag、Stage、provider smoke、schema 3 activation、本番変更。

### C-A3B8-103 📜✅

主張: PR #147 の `e943c0d` は、別途 merge/tag を判断できる exact merge-ready revision である。

根拠:

- E-A3B8-111
- E-A3B8-112

実装判断:

- A-A3B8-103 🚀 [実行済み]: exact revision、PR状態、全リモートCI結果を照合し、`cc301` のレビュー対象を `e943c0d` に確定した。
  - 参照: C-A3B8-101、C-A3B8-102、C-A3B8-103
