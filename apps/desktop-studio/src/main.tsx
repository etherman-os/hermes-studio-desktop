import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/main.css";
import "./styles/activity-rail.css";

console.log("[main.tsx] Entry point running...");

const rootEl = document.getElementById("root");
if (!rootEl) {
  console.error("[main.tsx] #root element not found!");
} else {
  console.log("[main.tsx] #root found, mounting app...");
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED REJECTION]', event.reason);
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error.message);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', background: '#111', height: '100vh' }}>
          <h1>React Error</h1>
          <p>{this.state.error}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);