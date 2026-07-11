import React from 'react';
import ROIAnalysis from './pages/ROIAnalysis';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const details = {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      timestamp: new Date().toISOString(),
    };
    console.error('[ErrorBoundary] React render error:', details);
    window.electronAPI?.logError?.({ source: 'react-boundary', ...details }).catch?.(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40, height: '100vh', boxSizing: 'border-box',
          background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--danger)', marginBottom: 12 }}>
            The app encountered an unexpected error
          </div>
          <pre style={{
            fontSize: 11, opacity: 0.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 300, overflow: 'auto', marginBottom: 24,
            background: 'var(--bg-card)', padding: 12, borderRadius: 6,
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Error details were written to the debug log in the app data folder.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px', cursor: 'pointer', fontSize: 13,
              borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  titlebar: {
    height: 38,
    flexShrink: 0,
    WebkitAppRegion: 'drag',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 24,
  },
};

export default function App() {
  return (
    <div style={styles.container}>
      <div style={styles.titlebar} />
      <div style={styles.content}>
        <ErrorBoundary>
          <ROIAnalysis />
        </ErrorBoundary>
      </div>
    </div>
  );
}
