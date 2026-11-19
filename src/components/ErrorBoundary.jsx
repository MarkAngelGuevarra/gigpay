import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[GigPay ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[75vh] items-center justify-center px-4 py-12">
          <div className="gp-card max-w-md border-[var(--signal-danger-border)] p-7 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--signal-danger-bg)] text-[var(--signal-danger)]">
              <AlertTriangle size={24} />
            </div>
            <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">Something went wrong</h2>
            <p className="mt-2 mb-6 text-[14px] text-[var(--text-muted)]">
              An unexpected display error occurred. Reload to restore your workspace cleanly.
            </p>
            <button type="button" onClick={this.handleReload} className="gp-btn gp-btn-primary gp-btn-lg">
              <RefreshCw size={15} />
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
