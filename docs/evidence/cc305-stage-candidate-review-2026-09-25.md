# cc305 初回 V3-only Stage 試行候補レビュー（2026-09-25 改訂）

所有者が確定した初回試行は、新規 V3 キャラ Neva と Rio による実 Stage 対戦である。V2–V3 混在対戦と V2→V3 移行はこの到達条件に含まれない。移行一件の Stage 使用は後続 `cc316` として保持する。旧移行経路レビューは [履歴](cc305-migration-route-review-historical-2026-09-25.md) として分離した。

Neva と Rio の決定的な V3 候補 fixture は `codex/v3-stage-trial-candidate` に存在する。これらはローカル候補であり、登録済み・所有者による内容受入済み・Stage 利用可能という証拠ではない。同枝の `vt102` は V4 battle binding の部分 WIP で、完全な対戦と全 consumer の検証は残る。旧枝の ADR-0032 と現行枝の ADR-0032 は異なる identity を持つため、設計・コード・Seal を無検証で取り込めない。

現行 `cc305` では、`vt101` 登録と選択、`vt102` 不変 V3 revision の V4 対戦結合・全 consumer、`vt103` Neva 対 Rio のローカル完走、`vt104` exact release identity、`vt105` Stage 配備、`vt106` Stage の二体登録・有効化、`vt107` 所有者の実対戦を一つの候補経路として確認する。ここでは不足と経路をレビューし、exact release identity はローカル統合後の `vt104` で固定する。`cc314` はこの子計画を重複計上せず roll-up する。旧 `cc305` の「Stage V2 source / focused migration provider / 移行 pointer がない」という停止理由は、この初回試行の必須条件ではない。

現時点では exact release commit、V3 候補の登録・選択、V4 全経路の結合、Stage revision と二体の Stage ID、実プレイ receipt が未確定である。`cc305` の旧 work_event は当時の範囲で行ったレビュー時刻として保持し、新しい V3-only 候補レビューの完了実績には読み替えない。`cc305` は suspended のまま、Stage tag・配備・provider call・pointer 更新・データ書込みは行っていない。
