/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface DiffViewState {
  isOpen: boolean;
  cwd: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  changedFiles: string[];
  currentIndex: number;
}

export interface SessionUIState {
  expandedWorkspaces: string[];
  expandedStaged: string[];
  diffViewState: DiffViewState;
  activeToolsTab: 'git' | 'mcp' | 'extensions';
}

interface SessionStateStore {
  [sessionId: string]: SessionUIState;
}

const DEFAULT_DIFF_STATE: DiffViewState = {
  isOpen: false,
  cwd: '',
  filePath: '',
  oldContent: '',
  newContent: '',
  changedFiles: [],
  currentIndex: -1,
};

const DEFAULT_SESSION_STATE: SessionUIState = {
  expandedWorkspaces: [],
  expandedStaged: [],
  diffViewState: DEFAULT_DIFF_STATE,
  activeToolsTab: 'git',
};

export function useSessionState(initialSessionId: string = 'default') {
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId);
  const [store, setStore] = useState<SessionStateStore>(() => {
    try {
      const saved = localStorage.getItem('gemini-session-states');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist to localStorage whenever store changes
  useEffect(() => {
    try {
      localStorage.setItem('gemini-session-states', JSON.stringify(store));
    } catch (e) {
      console.error('Failed to save session states:', e);
    }
  }, [store]);

  const getCurrentState = useCallback((): SessionUIState => {
    return store[currentSessionId] || DEFAULT_SESSION_STATE;
  }, [store, currentSessionId]);

  const updateCurrentState = useCallback(
    (updater: (prev: SessionUIState) => SessionUIState) => {
      setStore((prevStore) => {
        const prevState = prevStore[currentSessionId] || DEFAULT_SESSION_STATE;
        const newState = updater(prevState);
        return {
          ...prevStore,
          [currentSessionId]: newState,
        };
      });
    },
    [currentSessionId],
  );

  // -- Workspace Expansion --

  const isWorkspaceExpanded = useCallback(
    (path: string) => {
      return getCurrentState().expandedWorkspaces.includes(path);
    },
    [getCurrentState],
  );

  const toggleWorkspace = useCallback(
    (path: string) => {
      updateCurrentState((prev) => {
        const isExpanded = prev.expandedWorkspaces.includes(path);
        return {
          ...prev,
          expandedWorkspaces: isExpanded
            ? prev.expandedWorkspaces.filter((p) => p !== path)
            : [...prev.expandedWorkspaces, path],
        };
      });
    },
    [updateCurrentState],
  );

  // -- Staged Changes Expansion --

  const isStagedExpanded = useCallback(
    (path: string) => {
      return getCurrentState().expandedStaged.includes(path);
    },
    [getCurrentState],
  );

  const toggleStaged = useCallback(
    (path: string) => {
      updateCurrentState((prev) => {
        const isExpanded = prev.expandedStaged.includes(path);
        return {
          ...prev,
          expandedStaged: isExpanded
            ? prev.expandedStaged.filter((p) => p !== path)
            : [...prev.expandedStaged, path],
        };
      });
    },
    [updateCurrentState],
  );

  // -- Diff View State --

  const getDiffViewState = useCallback(() => {
    return getCurrentState().diffViewState;
  }, [getCurrentState]);

  const setDiffViewState = useCallback(
    (newState: DiffViewState | ((prev: DiffViewState) => DiffViewState)) => {
      updateCurrentState((prev) => ({
        ...prev,
        diffViewState:
          typeof newState === 'function'
            ? newState(prev.diffViewState)
            : newState,
      }));
    },
    [updateCurrentState],
  );

  // -- Active Tools Tab State --
  const getActiveToolsTab = useCallback((): 'git' | 'mcp' | 'extensions' => {
    return getCurrentState().activeToolsTab;
  }, [getCurrentState]);

  const setActiveToolsTab = useCallback(
    (tab: 'git' | 'mcp' | 'extensions') => {
      updateCurrentState((prev) => ({
        ...prev,
        activeToolsTab: tab,
      }));
    },
    [updateCurrentState],
  );

  return {
    currentSessionId,
    setCurrentSessionId,
    isWorkspaceExpanded,
    toggleWorkspace,
    isStagedExpanded,
    toggleStaged,
    getDiffViewState,
    setDiffViewState,
    getActiveToolsTab,
    setActiveToolsTab,
  };
}
