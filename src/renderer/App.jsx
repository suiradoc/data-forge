import ROIAnalysis from './pages/ROIAnalysis';

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
        <ROIAnalysis />
      </div>
    </div>
  );
}
