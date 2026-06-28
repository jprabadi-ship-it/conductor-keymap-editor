import { useState, useEffect, useRef, useCallback } from 'react';

export type LogLevel = 'INF' | 'WRN' | 'ERR' | 'AML';
type FilterType = 'ALL' | 'AML' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

function formatTime(d: Date): string {
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

let globalLog: (level: LogLevel, source: string, message: string) => void = () => {};

export function debugLog(level: LogLevel, source: string, message: string) {
  globalLog(level, source, message);
}

interface Props {
  visible: boolean;
}

export function DebugConsole({ visible }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'aml'>('console');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [height, setHeight] = useState(220);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastY = useRef(0);

  const addLog = useCallback((level: LogLevel, source: string, message: string) => {
    setLogs(prev => [...prev.slice(-200), { timestamp: formatTime(new Date()), level, source, message }]);
  }, []);

  useEffect(() => {
    globalLog = addLog;
    addLog('INF', 'Editor', 'Debug console initialized');
    addLog('INF', 'Editor', 'USB not ready, clearing auto-write callback. State: disconnected');
    return () => { globalLog = () => {}; };
  }, [addLog]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastY.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = lastY.current - ev.clientY;
      lastY.current = ev.clientY;
      setHeight(prev => Math.max(100, Math.min(500, prev + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const filteredLogs = logs.filter(log => {
    if (activeTab === 'aml') return log.level === 'AML';
    switch (filter) {
      case 'ALL': return true;
      case 'AML': return log.level === 'AML';
      case 'INFO': return log.level === 'INF';
      case 'WARN': return log.level === 'WRN';
      case 'ERROR': return log.level === 'ERR';
    }
  });

  if (!visible) return null;

  const levelColor = (level: LogLevel) => {
    switch (level) {
      case 'INF': return 'var(--info)';
      case 'WRN': return 'var(--warning)';
      case 'ERR': return 'var(--danger)';
      case 'AML': return 'var(--led-magenta)';
    }
  };

  const filters: FilterType[] = ['ALL', 'AML', 'INFO', 'WARN', 'ERROR'];

  return (
    <div className="debug-console" style={{ height }}>
      <div className="debug-console-resize" onMouseDown={onResizeStart} />
      <div className="debug-console-header">
        <div className="debug-console-tabs">
          <button
            className={`debug-tab ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >Console</button>
          <button
            className={`debug-tab ${activeTab === 'aml' ? 'active' : ''}`}
            onClick={() => setActiveTab('aml')}
          >AML</button>
        </div>
        {activeTab === 'console' && (
          <div className="debug-console-filters">
            {filters.map(f => (
              <button
                key={f}
                className={`debug-filter ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >{f}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-icon"
          style={{ fontSize: 10, width: 24, height: 24 }}
          onClick={() => setLogs([])}
          title="Clear"
        >🗑</button>
      </div>
      <div className="debug-console-logs" ref={scrollRef}>
        {filteredLogs.map((log, i) => (
          <div key={i} className="debug-log-entry">
            <span className="debug-log-time">{log.timestamp}</span>
            <span className="debug-log-level" style={{ color: levelColor(log.level) }}>{log.level}</span>
            <span className="debug-log-source">[{log.source}]</span>
            <span className="debug-log-msg">{log.message}</span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: 8, fontSize: 11 }}>No log entries</div>
        )}
      </div>
    </div>
  );
}
