'use client';

import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export class CalibTestErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CALIB-TEST] error caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-300 rounded text-red-800">
          <h2 className="font-bold mb-2">[CALIB-TEST] 테스트 페이지 오류</h2>
          <p className="text-sm mb-2">
            이 오류는 테스트 페이지 내부에서만 발생했으며 운영 화면에는 영향이 없습니다.
          </p>
          <pre className="text-xs whitespace-pre-wrap">{this.state.error?.message}</pre>
          <button
            type="button"
            className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            초기화
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
