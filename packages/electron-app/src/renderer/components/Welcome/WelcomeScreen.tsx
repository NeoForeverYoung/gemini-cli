/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  MessageSquarePlus,
  Clock,
  Sparkles,
  X,
  Terminal,
  ArrowRight,
  History,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { shortAsciiLogo } from '@google/gemini-cli/dist/src/ui/components/AsciiArt.js';
import type { Session } from '../../../types/session';
import type { CliSettings } from '../../main/config/types';
import { useSettings } from '../../contexts/SettingsContext';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onNavigate: (view: 'workspace') => void;
  onSelectSession: (session: Session) => void;
}

export function WelcomeScreen({
  onNavigate,
  onSelectSession,
}: WelcomeScreenProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [changelog, setChangelog] = useState<string>('');
  const [showChangelog, setShowChangelog] = useState(false);
  const { settings, refreshSettings } = useSettings();
  const currentPath = (settings?.merged as CliSettings)?.terminalCwd || '';

  useEffect(() => {
    const loadData = async () => {
      try {
        const recentSessions = await window.electron.sessions.getRecent();
        setSessions(recentSessions);
      } catch (error) {
        console.error('Failed to load sessions:', error);
      }

      try {
        const changelogContent = await window.electron.changelog.get();
        // Parse changelog to get only the latest version
        // Assuming format:
        // # Changelog
        //
        // ## [1.0.1] - 2023-10-27
        // ...
        //
        // ## [1.0.0] - 2023-10-26
        // ...

        // Find the first H2 (## )
        const lines = changelogContent.split('\n');
        let latestChangelog = '';
        let foundFirstVersion = false;

        for (const line of lines) {
          if (line.startsWith('## ')) {
            if (foundFirstVersion) {
              break; // Found the second version header, stop
            }
            foundFirstVersion = true;
          }
          if (foundFirstVersion) {
            latestChangelog += line + '\n';
          }
        }

        if (!latestChangelog) {
          latestChangelog = changelogContent;
        }

        setChangelog(latestChangelog);
      } catch (error) {
        console.error('Failed to load changelog:', error);
      }
    };

    loadData();
  }, []);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  const handleNewSession = () => {
    onNavigate('workspace');
  };

  const handleChangeDirectory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const path = await window.electron.openDirectory();
      if (path) {
        await window.electron.settings.set({ changes: { terminalCwd: path } as Partial<CliSettings> });
        await refreshSettings();
      }
    } catch (error) {
      console.error('Failed to change directory:', error);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete session "${session.tag}"?`)) {
      try {
        await window.electron.sessions.delete(session.hash, session.tag);
        setSessions((prev) => prev.filter((s) => !(s.hash === session.hash && s.tag === session.tag)));
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
  };

  return (
    <div className="welcome-screen">
      {/* Main Content Layer */}
      <div className={`welcome-content ${showChangelog ? 'blurred' : ''}`}>
        <div className="welcome-hero">
          <div className="logo-container">
            <pre className="ascii-logo">{shortAsciiLogo}</pre>
          </div>
          <p className="welcome-subtitle">
            Your AI-powered command line companion
          </p>
        </div>

        <div className="welcome-grid">
          {/* Primary Action: New Session */}
          <div
            className="welcome-card new-session-card"
            onClick={handleNewSession}
          >
            <div className="new-session-content">
              <div className="card-icon-large">
                <Terminal size={32} />
              </div>
              <div className="card-text">
                <h2>Start Coding</h2>
                <p>Initialize a new session with a fresh context.</p>
              </div>
            </div>

            <div className="path-selector-container">
              <button
                className="path-selector"
                onClick={handleChangeDirectory}
                title={currentPath}
              >
                <FolderOpen size={14} className="path-icon" />
                <span className="path-value">
                  {currentPath
                    ? currentPath.split(/[/\\]/).pop()
                    : 'Select Folder...'}
                </span>
                <span className="path-change-label">Change</span>
              </button>
            </div>

            <div className="card-action">
              <ArrowRight size={20} />
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="welcome-card recent-sessions-card">
            <div className="card-header">
              <History size={18} />
              <h3>Recent Activity</h3>
            </div>
            <div className="sessions-list">
              {sessions.length === 0 ? (
                <div className="no-sessions">
                  <Clock size={24} />
                  <p>No recent sessions found.</p>
                </div>
              ) : (
                sessions.slice(0, 5).map((session) => (
                  <div
                    key={`${session.hash}-${session.tag}`}
                    className="session-item-container"
                  >
                    <button
                      className="session-item"
                      onClick={() => onSelectSession(session)}
                    >
                      <div className="session-info">
                        <span className="session-tag">{session.tag}</span>
                        <span
                          className="session-project"
                          title={session.projectPath}
                        >
                          {session.projectPath.split('/').pop()}
                        </span>
                      </div>
                      <span className="session-date">
                        {formatDate(session.mtime)}
                      </span>
                    </button>
                    <button
                      className="delete-session-button"
                      onClick={(e) => handleDeleteSession(e, session)}
                      title="Delete Session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="welcome-footer">
          <span className="version-tag">v1.0.0</span>
          <button
            className="whats-new-button"
            onClick={() => setShowChangelog(true)}
          >
            <Sparkles size={14} />
            <span>What's New</span>
          </button>
        </div>
      </div>

      {/* Changelog Overlay */}
      {showChangelog && (
        <div
          className="changelog-overlay"
          onClick={() => setShowChangelog(false)}
        >
          <div
            className="changelog-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="changelog-header">
              <div className="changelog-title">
                <Sparkles size={20} className="accent-icon" />
                <h2>Latest Updates</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowChangelog(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="changelog-scroll-area">
              <div className="changelog-content">
                <ReactMarkdown>{changelog}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
