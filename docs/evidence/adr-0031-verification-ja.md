# ADR-0031 revision 1 — 作成・検証記録

- 状態: Proposed。独立ADRレビュー・受理・実装は未実施。
- コミット前提: d879c87。既存WIP845ファイルを保存、読戻し時クリーン。pushなし。
- コミット時のnpm test・npm run typecheckは成功。
- 正本: docs/adr/0031-focused-structured-semantic-authoring-kernel.think
- 正本SHA-256: cf623039913261e5735166f91ad07aa82d6640393614f82cbadc47a1e2367e16
- 投影SHA-256: 05897508ce737212a1ba742a30c2eb029c41a57b22f7cda8091c744734cabba0
- 全文日本語: docs/evidence/adr-0031-focused-authoring-kernel-owner-review-ja.md
- 日本語SHA-256: 1910fad43b5ed4bd016381e7f376f863d8783b705ad9ccf8f3e75ca77ad60ad7

## 検証

新ADRを指定したnpm run adr:checkは成功。CLI fatal/error/warning 0。
全ADR検査は失敗: 0015/0016/0017にDSL構文・受入記録条件、0019にDSL構文・Proposed条件の指摘。
これら4正本はd879c87との差分なし。原因解析や修正は本作業に含めず、全体成功とは報告しない。
docs/adr/template.thinkはこのworktreeに存在しないため、Markdown templateと
READMEおよび既存の正本DSL形式に合わせて対を作成した。新templateは追加していない。

## 影響範囲

既存proposal/adr-0030の変更前Sealは417496dc4365c5c8a459aa3ffc37790909924da1983a637e9e3b33b8104abb94。
impactは218個の到達可能headを返した。これは機械的な影響候補であって、
218件の修正必要性確認・全件レビューではない。全経路列挙ではない。
候補一覧をadr-0031-prior-impact-summary.jsonに保存した。

今回旧ADRを変更・Supersedeせず、新Proposed ADRを追加した。
索引は0031のProposed行だけ追加。他の索引行の文言・statusは変更しない。
実装、計画、過去観測証拠を自動relink/resealしない。
後継実装設計ではD10/D11に従い、実際に変える契約と対象を個別に確認する。

## 今回の設計範囲

型付き基盤とAdapter/Port、Skillによる部分capability公開、部分提案の一括適用、
意味照合・回復・Q&A、process/lease喪失時のfenced failureと新attempt再試行、
機械的上限・進捗監視・制御状態整合、既存契約の条項別扱いを具体化した。
受理済み要件の再レビューではなく、これを実現するアーキテクチャの判断対象である。
具体DTO/patch schema、数値policy、公開retry/Q&A対応、永続化の正確な変更はD11の後続設計。
基盤の実装完了やproduction障害解決ではない。
