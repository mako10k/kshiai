# ADR-0027 revision 1 発行記録

2026-09-09。Status: Proposed。独立レビュー・owner受入・有効なsupersedeは未実施。

- 正本: `docs/adr/0027-unified-conscious-agency-and-psyche-boundary.think`
- 正本SHA-256: `74606d5bb31688b42c2ed228268e1f8d7976caac59fd328443f04949f054f055`
- Markdown SHA-256: `2bef372366478e20b33187738811a63688618881716543d788cadb77b5acf846`
- REF `proposal/adr-0027`: `daf55fb5a31b09c0c905b322ada0ccb1ca718103b562ec90d5254f000eebf389`
- REF `projection/adr-0027`: `98e31826220432b945be5094e95c479b6254d31913a750207416c877fe81dac4`
- 前者のCauseは変更前ADR-0004、後者のCauseは提案正本。previous assertionはまだ空。
- `adr/psyche-boundary` は旧Seal `5a65ee9aeb1c0b082985e0e320521d014a7211ff0f4d8e50da4ebc8e10e56957` のまま。

初期登録表v1の16資料に上記2資料を追加した。提案Sealの発行は承認ではない。
現在の草案・実装コメント等の下流は、旧根拠を保持して後続の個別確認対象とする。

検証: CLI LLMThink `adr0027-revision1` のfatal/error/warningは0。
`npm run adr:check` はこの作業ツリーにscriptがなく実行不可。
代替として正本監査、投影セルフレビュー、差分空白検査、Seal source一致・fsck・staleを確認。
専用ADRチェッカーが成功したとは扱わない。コード／prompt／戦闘stateは変更していない。
