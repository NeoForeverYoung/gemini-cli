/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GitGraph, Database, Blocks } from 'lucide-react';
import { McpView } from './McpView';
import { GitView } from './GitView';
import { ExtensionsView } from './ExtensionsView';
import { useExtensions } from '../../hooks/useExtensions';
import type { WorkspaceGitStatus } from '../../../types/git';
import './Sidebar.css';

interface ToolsPaneProps {
  isCollapsed: boolean;
  activeWorkspacePath?: string;
  gitStatus?: WorkspaceGitStatus;
  activeTab: 'git' | 'mcp' | 'extensions';
  onSetActiveTab: (tab: 'git' | 'mcp' | 'extensions') => void;
}

export function ToolsPane({
  isCollapsed,
  activeWorkspacePath,
  gitStatus,
  activeTab,
  onSetActiveTab,
}: ToolsPaneProps) {
  const { extensions } = useExtensions();

  return (
    <div className="tools-pane">
      <div className="tools-tabs">
        <button
          className={`tools-tab ${activeTab === 'git' ? 'active' : ''}`}
          onClick={() => onSetActiveTab('git')}
          title="Git History"
        >
          <GitGraph size={14} />
          {!isCollapsed && <span>History</span>}
        </button>
        <button
          className={`tools-tab ${activeTab === 'extensions' ? 'active' : ''}`}
          onClick={() => onSetActiveTab('extensions')}
          title="Extensions"
        >
          <Blocks size={14} />
          {!isCollapsed && (
            <div className="tab-label-container">
              <span>Exts</span>
              {extensions.length > 0 && (
                <div className="tab-badge">
                  <span className="tab-badge-count">{extensions.length}</span>
                </div>
              )}
            </div>
          )}
        </button>
        <button
          className={`tools-tab ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => onSetActiveTab('mcp')}
          title="MCP"
        >
          <Database size={14} />
          {!isCollapsed && <span>MCP</span>}
        </button>
      </div>
      <div className="tools-content">
        {activeTab === 'git' && (
          <GitView activeWorkspacePath={activeWorkspacePath} />
        )}
        {activeTab === 'mcp' && <McpView isCollapsed={isCollapsed} />}
        {activeTab === 'extensions' && (
          <ExtensionsView isCollapsed={isCollapsed} />
        )}
      </div>
    </div>
  );
}
