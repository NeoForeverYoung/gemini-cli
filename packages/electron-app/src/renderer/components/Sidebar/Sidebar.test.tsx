/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar, type Workspace } from './Sidebar';

const { useGitStatus } = vi.hoisted(() => {
  return { useGitStatus: vi.fn(() => ({})) };
});

vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }));

describe('Sidebar', () => {
  const mockOnSelect = vi.fn();
  const mockOnAddDirectory = vi.fn();
  const mockOnChangeDirectory = vi.fn();
  const mockOnOpenSettings = vi.fn();
  const mockOnGoHome = vi.fn();
  const mockIsWorkspaceExpanded = vi.fn(() => false);
  const mockOnToggleWorkspace = vi.fn();
  const mockIsStagedExpanded = vi.fn(() => false);
  const mockOnToggleStaged = vi.fn();
  const mockOnSetActiveToolsTab = vi.fn();

  const workspaces: Workspace[] = [
    { path: '/path/to/workspace1', name: 'workspace1', isActive: true },
    { path: '/path/to/workspace2', name: 'workspace2', isActive: false },
  ];

  const defaultProps = {
    workspaces,
    onSelect: mockOnSelect,
    onFileClick: vi.fn(),
    onAddDirectory: mockOnAddDirectory,
    onChangeDirectory: mockOnChangeDirectory,
    onOpenSettings: mockOnOpenSettings,
    onGoHome: mockOnGoHome,
    isWorkspaceExpanded: mockIsWorkspaceExpanded,
    onToggleWorkspace: mockOnToggleWorkspace,
    isStagedExpanded: mockIsStagedExpanded,
    onToggleStaged: mockOnToggleStaged,
    activeToolsTab: 'git' as 'git' | 'mcp' | 'extensions',
    onSetActiveToolsTab: mockOnSetActiveToolsTab,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsWorkspaceExpanded.mockReturnValue(false);
    mockIsStagedExpanded.mockReturnValue(false);
  });

  it('renders workspaces with paths', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('workspace1')).toBeInTheDocument();
    expect(screen.getByText('workspace2')).toBeInTheDocument();
  });

  it('highlights the active workspace', () => {
    const { container } = render(<Sidebar {...defaultProps} />);
    const activeItem = container.querySelector('.workspace-item.active');
    expect(activeItem).toHaveTextContent('workspace1');
    expect(activeItem?.querySelector('.active-indicator')).toBeInTheDocument();
  });

  it('calls onSelect when a workspace is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('workspace2'));
    expect(mockOnSelect).toHaveBeenCalledWith('/path/to/workspace2');
  });

  it('renders footer buttons', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByTitle('Add Directory')).toBeInTheDocument();
    expect(screen.getByText('Add directory')).toBeInTheDocument();
    expect(screen.getByTitle('Change Directory')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
  });

  it('calls onAddDirectory when add button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Add Directory'));
    expect(mockOnAddDirectory).toHaveBeenCalled();
  });

  it('calls onChangeDirectory when change directory button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Change Directory'));
    expect(mockOnChangeDirectory).toHaveBeenCalled();
  });

  it('calls onOpenSettings when settings button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(mockOnOpenSettings).toHaveBeenCalled();
  });

  it('toggles collapse state', () => {
    render(<Sidebar {...defaultProps} />);
    const toggleButton = screen.getByTitle('Collapse Sidebar');

    // Initially expanded
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('Add directory')).toBeInTheDocument();

    // Collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByText('Directories')).not.toBeInTheDocument();
    expect(screen.queryByText('Add directory')).not.toBeInTheDocument();
    expect(screen.getByTitle('Expand Sidebar')).toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByTitle('Expand Sidebar'));
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('Add directory')).toBeInTheDocument();
  });
});
