import type { AssetVisibility } from "@kshiai/shared";
import { assetVisibilityLabel } from "@kshiai/shared";

const OPTIONS: Array<{ value: AssetVisibility; label: string }> = [
  { value: "public", label: "公開（誰でも対戦に選べる）" },
  { value: "friends", label: "フレンドのみ" },
  { value: "private", label: "非公開（自分だけ）" },
];

export function AssetVisibilityField(props: {
  value: AssetVisibility;
  disabled?: boolean;
  canEdit: boolean;
  onChange: (value: AssetVisibility) => void;
}) {
  if (!props.canEdit) {
    return (
      <p className="muted">
        公開範囲: {assetVisibilityLabel(props.value)}
      </p>
    );
  }
  return (
    <label className="field" style={{ marginBottom: "0.75rem" }}>
      <span className="field-label">公開範囲</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) =>
          props.onChange(event.target.value as AssetVisibility)
        }
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
