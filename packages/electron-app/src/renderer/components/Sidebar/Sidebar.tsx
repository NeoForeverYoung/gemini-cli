/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  FolderInput,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
} from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { ToolsPane } from './ToolsPane';
import { useGitStatus } from '../../hooks/useGitStatus';
import './Sidebar.css';

export interface Workspace {
  path: string;
  name: string;
  isActive: boolean;
}

interface SidebarProps {
  workspaces: Workspace[];
  onSelect: (path: string) => void;
  onFileClick: (cwd: string, filePath: string, allFiles: string[]) => void;
  onAddDirectory: () => void;
  onChangeDirectory: () => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
  isWorkspaceExpanded: (path: string) => boolean;
  onToggleWorkspace: (path: string) => void;
  isStagedExpanded: (path: string) => boolean;
  onToggleStaged: (path: string) => void;
  activeToolsTab: 'git' | 'mcp';
  onSetActiveToolsTab: (tab: 'git' | 'mcp') => void;
  style?: React.CSSProperties;
  isResizing?: boolean;
}

export function Sidebar({
  workspaces,
  onSelect,
  onFileClick,
  onAddDirectory,
  onChangeDirectory,
  onOpenSettings,
  onGoHome,
  isWorkspaceExpanded,
  onToggleWorkspace,
  isStagedExpanded,
  onToggleStaged,
  activeToolsTab,
  onSetActiveToolsTab,
  style,
  isResizing = false,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  const workspacePaths = useMemo(
    () => workspaces.map((w) => w.path),
    [workspaces],
  );
  const gitStatuses = useGitStatus(workspacePaths);
  const activeWorkspacePath = workspaces.find((w) => w.isActive)?.path;

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div
      className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${!isResizing ? 'transitioning' : ''}`}
      style={isCollapsed ? undefined : style}
    >
      <div className="sidebar-home">
        <button className="sidebar-button" onClick={onGoHome} title="Go Home">
          <Home size={16} />
        </button>
      </div>
      <div className="sidebar-header">
        {!isCollapsed && <span>Directories</span>}
      </div>
      <ul className="workspace-list">
        {workspaces.map((workspace) => (
          <SidebarItem
            key={workspace.path}
            workspace={workspace}
            gitStatus={gitStatuses[workspace.path]}
            onSelect={onSelect}
            onFileClick={onFileClick}
            isCollapsed={isCollapsed}
            isExpanded={isWorkspaceExpanded(workspace.path)}
            onToggleExpand={onToggleWorkspace}
            isStagedExpanded={isStagedExpanded(workspace.path)}
            onToggleStaged={onToggleStaged}
          />
        ))}
      </ul>
      <div className="sidebar-divider" />
      <ToolsPane
        isCollapsed={isCollapsed}
        activeWorkspacePath={activeWorkspacePath}
        gitStatus={
          activeWorkspacePath ? gitStatuses[activeWorkspacePath] : undefined
        }
        activeTab={activeToolsTab}
        onSetActiveTab={onSetActiveToolsTab}
      />
      <div className="sidebar-footer">
        <button
          className="sidebar-button add-directory-button"
          onClick={onAddDirectory}
          title="Add Directory"
        >
          <Plus size={16} />
          {!isCollapsed && <span>Add directory</span>}
        </button>
        <div className="spacer" />
        <button
          className="sidebar-button"
          onClick={onChangeDirectory}
          title="Change Directory"
        >
          <FolderInput size={16} />
        </button>
        <button
          className="sidebar-button"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={16} />
        </button>
        <button
          className="sidebar-button toggle-button"
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
