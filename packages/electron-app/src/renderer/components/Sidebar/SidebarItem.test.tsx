/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SidebarItem } from './SidebarItem';
import type { WorkspaceGitStatus } from '../../../types/git';

describe('SidebarItem', () => {
  const mockOnSelect = vi.fn();
  const mockOnFileClick = vi.fn();
  const workspace = {
    path: '/path/to/workspace',
    name: 'workspace',
    isActive: false,
  };

  it('renders workspace name', () => {
    render(
      <SidebarItem
        workspace={workspace}
        onSelect={mockOnSelect}
        onFileClick={mockOnFileClick}
        isCollapsed={false}
      />,
    );
    expect(screen.getByText('workspace')).toBeInTheDocument();
  });

  it('renders git status badge', () => {
    const gitStatus: WorkspaceGitStatus = {
      path: '/path/to/workspace',
      totalAdded: 10,
      totalDeleted: 5,
      files: [],
    };
    render(
      <SidebarItem
        workspace={workspace}
        gitStatus={gitStatus}
        onSelect={mockOnSelect}
        onFileClick={mockOnFileClick}
        isCollapsed={false}
      />,
    );
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('expands and shows files', () => {
    const gitStatus: WorkspaceGitStatus = {
      path: '/path/to/workspace',
      totalAdded: 10,
      totalDeleted: 5,
      files: [
        {
          path: 'file1.ts',
          added: 10,
          deleted: 0,
          status: 'M',
          stagedStatus: ' ',
          unstagedStatus: 'M',
        },
        {
          path: 'file2.ts',
          added: 0,
          deleted: 5,
          status: 'D',
          stagedStatus: ' ',
          unstagedStatus: 'D',
        },
      ],
    };
    render(
      <SidebarItem
        workspace={workspace}
        gitStatus={gitStatus}
        onSelect={mockOnSelect}
        onFileClick={mockOnFileClick}
        isCollapsed={false}
      />,
    );

    // Click the workspace item to expand
    fireEvent.click(screen.getByText('workspace'));

    expect(screen.getByText('file1.ts')).toBeInTheDocument();
    expect(screen.getByText('file2.ts')).toBeInTheDocument();
  });
});
