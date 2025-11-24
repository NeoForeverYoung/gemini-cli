/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';

// Mock the SettingsContext
const mockRefreshSettings = vi.fn();
const mockSettings = {
  merged: {
    terminalCwd: '/test/cwd',
  },
};

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mockSettings,
    refreshSettings: mockRefreshSettings,
  }),
}));

describe('WelcomeScreen', () => {
  const mockOnNavigate = vi.fn();
  const mockOnSelectSession = vi.fn();

  const mockSessions = [
    {
      tag: 'session1',
      projectPath: '/path/to/project1',
      mtime: '2023-01-01T12:00:00Z',
      hash: 'hash1',
      sessionId: 'session-uuid-1',
    },
  ];

  const mockChangelog = '# Changelog\n\n- Feature 1';

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    global.__APP_VERSION__ = '1.2.3';
    window.electron = {
      sessions: {
        getRecent: vi.fn().mockResolvedValue(mockSessions),
      },
      changelog: {
        get: vi.fn().mockResolvedValue(mockChangelog),
      },
      settings: {
        restartTerminal: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ merged: { terminalCwd: '/test/cwd' } }),
        set: vi.fn().mockResolvedValue(undefined),
      },
      openDirectory: vi.fn().mockResolvedValue('/new/path'),
    } as any;
  });

  it('renders welcome subtitle and version', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );
    expect(
      screen.getByText('Your AI-powered command line companion'),
    ).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('renders "Start Coding" card with current path', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );
    expect(screen.getByText('Start Coding')).toBeInTheDocument();
    expect(screen.getByText('cwd')).toBeInTheDocument(); // /test/cwd -> cwd
  });

  it('renders recent sessions', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('session1')).toBeInTheDocument();
      expect(screen.getByText('project1')).toBeInTheDocument();
    });
  });

  it('opens changelog modal when "What\'s New" is clicked', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );

    // Changelog should be hidden initially
    expect(screen.queryByText('Latest Updates')).not.toBeInTheDocument();

    // Click the button
    fireEvent.click(screen.getByText("What's New"));

    // Should be visible now
    await waitFor(() => {
      expect(screen.getByText('Latest Updates')).toBeInTheDocument();
      expect(screen.getByText('Feature 1')).toBeInTheDocument();
    });
  });

  it('calls restartTerminal and onNavigate when a session is clicked', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('session1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('session1'));
    // Note: The component calls onSelectSession prop, which is passed from App.tsx.
    // App.tsx handles the restartTerminal call. The component itself *also* has logic for new sessions,
    // but for existing sessions it delegates.
    expect(mockOnSelectSession).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('calls onNavigate when "Start Coding" is clicked', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );
    // The card is clickable
    fireEvent.click(
      screen.getByText('Start Coding').closest('.new-session-card')!,
    );

    await waitFor(() => {
      expect(window.electron.settings.restartTerminal).toHaveBeenCalledWith(
        undefined,
        '/test/cwd',
      );
      expect(mockOnNavigate).toHaveBeenCalledWith('workspace');
    });
  });

  it('calls openDirectory and updates settings when "Change" is clicked', async () => {
    render(
      <WelcomeScreen
        onNavigate={mockOnNavigate}
        onSelectSession={mockOnSelectSession}
      />,
    );

    const changeButton = screen.getByText('Change').closest('button');
    expect(changeButton).toBeInTheDocument();

    fireEvent.click(changeButton!);

    await waitFor(() => {
      expect(window.electron.openDirectory).toHaveBeenCalled();
      expect(window.electron.settings.set).toHaveBeenCalledWith({
        changes: { terminalCwd: '/new/path' },
      });
      expect(mockRefreshSettings).toHaveBeenCalled();
    });
  });
});