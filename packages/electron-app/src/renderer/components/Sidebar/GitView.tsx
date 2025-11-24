/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useGitHistory } from '../../hooks/useGitHistory';
import type { WorkspaceGitStatus } from '../../../types/git';
import './SidebarItem.css';

interface GitViewProps {
  activeWorkspacePath?: string;
  gitStatus?: WorkspaceGitStatus;
}

export function GitView({ activeWorkspacePath }: GitViewProps) {
  const { history, isLoading: historyLoading } =
    useGitHistory(activeWorkspacePath);

  if (!activeWorkspacePath) {
    return (
      <div
        className="sidebar-message"
        style={{ padding: '10px', opacity: 0.7, fontSize: '12px' }}
      >
        Select a workspace
      </div>
    );
  }

  return (
    <div
      className="git-view-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {/* History */}
      <div
        className="git-history-section"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        <div className="git-section-header">History</div>
        {historyLoading ? (
          <div className="git-empty-message">Loading...</div>
        ) : (
          <ul className="workspace-list">
            {history.map((commit) => (
              <li key={commit.hash} className="sidebar-item-container">
                <div
                  className="workspace-item"
                  title={`${commit.message} - ${commit.author} (${commit.date})`}
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '4px 10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {commit.message}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      fontSize: '9px',
                      opacity: 0.6,
                    }}
                  >
                    <span>{commit.author}</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {commit.hash}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
