# ADR-0032受理後の設計書整合性確認

## 結論

`docs/structured-semantic-authoring-kernel-implementation-design-v1.md`は、
**時間policy部分がADR-0032と不整合**である。設計全体が無効なのではなく、次の記述が
現行の実装authorityとして使用できない。

- 7.1のattempt全体240秒
- 7.1のprovider call 60秒
- 7.1の「全dimensionがhard maximaで、最初に尽きたdimensionが作業を停止する」記述の
  うち、attempt全体wall-clockを含める部分
- 7.2のprovider elapsed reservationをattempt全体のelapsed残量に収める方式

これらは、固定attempt wall-clockを意味的終了条件から外し、provider・worker・
意味進捗・累積資源の境界を分離したADR-0032と両立しない。

一方、型付きkernel/adapter境界、focused work、protected meaning、call・step・token・
費用の単調会計、無進捗・循環検出、persistence、fence、owner review、activation分離は
ADR-0032 D5により維持される。

設計revision 2は履歴snapshotとして変更せず保持した。実装再開前に、時間policy箇所を
新revisionとして訂正する必要がある。具体的な秒数は、対象route・platform・測定・
owner待ち時間budget・exact policy受理が揃うまで追加しない。
