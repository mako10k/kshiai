import type {
  AssetAuthoringFailure,
  AssetAuthoringProgress,
} from "@kshiai/shared";

export function AuthoringProgressNotice(props: {
  progress?: AssetAuthoringProgress | null;
  fallbackLabel: string;
  active?: boolean;
}) {
  if (!props.active && !props.progress) return null;
  const label = props.progress?.label ?? props.fallbackLabel;
  const step = props.progress?.step;
  const stepCount = props.progress?.stepCount;
  return (
    <div className="authoring-progress" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="authoring-progress-label">{label}</p>
        {step && stepCount ? (
          <p className="muted authoring-progress-step">
            {step} / {stepCount}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AuthoringFailureNotice(props: {
  failure: AssetAuthoringFailure | null;
}) {
  if (!props.failure) return null;
  return (
    <p className="error">{props.failure.errorCode ?? "更新に失敗しました"}</p>
  );
}
