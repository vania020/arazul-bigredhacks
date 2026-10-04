import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  message: string;
  endLabel: string;
  onEnd: () => void;
  children: ReactNode;
}

/**
 * Keeps an unexpected navigation error from taking down the planning app. The failed session
 * unmounts (so its location watch and map overlays are cleaned up) and the user can end it.
 */
export class NavigationErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ARAZUL navigation] Navigation stopped after an unexpected error", {
      error: `${error.name}: ${error.message}`,
      componentStack: info.componentStack,
    });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="absolute inset-x-3 top-3 z-20 mx-auto max-w-lg rounded-2xl border bg-card p-4 shadow-float"
      >
        <p className="font-display text-lg font-extrabold text-deep">{this.props.message}</p>
        <button
          type="button"
          onClick={this.props.onEnd}
          className="mt-3 h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground"
        >
          {this.props.endLabel}
        </button>
      </div>
    );
  }
}
