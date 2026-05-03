"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Render-prop or static node shown when the boundary catches. Using a
  // function lets the caller include a "Retry" affordance that resets the
  // boundary state via the supplied callback.
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  // Optional label, included in console output to help locate which boundary
  // tripped when several exist on the page.
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Class component because React still doesn't expose error boundary semantics
// via hooks. Kept tiny on purpose — global error reporting (Sentry) goes
// through the project's existing instrumentation, not through this boundary.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    const label = this.props.label ?? "ErrorBoundary";
    console.error(`[${label}]`, error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (typeof this.props.fallback === "function") {
      return this.props.fallback(this.reset);
    }
    return this.props.fallback;
  }
}
