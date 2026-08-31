import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button, Card } from './index';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React Error Boundary Caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans relative overflow-hidden">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <Card className="max-w-md w-full bg-slate-900/90 border-slate-800 p-8 shadow-2xl relative z-10 backdrop-blur-xl rounded-3xl text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto shadow-xl shadow-rose-950/40">
              <AlertTriangle className="w-8 h-8 animate-bounce" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                Application Exception
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">Unable to Load Page</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected error occurred while rendering this page. The system has prevented a blank screen.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-left text-[11px] font-mono text-rose-300 space-y-1 overflow-x-auto max-h-32">
                <p className="font-bold text-slate-400 uppercase text-[9px]">Error Message:</p>
                <p className="break-all">{this.state.error.toString()}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="brand"
                onClick={this.handleReset}
                className="py-3 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50"
                icon={<RefreshCw className="w-4 h-4 mr-1" />}
              >
                Retry Page
              </Button>

              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="py-3 text-xs font-bold border-slate-800 text-slate-300 hover:bg-slate-800"
                icon={<Home className="w-4 h-4 mr-1" />}
              >
                Return Home
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
