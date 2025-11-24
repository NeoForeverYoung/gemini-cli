import { useState, useRef, useEffect } from 'react';
import { Terminal, Plus, FolderOpen, History, MonitorPlay, X } from 'lucide-react';
import './SessionTabs.css';

export interface SessionTab {
  id: string;
  name: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onResumeSession: () => void;
  onOpenFolder?: () => void;
  onClose?: (sessionId: string) => void;
}

export function SessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onNewSession,
  onResumeSession,
  onOpenFolder,
  onClose,
}: SessionTabsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNewSession = () => {
    setIsMenuOpen(false);
    onNewSession();
  };

  const handleResumeSession = () => {
    setIsMenuOpen(false);
    onResumeSession();
  };

  const handleOpenFolder = () => {
    setIsMenuOpen(false);
    onOpenFolder?.();
  };

  return (
    <div className="session-tabs">
      <div className="tabs-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`tab ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelect(session.id)}
            title={session.name}
          >
            <span className="tab-icon">
              <Terminal size={14} />
            </span>
            <span className="tab-title">{session.name}</span>
            {onClose && sessions.length > 1 && (
              <button
                className="close-tab-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="new-tab-container" ref={menuRef}>
        <button
          className="new-tab-button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          title="New..."
        >
          <Plus size={16} />
        </button>
        {isMenuOpen && (
          <div className="dropdown-menu">
            <button className="dropdown-item" onClick={handleNewSession}>
              <MonitorPlay size={14} />
              New Session
            </button>
            <button className="dropdown-item" onClick={handleResumeSession}>
              <History size={14} />
              Resume Session...
            </button>
            {onOpenFolder && (
              <button className="dropdown-item" onClick={handleOpenFolder}>
                <FolderOpen size={14} />
                Open Folder...
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
