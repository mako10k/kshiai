import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#fecaca", fontFamily: "system-ui" }}>
          <h1>表示エラー</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.textContent = "root element missing";
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </RootErrorBoundary>
    </StrictMode>,
  );
}
