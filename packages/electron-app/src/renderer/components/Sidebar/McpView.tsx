/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Server } from 'lucide-react';
import { useMcpServers } from '../../hooks/useMcpServers';
import './SidebarItem.css';

interface McpViewProps {
  isCollapsed: boolean;
}

export function McpView({ isCollapsed }: McpViewProps) {
  const { servers, isLoading, error } = useMcpServers();

  if (isLoading) {
    return (
      <div
        className="sidebar-message"
        style={{ padding: '10px', opacity: 0.7, fontSize: '12px' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="sidebar-message error"
        style={{
          padding: '10px',
          opacity: 0.7,
          fontSize: '12px',
          color: 'var(--error-color, #ff6b6b)',
        }}
      >
        Error loading servers
      </div>
    );
  }

  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    return (
      <div
        className="sidebar-message"
        style={{ padding: '10px', opacity: 0.7, fontSize: '12px' }}
      >
        No configured servers
      </div>
    );
  }

  return (
    <ul className="workspace-list">
      {serverNames.map((name) => {
        const server = servers[name];
        const type = server.url ? 'SSE' : 'stdio';

        return (
          <li key={name} className="sidebar-item-container">
            <div className="workspace-item" title={`${name} (${type})`}>
              <div className="sidebar-icon-container">
                <Server size={16} className="workspace-icon" />
              </div>
              {!isCollapsed && (
                <div className="workspace-info">
                  <div className="workspace-header">
                    <span className="workspace-name">{name}</span>
                  </div>
                  <span className="workspace-path">{type}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
