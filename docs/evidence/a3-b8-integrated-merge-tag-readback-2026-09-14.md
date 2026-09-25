# A3+B8 統合候補 merge/tag readback（2026-09-14）

## 対象と境界

所有者は、PR #147 の squash merge と、生成された main コミットに対する
注釈付きタグ `v0.22.0-rc.12` の作成・push・読み戻しを承認した。
Stage workflow、provider call、schema 3 activation、本番変更は承認・実行していない。

## 結果

- PR: `#147`
- PR head: `0e4a4b1d7e8d67bdf64586951a10462b9222e293`
- 状態: `MERGED`
- merge 時刻: `2026-09-14T09:21:34Z`
- squash merge / main commit: `afcba30fb08c616eaae470ea16705ba2501433b4`
- main CI: run `34827516119`、`validate` / `security` / `backend-image` / `worker` すべて成功
- annotated tag: `v0.22.0-rc.12`
- tag object: `b4f430b863cf78334498197a1b13ccc9552fc6b6`
- tag dereference: `afcba30fb08c616eaae470ea16705ba2501433b4`

## Claim / Evidence / Action

- `C-A3B8-MT-001`（高）: PR #147 は承認された方式で main へ squash mergeされ、
  リモート main は merge commit `afcba30` を指す。
  - `E-A3B8-MT-001`: merge直後のGitHub PR readbackと、fetch後の `origin/main` が一致した。
- `C-A3B8-MT-002`（高）: `v0.22.0-rc.12` は不変の注釈付きタグとして
  exact merge commit `afcba30` を指す。
  - `E-A3B8-MT-002`: リモート `refs/tags/v0.22.0-rc.12` は tag object
    `b4f430b`、その dereference は `afcba30` である。
- `C-A3B8-MT-003`（高）: タグ対象の main commit は4件の必須CIを通過した。
  - `E-A3B8-MT-003`: push run `34827516119` の4ジョブがすべて成功した。
- `A-A3B8-MT-001`（実行済み）: PR merge、annotated tag作成、push、remote readback。
- `A-A3B8-MT-002`（未実施）: Stage workflow dispatch。別途 `cc302` の判断対象とする。
