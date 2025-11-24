/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/Settings/SettingsModal';
import { DiffViewer } from './components/Diff/DiffViewer';
import { Terminal, type TerminalRef } from './components/Terminal/Terminal';
import { Sidebar, type Workspace } from './components/Sidebar/Sidebar';
import { useTheme } from './contexts/ThemeContext';
import { useSettings } from './contexts/SettingsContext';
import { isCliTheme } from './utils/theme';
import { useSessionState, type DiffViewState } from './hooks/useSessionState';
import { WelcomeScreen } from './components/Welcome/WelcomeScreen';
import { SessionTabs, type SessionTab } from './components/SessionTabs/SessionTabs';
import type { Session } from '../../types/session';
import type { CliSettings } from '../main/config/types';
import './App.css';

interface GeminiEditorState {
  open: boolean;
  filePath: string;
  oldContent: string;
  newContent: string;
  diffPath: string;
}

interface EditorOverlayProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  onClose: (
    result: { status: 'approve'; content: string } | { status: 'reject' },
  ) => void;
}

function EditorOverlay({
  filePath,
  oldContent,
  newContent,
  onClose,
}: EditorOverlayProps) {
  const [modifiedContent, setModifiedContent] = useState(newContent);
  const { theme } = useTheme();
  const isModified = modifiedContent !== newContent;

  useEffect(() => {
    setModifiedContent(newContent);
  }, [newContent]);

  const handleSave = () => {
    onClose({ status: 'approve', content: modifiedContent });
  };

  const handleClose = () => {
    onClose({ status: 'reject' });
  };

  const saveButtonStyle = {
    backgroundColor: isModified ? theme.blue || '#3b82f6' : 'transparent',
    color: isModified ? '#fff' : 'inherit',
    border: isModified
      ? 'none'
      : `1px solid ${theme.selectionBackground || '#444'}`,
    padding: '2px 12px',
    borderRadius: '4px',
    cursor: isModified ? 'pointer' : 'default',
    fontSize: '12px',
    height: '24px',
    marginRight: '8px',
    opacity: isModified ? 1 : 0.5,
    transition: 'all 0.2s',
  } as React.CSSProperties;

  const headerActions = (
    <button
      onClick={handleSave}
      disabled={!isModified}
      style={saveButtonStyle}
      title={isModified ? 'Save Changes' : 'No Changes'}
    >
      Save
    </button>
  );

  return (
    <div className="editor-overlay">
      <div className="editor-modal">
        <DiffViewer
          filePath={filePath}
          oldContent={oldContent}
          newContent={modifiedContent}
          onClose={handleClose}
          isEditable={true}
          onContentChange={setModifiedContent}
          headerActions={headerActions}
        />
      </div>
    </div>
  );
}

interface AppSessionTab extends SessionTab {
  cwd?: string;
  isLoading?: boolean;
}

function App() {
  const urlParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const { theme, setTheme } = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const initialSessionId = urlParams.get('sessionId');
  const initialView =
    (urlParams.get('initialView') as 'welcome' | 'workspace') || 'welcome';

  const [sessions, setSessions] = useState<AppSessionTab[]>(() => {
    if (initialSessionId) {
      return [{ id: initialSessionId, name: 'Session', isLoading: false }];
    }
    if (initialView === 'workspace') {
      return [{ id: 'default', name: 'New Session', isLoading: false }];
    }
    return [];
  });

  const [activeSessionId, setActiveSessionId] = useState(
    initialSessionId || (sessions.length > 0 ? sessions[0].id : ''),
  );

  const [view, setView] = useState<'welcome' | 'workspace'>(initialView);
  const terminalRef = useRef<TerminalRef>(null);
  const [editorState, setEditorState] = useState<GeminiEditorState>({
    open: false,
    filePath: '',
    oldContent: '',
    newContent: '',
    diffPath: '',
  });
  const { settings, refreshSettings } = useSettings();
  const terminalDataTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const isRestartingRef = useRef<Set<string>>(new Set());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    setCurrentSessionId,
    getDiffViewState,
    setDiffViewState,
    isWorkspaceExpanded,
    toggleWorkspace,
    isStagedExpanded,
    toggleStaged,
    getActiveToolsTab,
    setActiveToolsTab,
  } = useSessionState(activeSessionId);

  useEffect(() => {
    setCurrentSessionId(activeSessionId);
  }, [activeSessionId, setCurrentSessionId]);

  const diffViewState = getDiffViewState();

  const waitForTerminalDimensions = useCallback(async () => {
    return new Promise<{ cols: number; rows: number } | undefined>((resolve) => {
      let attempts = 0;
      const check = () => {
        const dims = terminalRef.current?.proposeDimensions();
        if (dims && dims.cols > 5 && dims.rows > 5) {
          // Force frontend terminal to fit to these dimensions immediately
          terminalRef.current?.fit();
          resolve(dims);
        } else if (attempts < 50) {
          attempts++;
          requestAnimationFrame(check);
        } else {
          resolve(undefined);
        }
      };
      check();
    });
  }, []);

  useEffect(() => {
    const cwd = urlParams.get('cwd');
    const sessionId = urlParams.get('sessionId');

    if (cwd) {
      const init = async () => {
        // Update settings so sidebar shows the correct workspace
        await window.electron.settings.set({
          changes: { terminalCwd: cwd } as Partial<CliSettings>,
        });
        await refreshSettings();
        // Restart terminal with new CWD and Session ID
        const dims = await waitForTerminalDimensions();
        await window.electron.settings.restartTerminal(
          sessionId || undefined,
          cwd,
          false,
          dims?.cols,
          dims?.rows,
        );
      };
      init();
    }
  }, [urlParams, refreshSettings, waitForTerminalDimensions]);

  // Hydrate session CWDs from settings on load if missing
  useEffect(() => {
    if (settings?.merged) {
      const merged = settings.merged as CliSettings;
      const globalCwd = merged.terminalCwd;

      setSessions((prev) => {
        let hasChanges = false;
        const next = prev.map((s) => {
          if (!s.cwd && globalCwd) {
            hasChanges = true;
            return { ...s, cwd: globalCwd };
          }
          return s;
        });
        return hasChanges ? next : prev;
      });
    }
  }, [settings?.merged]); // Only run when settings load/change, not sessions

  // Resizing State for Diff Pane
  const [diffPaneHeight, setDiffPaneHeight] = useState(300);
  const [isResizingDiff, setIsResizingDiff] = useState(false);
  
  // Resizing State for Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const loadDiff = async (cwd: string, filePath: string) => {
    try {
      const { oldContent, newContent } = await window.electron.git.getFileDiff(
        cwd,
        filePath,
      );
      return { oldContent, newContent };
    } catch (error) {
      console.error('Failed to load diff:', error);
      return { oldContent: '', newContent: '' };
    }
  };

  const handleFileClick = async (
    cwd: string,
    filePath: string,
    allChangedFiles: string[],
  ) => {
    const { oldContent, newContent } = await loadDiff(cwd, filePath);
    const currentIndex = allChangedFiles.indexOf(filePath);

    setDiffViewState({
      isOpen: true,
      cwd,
      filePath,
      oldContent,
      newContent,
      changedFiles: allChangedFiles,
      currentIndex,
    });
  };

  const handleNextFile = async () => {
    if (!diffViewState.isOpen || diffViewState.currentIndex === -1) return;
    const nextIndex = diffViewState.currentIndex + 1;
    if (nextIndex < diffViewState.changedFiles.length) {
      const nextFile = diffViewState.changedFiles[nextIndex];
      const { oldContent, newContent } = await loadDiff(
        diffViewState.cwd,
        nextFile,
      );
      setDiffViewState({
        ...diffViewState,
        filePath: nextFile,
        oldContent,
        newContent,
        currentIndex: nextIndex,
      });
    }
  };

  const handlePreviousFile = async () => {
    if (!diffViewState.isOpen || diffViewState.currentIndex === -1) return;
    const prevIndex = diffViewState.currentIndex - 1;
    if (prevIndex >= 0) {
      const prevFile = diffViewState.changedFiles[prevIndex];
      const { oldContent, newContent } = await loadDiff(
        diffViewState.cwd,
        prevFile,
      );
      setDiffViewState({
        ...diffViewState,
        filePath: prevFile,
        oldContent,
        newContent,
        currentIndex: prevIndex,
      });
    }
  };

  const handleCloseDiff = () => {
    setDiffViewState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDiffContentChange = useCallback((content: string) => {
    setDiffViewState((prev) => ({ ...prev, newContent: content }));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const { cwd, filePath } = getDiffViewState(); // Use getter to access current state if needed, or use the state from closure if stable
      // Actually, getDiffViewState is a hook result, so it might be stale here if closure captures old one.
      // Better to rely on `diffViewState` from component scope if useCallback depends on it,
      // or pass necessary data to this handler.
      // But wait, `setDiffViewState` update is fine. The issue is reading `cwd` and `filePath`.
      // Let's rely on the fact that `diffViewState` is in scope.
      // We need to add `diffViewState` to dependency array.
      // BUT, `saveTimeoutRef` runs later. We need the values *at that time*.
      // Simplest is to assume `diffViewState` (the state variable) is accessible but might be stale in closure?
      // No, `setTimeout` closure captures the scope variables at the time `handleDiffContentChange` was created.
      // If `handleDiffContentChange` is recreated on `diffViewState` change, then we are good.
      
      // Wait, simpler approach: 
      // Just use the values we have right now. 
      // Ideally we'd pass them in or use a ref for current diff state.
      // Let's access the *current* diffViewState from the hook if possible? No.
      // Let's rely on React state updates.
      
      // Actually, simpler:
      // We can just use the values from the scope if we include them in deps.
    }, 1000);
  }, []); 
  
  // Refined approach for saving:
  const saveDiffContent = useCallback(async (cwd: string, filePath: string, content: string) => {
      if (!cwd || !filePath) return;
      try {
          await window.electron.file.save(
              // Join path if needed, but git service usually provides relative path.
              // IPC expects absolute path usually? Let's check IPC implementation.
              // fs.promises.writeFile(filePath). If filePath is relative, it's relative to CWD of main process?
              // Wait, ipc-handlers `fs.promises.writeFile(filePath)` uses whatever path is passed.
              // We should resolve it relative to CWD if it's not absolute.
              // `window.electron.git.getFileDiff` returns relative paths usually.
              // Let's assume we need to join them.
              // But we don't have `path.join` in renderer easily without polyfill.
              // We can send cwd and file separately to IPC? No, IPC takes one path.
              // Let's just send `${cwd}/${filePath}` assuming unix style or handle it in IPC.
              // Actually, `ipc-handlers` has `resolvePath` helper but `file:save` just calls `fs.promises.writeFile(filePath)`.
              // If filePath is relative, it might be risky.
              // Let's construct the absolute path in the renderer if possible, or better, update IPC to take cwd.
              // Let's update IPC handler to be safer?
              // No, let's just use string concatenation for now: `${cwd}/${filePath}`.
              // Wait, windows?
              // Let's let the IPC handler resolve it if possible.
              // Actually, let's just update IPC to take cwd and file?
              // I already implemented `file:save` taking `filePath`.
              // Let's assume I can pass `${cwd}/${filePath}`.
              // Use a simple helper for slash normalization if needed.
              
              // Actually, safer: `cwd` is usually absolute from `openDirectory`.
              // `filePath` from git status is relative.
              // So `${cwd}/${filePath}` should work if we handle slashes.
              cwd + (cwd.endsWith('/') || cwd.endsWith('\\') ? '' : '/') + filePath,
              content
          );
      } catch (e) {
          console.error('Auto-save failed:', e);
      }
  }, []);

  const handleDiffContentChangeWrapper = useCallback((content: string) => {
      setDiffViewState(prev => ({ ...prev, newContent: content }));
      
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }
      
      // Capture current context
      const { cwd, filePath } = diffViewState;
      
      saveTimeoutRef.current = setTimeout(() => {
          saveDiffContent(cwd, filePath, content);
      }, 500); // 500ms debounce
  }, [diffViewState.cwd, diffViewState.filePath, saveDiffContent]);

  const handleCloseEditor = async (
    result: { status: 'approve'; content: string } | { status: 'reject' },
  ) => {
    try {
      const response = await window.electron.resolveDiff({
        ...result,
        diffPath: editorState.diffPath,
      });
      console.log('resolveDiff response:', response);
    } catch (error) {
      console.error('Failed to resolve diff:', error);
    }
    setEditorState({ ...editorState, open: false });
  };

  const handleTerminalData = useCallback(
    (sessionId: string) => {
      if (isRestartingRef.current.has(sessionId)) {
        return;
      }
      if (terminalDataTimeoutRef.current[sessionId]) {
        clearTimeout(terminalDataTimeoutRef.current[sessionId]);
      }
      
      // Check if we need to update loading state
      terminalDataTimeoutRef.current[sessionId] = setTimeout(() => {
        // Force a fit before removing the loading screen to ensure no size jump
        if (sessionId === activeSessionId) {
          terminalRef.current?.fit();
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.isLoading
              ? { ...s, isLoading: false }
              : s,
          ),
        );
        delete terminalDataTimeoutRef.current[sessionId];
      }, 300);
    },
    [],
  );

  useEffect(() => {
    return () => {
      Object.values(terminalDataTimeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  // Auto-restart session if backend reports it missing (e.g. after crash)
  useEffect(() => {
    const removeListener = window.electron.terminal.onNotFound(async (_event, { sessionId }) => {
      console.log(`Session ${sessionId} not found on backend, restarting...`);
      
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;

      // Prevent restart loops: if we just tried restarting, don't try again immediately
      if (isRestartingRef.current.has(sessionId)) return;

      try {
        isRestartingRef.current.add(sessionId);
        const dims = await waitForTerminalDimensions();
        // Restart without resume to ensure clean state if it crashed
        await window.electron.settings.restartTerminal(
          sessionId,
          session.cwd,
          false, // Don't resume, start fresh
          dims?.cols,
          dims?.rows
        );
      } catch (error) {
        console.error(`Failed to auto-restart session ${sessionId}:`, error);
      } finally {
        isRestartingRef.current.delete(sessionId);
      }
    });
    
    return () => {
      removeListener();
    };
  }, [sessions, waitForTerminalDimensions]);

  useEffect(() => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (activeSession && !activeSession.isLoading && view === 'workspace') {
      // Force a fit when the terminal finishes loading
      setTimeout(() => {
        terminalRef.current?.fit();
      }, 50);
    }
  }, [sessions, activeSessionId, view]);

  const workspaces: Workspace[] = useMemo(() => {
    if (!settings?.merged) return [];
    const mergedSettings = settings.merged as CliSettings;
    
    // Get active session's CWD, fallback to settings
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    const activeCwd = activeSession?.cwd || mergedSettings.terminalCwd || '';
    const includes = mergedSettings.context?.includeDirectories || [];

    // Combine and deduplicate
    const allPaths = Array.from(new Set([activeCwd, ...includes].filter(Boolean)));

    return allPaths.map((path) => ({
      path,
      name: path.split(/[/\\]/).pop() || path,
      isActive: path === activeCwd,
    }));
  }, [settings?.merged, activeSessionId, sessions]);

  const handleWorkspaceSelect = async (path: string) => {
    console.log('handleWorkspaceSelect called with:', path);
    // Temporarily disabled
    // try {
    //   await window.electron.settings.set({ changes: { terminalCwd: path } });
    //   console.log('settings.set called');
    //   window.electron.settings.restartTerminal();
    //   console.log('restartTerminal called');
    // } catch (error) {
    //   console.error('Failed to switch workspace:', error);
    // }
  };

  const handleAddDirectory = async () => {
    try {
      const path = await window.electron.openDirectory();
      if (path) {
        const currentIncludes = (settings.merged as CliSettings).context?.includeDirectories || [];
        if (!currentIncludes.includes(path)) {
          await window.electron.settings.set({
            changes: {
              context: {
                includeDirectories: [...currentIncludes, path],
              },
            },
          });
          await refreshSettings();
        }
      }
    } catch (error) {
      console.error('Failed to add directory:', error);
    }
  };

  const handleChangeDirectory = async () => {
    try {
      const path = await window.electron.openDirectory();
      if (path) {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, cwd: path } : s)),
        );

        await window.electron.settings.set({
          changes: { terminalCwd: path } as Partial<CliSettings>,
        });
        await refreshSettings();

        isRestartingRef.current.add(activeSessionId);
        const dims = await waitForTerminalDimensions();
        await window.electron.settings.restartTerminal(
          activeSessionId,
          path,
          false,
          dims?.cols,
          dims?.rows,
        );
        isRestartingRef.current.delete(activeSessionId);
      }
    } catch (error) {
      console.error('Failed to change directory:', error);
    }
  };

  const handleSessionSelect = async (session: Session) => {
    const sessionId = session.tag;
    // If session not in list, add it
    if (!sessions.some((s) => s.id === sessionId)) {
      setSessions((prev) => {
        // If we are in welcome screen and have only the default empty session, replace it
        if (
          view === 'welcome' &&
          prev.length === 1 &&
          prev[0].id === 'default'
        ) {
          return [
            {
              id: sessionId,
              name: session.tag || 'Session',
              cwd: session.projectPath,
              isLoading: true,
            },
          ];
        }
        return [
          ...prev,
          {
            id: sessionId,
            name: session.tag || 'Session',
            cwd: session.projectPath,
            isLoading: true,
          },
        ];
      });
    } else {
      // If existing, set loading true as we might restart/re-attach
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, isLoading: true } : s)),
      );
    }
    
    setActiveSessionId(sessionId);

    try {
      await window.electron.settings.set({
        changes: { terminalCwd: session.projectPath } as Partial<CliSettings>,
      });
      await refreshSettings();

      isRestartingRef.current.add(sessionId);
      setView('workspace');
      
      const dims = await waitForTerminalDimensions();
      await window.electron.settings.restartTerminal(
        sessionId,
        session.projectPath,
        true,
        dims?.cols,
        dims?.rows
      );
      isRestartingRef.current.delete(sessionId);
    } catch (error) {
      console.error('[App] Failed to resume session:', error);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, isLoading: false } : s)),
      );
      isRestartingRef.current.delete(sessionId);
    }
  };

  const handleAddSession = async () => {
    const newId = crypto.randomUUID();
    const currentCwd = (settings?.merged as CliSettings)?.terminalCwd;
    
    setSessions((prev) => [
      ...prev,
      { id: newId, name: 'New Session', isLoading: true, cwd: currentCwd },
    ]);
    setActiveSessionId(newId);

    try {
      isRestartingRef.current.add(newId);
      // We pass currentCwd explicitly to start the PTY in the right place
      const dims = await waitForTerminalDimensions();
      await window.electron.settings.restartTerminal(
        newId, 
        currentCwd, 
        false, 
        dims?.cols, 
        dims?.rows
      );
      isRestartingRef.current.delete(newId);
    } catch (e) {
      console.error('Failed to create session:', e);
      isRestartingRef.current.delete(newId);
      setSessions((prev) =>
        prev.map((s) => (s.id === newId ? { ...s, isLoading: false } : s)),
      );
    }
  };

  const handleCloseSession = (sessionId: string) => {
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;

    const newSessions = sessions.filter((s) => s.id !== sessionId);
    setSessions(newSessions);

    if (sessionId === activeSessionId) {
      if (newSessions.length > 0) {
        const newActive = newSessions[Math.min(idx, newSessions.length - 1)];
        setActiveSessionId(newActive.id);
      } else {
        setView('welcome');
        setActiveSessionId('');
      }
    }
  };

  const handleOpenFolder = async () => {
    try {
      const path = await window.electron.openDirectory();
      if (path) {
        const newId = crypto.randomUUID();
        setSessions((prev) => [
          ...prev,
          {
            id: newId,
            name: path.split(/[/\\]/).pop() || 'Session',
            cwd: path,
            isLoading: true,
          },
        ]);
        setActiveSessionId(newId);

        await window.electron.settings.set({
          changes: { terminalCwd: path } as Partial<CliSettings>,
        });
        await refreshSettings();

        isRestartingRef.current.add(newId);
        setView('workspace');
        const dims = await waitForTerminalDimensions();
        await window.electron.settings.restartTerminal(
          newId, 
          path, 
          false,
          dims?.cols,
          dims?.rows
        );
        isRestartingRef.current.delete(newId);
      }
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  };

  useEffect(() => {
    // Trigger terminal resize after diff pane transition
    const timeout = setTimeout(() => {
      terminalRef.current?.fit();
    }, 350); // 300ms transition + buffer
    return () => clearTimeout(timeout);
  }, [diffViewState.isOpen, editorState.open]);

  useEffect(() => {
    const removeListener = window.electron.onShowGeminiEditor(
      (_event, data) => {
        setEditorState({
          open: true,
          filePath: data.filePath,
          oldContent: data.oldContent,
          newContent: data.newContent,
          diffPath: data.diffPath,
        });
        // Close regular diff view if open
        setDiffViewState((prev) => ({ ...prev, isOpen: false }));
      },
    );
    return () => {
      removeListener();
    };
  }, []);

  useEffect(() => {
    const removeListener = window.electron.theme.onInit(
      (_event, receivedTheme) => {
        console.log('Received theme from main process:', receivedTheme);
        if (isCliTheme(receivedTheme)) {
          setTheme(receivedTheme);
        } else if (receivedTheme.background) {
          setTheme(receivedTheme);
        }
      },
    );

    return () => {
      removeListener();
    };
  }, [setTheme]);

  useEffect(() => {
    const session = sessions.find((s) => s.id === activeSessionId);
    const currentCwd = (settings?.merged as CliSettings)?.terminalCwd;

    if (session?.cwd && session.cwd !== currentCwd) {
      window.electron.settings
        .set({ changes: { terminalCwd: session.cwd } as Partial<CliSettings> })
        .then(() => refreshSettings())
        .catch((e) => console.error('Failed to sync settings:', e));
    }
  }, [activeSessionId, sessions, settings, refreshSettings]);

  // Resize Logic for Diff Pane
  const startResizingDiff = useCallback((e: React.MouseEvent) => {
    setIsResizingDiff(true);
    e.preventDefault();
  }, []);

  const startResizingSidebar = useCallback((e: React.MouseEvent) => {
    setIsResizingSidebar(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isResizingDiff && !isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDiff) {
        // Title bar height is approx 32px
        const newHeight = e.clientY - 32;
        // Constrain height
        const constrainedHeight = Math.max(100, Math.min(newHeight, window.innerHeight - 100));
        setDiffPaneHeight(constrainedHeight);
      }
      
      if (isResizingSidebar) {
        const newWidth = e.clientX;
        const constrainedWidth = Math.max(150, Math.min(newWidth, 600));
        setSidebarWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingDiff || isResizingSidebar) {
        setIsResizingDiff(false);
        setIsResizingSidebar(false);
        // Trigger terminal resize
        setTimeout(() => terminalRef.current?.fit(), 50);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingDiff, isResizingSidebar]);


  const themeStyles = {
    '--bg-color': theme.background,
    '--fg-color': theme.foreground,
    '--border-color': theme.selectionBackground || '#44475a',
  } as React.CSSProperties;

  const [modifiedEditorContent, setModifiedEditorContent] = useState('');

  // Update local content state when editor opens
  useEffect(() => {
    if (editorState.open) {
      setModifiedEditorContent(editorState.newContent);
    }
  }, [editorState.open, editorState.newContent]);

  const isEditorModified = modifiedEditorContent !== editorState.newContent;

  const saveButtonStyle = {
    backgroundColor: isEditorModified
      ? theme.blue || '#3b82f6'
      : 'transparent',
    color: isEditorModified ? '#fff' : 'inherit',
    border: isEditorModified
      ? 'none'
      : `1px solid ${theme.selectionBackground || '#444'}`,
    padding: '2px 12px',
    borderRadius: '4px',
    cursor: isEditorModified ? 'pointer' : 'default',
    fontSize: '12px',
    height: '24px',
    marginRight: '8px',
    opacity: isEditorModified ? 1 : 0.5,
    transition: 'all 0.2s',
  } as React.CSSProperties;

  const editorHeaderActions = (
    <button
      onClick={() =>
        handleCloseEditor({ status: 'approve', content: modifiedEditorContent })
      }
      disabled={!isEditorModified}
      style={saveButtonStyle}
      title={isEditorModified ? 'Save Changes' : 'No Changes'}
    >
      Save
    </button>
  );

  const isDiffVisible = diffViewState.isOpen || editorState.open;

  return (
    <div className="app-container" style={themeStyles}>
      <div className="title-bar">
        <span className="title-bar-text">Gemini CLI</span>
      </div>
      {view === 'welcome' && (
        <WelcomeScreen
          onNavigate={(v) => {
            if (v === 'workspace' && sessions.length === 0) {
              handleAddSession();
            }
            setView(v);
          }}
          onSelectSession={handleSessionSelect}
        />
      )}
      <div
        className="app-body"
        style={{ display: view === 'workspace' ? 'flex' : 'none' }}
      >
        <Sidebar
          workspaces={workspaces}
          onSelect={handleWorkspaceSelect}
          onFileClick={handleFileClick}
          onAddDirectory={handleAddDirectory}
          onChangeDirectory={handleChangeDirectory}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onGoHome={() => setView('welcome')}
          isWorkspaceExpanded={isWorkspaceExpanded}
          onToggleWorkspace={toggleWorkspace}
          isStagedExpanded={isStagedExpanded}
          onToggleStaged={toggleStaged}
          activeToolsTab={getActiveToolsTab()}
          onSetActiveToolsTab={setActiveToolsTab}
          style={{ width: sidebarWidth }}
          isResizing={isResizingSidebar}
        />
        <div 
          className={`sidebar-resize-handle ${isResizingSidebar ? 'resizing' : ''}`}
          onMouseDown={startResizingSidebar}
        />
        <div className="main-content">
          <SessionTabs
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onNewSession={handleAddSession}
            onResumeSession={() => setView('welcome')}
            onOpenFolder={handleOpenFolder}
            onClose={handleCloseSession}
          />
          <div
            className={`diff-pane ${diffViewState.isOpen || editorState.open ? 'open' : ''} ${!isResizingDiff ? 'transitioning' : ''}`}
            style={
              (diffViewState.isOpen || editorState.open) 
                ? { flex: 'none', height: diffPaneHeight } 
                : {}
            }
          >
            {editorState.open ? (
              <DiffViewer
                filePath={editorState.filePath}
                oldContent={editorState.oldContent}
                newContent={modifiedEditorContent}
                onClose={() => handleCloseEditor({ status: 'reject' })}
                isEditable={true}
                onContentChange={setModifiedEditorContent}
                headerActions={editorHeaderActions}
              />
            ) : diffViewState.isOpen ? (
              <DiffViewer
                filePath={diffViewState.filePath}
                oldContent={diffViewState.oldContent}
                newContent={diffViewState.newContent}
                onClose={handleCloseDiff}
                isEditable={true}
                onContentChange={handleDiffContentChangeWrapper}
                onNext={
                  diffViewState.currentIndex <
                  diffViewState.changedFiles.length - 1
                    ? handleNextFile
                    : undefined
                }
                onPrevious={
                  diffViewState.currentIndex > 0
                    ? handlePreviousFile
                    : undefined
                }
                nextFile={
                  diffViewState.currentIndex <
                  diffViewState.changedFiles.length - 1
                    ? diffViewState.changedFiles[
                        diffViewState.currentIndex + 1
                      ]
                    : undefined
                }
                previousFile={
                  diffViewState.currentIndex > 0
                    ? diffViewState.changedFiles[
                        diffViewState.currentIndex - 1
                      ]
                    : undefined
                }
              />
            ) : null}
            {isDiffVisible && (
              <div
                className={`diff-resize-handle ${isResizingDiff ? 'resizing' : ''}`}
                onMouseDown={startResizingDiff}
              />
            )}
          </div>
          <div className="terminal-pane">
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: session.id === activeSessionId ? 'flex' : 'none',
                  flex: 1,
                  height: '100%',
                  flexDirection: 'column',
                }}
              >
                <Terminal
                  ref={session.id === activeSessionId ? terminalRef : undefined}
                  sessionId={session.id}
                  visible={
                    view === 'workspace' && session.id === activeSessionId
                  }
                  isLoading={session.isLoading}
                  onData={() => handleTerminalData(session.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>{' '}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            setTimeout(() => terminalRef.current?.focus(), 50);
          }}
          sessions={sessions.map((s) => ({ id: s.id, cwd: s.cwd }))}
        />
      )}
    </div>
  );
}

export default App;
