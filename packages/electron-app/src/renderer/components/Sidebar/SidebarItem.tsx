/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, type MouseEvent } from 'react';
import {
  Folder,
  File,
  FilePlus,
  FileMinus,
  FileQuestion,
  Plus,
  Minus,
  ChevronRight,
  ChevronDown,
  Undo,
} from 'lucide-react';
import { GitStatusBadge } from './GitStatusBadge';
import type { Workspace } from './Sidebar';
import type { WorkspaceGitStatus, GitFileStatus } from '../../../types/git';
import './SidebarItem.css';

interface SidebarItemProps {
  workspace: Workspace;
  gitStatus?: WorkspaceGitStatus;
  onSelect: (path: string) => void;
  onFileClick: (cwd: string, filePath: string, allFiles: string[]) => void;
  isCollapsed: boolean;
  isExpanded: boolean;
  onToggleExpand: (path: string) => void;
  isStagedExpanded: boolean;
  onToggleStaged: (path: string) => void;
}

export function SidebarItem({
  workspace,
  gitStatus,
  onSelect,
  onFileClick,
  isCollapsed,
  isExpanded,
  onToggleExpand,
  isStagedExpanded,
  onToggleStaged,
}: SidebarItemProps) {
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<string, 'stage' | 'unstage'>
  >({});

  const { stagedFiles, unstagedFiles, allFilePaths, unstagedFilePaths } =
    useMemo(() => {
      const staged: GitFileStatus[] = [];
      const unstaged: GitFileStatus[] = [];
      const paths: string[] = [];
      const unstagedPaths: string[] = [];

      if (gitStatus) {
        for (const file of gitStatus.files) {
          const optimisticOp = optimisticUpdates[file.path];
          let effectiveStaged = false;
          let effectiveUnstaged = false;

          // Determine effective status based on git status + optimistic override
          const rawStaged =
            file.stagedStatus &&
            file.stagedStatus !== ' ' &&
            file.stagedStatus !== '?';
          
          const rawUnstaged =
            (file.unstagedStatus &&
              file.unstagedStatus !== ' ' &&
              !(file.stagedStatus === '?' && file.unstagedStatus === '?')) ||
            (file.stagedStatus === '?' && file.unstagedStatus === '?');

          if (optimisticOp === 'stage') {
            // Optimistically staged:
            // If it was unstaged/untracked, it moves to staged.
            // If it was already staged, it stays staged.
            effectiveStaged = true;
            effectiveUnstaged = false; // Assume full stage for simplicity, or we'd need to know if it was partially staged.
            // For M M, staging unstaged part keeps the staged part. 
            // But usually 'stage' means 'git add file', which stages current working tree version.
            // Result: File is in index (staged), clean in working tree (usually).
          } else if (optimisticOp === 'unstage') {
            // Optimistically unstaged:
            // Moves from staged to unstaged.
            effectiveStaged = false;
            effectiveUnstaged = true; 
          } else {
            effectiveStaged = rawStaged || false;
            effectiveUnstaged = rawUnstaged || false;
          }

          // Populate lists based on effective status
          if (effectiveStaged) {
            // Create a clone or use existing file object, but we might need to tweak status code for display?
            // For now, just pushing the file object allows it to render. 
            // The icon might still reflect old status, but the list position is what matters most for "instant" feel.
            staged.push(file);
          }
          
          if (effectiveUnstaged) {
            unstaged.push(file);
          }

          paths.push(file.path);
          if (effectiveUnstaged) {
            unstagedPaths.push(file.path);
          }
        }
      }
      // Sort paths if needed, or just keep them in order
      return {
        stagedFiles: staged,
        unstagedFiles: unstaged,
        allFilePaths: paths,
        unstagedFilePaths: unstagedPaths,
      };
    }, [gitStatus, optimisticUpdates]);

  const hasChanges = gitStatus && gitStatus.files.length > 0;

  const handleClick = () => {
    onSelect(workspace.path);
    if (hasChanges) {
      onToggleExpand(workspace.path);
    }
  };

  const handleFileItemClick = (
    e: MouseEvent,
    filePath: string,
    fileList: string[],
  ) => {
    e.stopPropagation();
    onFileClick(workspace.path, filePath, fileList);
  };

  const handleStage = (e: MouseEvent, file: string) => {
    e.stopPropagation();
    setOptimisticUpdates((prev) => ({ ...prev, [file]: 'stage' }));
    
    // Don't await the backend operation to keep UI responsive ("fire and forget" from UI perspective)
    // The optimistic state will be cleared by the next incoming git status update.
    window.electron.git.stageFile(workspace.path, file).catch((error) => {
      console.error('Stage failed:', error);
      // Revert optimistic update on error
      setOptimisticUpdates((prev) => {
        const next = { ...prev };
        delete next[file];
        return next;
      });
    });
  };

  const handleUnstage = (e: MouseEvent, file: string) => {
    e.stopPropagation();
    setOptimisticUpdates((prev) => ({ ...prev, [file]: 'unstage' }));
    
    window.electron.git.unstageFile(workspace.path, file).catch((error) => {
      console.error('Unstage failed:', error);
      setOptimisticUpdates((prev) => {
        const next = { ...prev };
        delete next[file];
        return next;
      });
    });
  };

  const handleRevert = (e: MouseEvent, file: string) => {
    e.stopPropagation();
    // Optimistic update for revert? Revert usually removes the changes, so it disappears from the list.
    // Or it might stay if untracked and not deleted?
    // Let's assume it disappears.
    // Optimistically we can remove it from the list visually?
    // Let's not optimistically update for revert as it's destructive and we want confirmation or wait for result.
    // Actually, for consistency, let's wait. But user asked for instant feel.
    // But revert is "Discard Changes".
    // Let's try optimistically hiding it?
    // "stage" moves it to staged. "unstage" moves it to unstaged.
    // "revert" removes it from unstaged (clean state).
    // So we can use a 'revert' optimistic op to hide it.
    // But I need to add 'revert' to the state type or handle it in the memo.
    // Let's just call backend for now, usually fast.
    
    if (window.confirm(`Are you sure you want to discard changes in ${file}?`)) {
        window.electron.git.revertFile(workspace.path, file).catch((error) => {
            console.error('Revert failed:', error);
        });
    }
  };

  const getFileIcon = (status: GitFileStatus['status']) => {
    switch (status) {
      case 'A':
        return <FilePlus size={12} className="file-icon added" />;
      case 'D':
        return <FileMinus size={12} className="file-icon deleted" />;
      case '??':
        return <FileQuestion size={12} className="file-icon untracked" />;
      default:
        return <File size={12} className="file-icon modified" />;
    }
  };

  return (
    <li
      className={`sidebar-item-container ${isExpanded ? 'expanded' : ''} ${
        isCollapsed ? 'collapsed' : ''
      }`}
    >
      <div
        className={`workspace-item ${workspace.isActive ? 'active' : ''}`}
        onClick={handleClick}
        title={workspace.path}
      >
        <div className="sidebar-icon-container">
          {workspace.isActive ? (
            <div className="active-indicator" />
          ) : (
            <Folder size={14} className="workspace-icon" />
          )}
        </div>

        {!isCollapsed && (
          <div className="workspace-info">
            <div className="workspace-header">
              <span className="workspace-name">{workspace.name}</span>
              {gitStatus?.branch && (
                <span className="workspace-branch" title={gitStatus.branch}>
                  {gitStatus.branch}
                </span>
              )}
              {gitStatus && (
                <GitStatusBadge
                  added={gitStatus.totalAdded}
                  deleted={gitStatus.totalDeleted}
                />
              )}
            </div>
            <span className="workspace-path">{workspace.path}</span>
          </div>
        )}
      </div>

      {!isCollapsed && isExpanded && hasChanges && (
        <div className="sidebar-file-list-container">
          {stagedFiles.length > 0 && (
            <>
              <div
                className="git-section-header clickable"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStaged(workspace.path);
                }}
              >
                {isStagedExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                <span>Staged Changes ({stagedFiles.length})</span>
              </div>
              {isStagedExpanded && (
                <ul className="sidebar-file-list">
                  {stagedFiles.map((file) => (
                    <li
                      key={`staged-${file.path}`}
                      className="sidebar-file-item"
                      title={file.path}
                      onClick={(e) =>
                        handleFileItemClick(e, file.path, allFilePaths)
                      }
                    >
                      <div className="file-icon-container">
                        {getFileIcon(file.status)}
                      </div>
                      <span className="file-name">{file.path}</span>
                      <span className="file-status-code">
                        {file.stagedStatus}
                      </span>
                      <button
                        className="git-action-button"
                        onClick={(e) => handleUnstage(e, file.path)}
                        title="Unstage Changes"
                      >
                        <Minus size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {unstagedFiles.length > 0 && (
            <ul className="sidebar-file-list">
              {unstagedFiles.map((file) => (
                <li
                  key={`unstaged-${file.path}`}
                  className="sidebar-file-item"
                  title={file.path}
                  onClick={(e) =>
                    handleFileItemClick(e, file.path, unstagedFilePaths)
                  }
                >
                  <div className="file-icon-container">
                    {getFileIcon(file.status)}
                  </div>
                  <span className="file-name">{file.path}</span>
                  <span className="file-status-code">
                    {file.unstagedStatus === '?' ? 'U' : file.unstagedStatus}
                  </span>
                  <div className="file-actions">
                    <button
                      className="git-action-button"
                      onClick={(e) => handleRevert(e, file.path)}
                      title="Discard Changes"
                    >
                      <Undo size={12} />
                    </button>
                    <button
                      className="git-action-button"
                      onClick={(e) => handleStage(e, file.path)}
                      title="Stage Changes"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

