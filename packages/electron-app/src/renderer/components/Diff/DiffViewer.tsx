/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import * as React from 'react';
import { X, ChevronLeft, ChevronRight, Columns } from 'lucide-react';
import { getLanguageForFilePath } from '../../utils/language';
import { useTheme } from '../../contexts/ThemeContext';
import './DiffViewer.css';

interface DiffViewerProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  nextFile?: string;
  previousFile?: string;
  isEditable?: boolean;
  onContentChange?: (content: string) => void;
  headerActions?: React.ReactNode;
}

function isColorLight(hexColor: string | undefined) {
  if (!hexColor || !hexColor.startsWith('#')) {
    return false;
  }
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function DiffViewer({
  filePath,
  oldContent,
  newContent,
  onClose,
  onNext,
  onPrevious,
  nextFile,
  previousFile,
  isEditable = true, // Default to true to allow editing by default
  onContentChange,
  headerActions,
}: DiffViewerProps) {
  const [language, setLanguage] = React.useState('plaintext');
  const [renderSideBySide, setRenderSideBySide] = React.useState(false);
  const { theme } = useTheme();

  React.useEffect(() => {
    getLanguageForFilePath(filePath).then(setLanguage);
  }, [filePath]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Alt + Arrow Keys or Cmd/Ctrl + [ / ]
      if (
        (e.altKey && e.key === 'ArrowRight') ||
        ((e.metaKey || e.ctrlKey) && e.key === ']')
      ) {
        if (onNext) onNext();
      } else if (
        (e.altKey && e.key === 'ArrowLeft') ||
        ((e.metaKey || e.ctrlKey) && e.key === '[')
      ) {
        if (onPrevious) onPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  const shouldAutoScroll = React.useRef(true);

  React.useEffect(() => {
    shouldAutoScroll.current = true;
  }, [filePath]);

  const handleEditorMount: DiffOnMount = (editor) => {
    const disposables: { dispose: () => void }[] = [];

    // Auto-scroll to first diff
    const diffUpdateDisposable = editor.onDidUpdateDiff(() => {
      if (shouldAutoScroll.current) {
        const changes = editor.getLineChanges();
        if (changes && changes.length > 0) {
          editor.revealLineInCenter(changes[0].modifiedStartLineNumber);
          shouldAutoScroll.current = false;
        }
      }
    });
    disposables.push(diffUpdateDisposable);

    if (isEditable && onContentChange) {
      const modifiedEditor = editor.getModifiedEditor();
      const contentChangeDisposable = modifiedEditor.onDidChangeModelContent(
        () => {
          const value = modifiedEditor.getValue();
          onContentChange(value);
        },
      );
      disposables.push(contentChangeDisposable);
    }

    return () => {
      disposables.forEach((d) => d.dispose());
      // Prevent "TextModel got disposed before DiffEditorWidget model got reset" error
      // by detaching the models from the editor widget before unmounting.
      try {
        editor.setModel(null);
      } catch {
        // Ignore errors during disposal
      }
    };
  };

  const editorTheme = isColorLight(theme.background) ? 'vs-light' : 'vs-dark';
  const fileName = filePath.split('/').pop();
  const dirName = filePath.split('/').slice(0, -1).join('/');

  return (
    <div
      className="diff-viewer-container"
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
      }}
    >
      <div
        className="diff-viewer-header"
        style={{
          borderBottom: `1px solid ${theme.selectionBackground}`,
          backgroundColor: theme.background,
        }}
      >
        <div className="diff-viewer-left">
          <button
            onClick={() => setRenderSideBySide(!renderSideBySide)}
            title={
              renderSideBySide
                ? 'Switch to Inline View'
                : 'Switch to Side-by-Side View'
            }
            style={{ opacity: renderSideBySide ? 1 : 0.6 }}
          >
            <Columns size={16} />
          </button>
        </div>
        <div className="diff-viewer-center">
          <button
            onClick={onPrevious}
            disabled={!onPrevious}
            title={
              previousFile
                ? `Previous: ${previousFile} (Alt+Left)`
                : 'No previous file'
            }
            className="nav-button"
            style={{ visibility: onPrevious ? 'visible' : 'hidden' }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="diff-file-info">
            {dirName && <span className="diff-filepath">{dirName}/</span>}
            <span className="diff-filename">{fileName}</span>
            <span className="diff-shortcuts">Alt + &#8592; / &#8594;</span>
          </div>
          <button
            onClick={onNext}
            disabled={!onNext}
            title={
              nextFile ? `Next: ${nextFile} (Alt+Right)` : 'No next file'
            }
            className="nav-button"
            style={{ visibility: onNext ? 'visible' : 'hidden' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="diff-viewer-right">
          {headerActions}
          <button
            onClick={onClose}
            className="diff-close-button"
            title="Close Diff View (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="diff-editor-wrapper">
        <DiffEditor
          original={oldContent}
          modified={newContent}
          language={language}
          theme={editorTheme}
          onMount={handleEditorMount}
          options={{
            readOnly: !isEditable,
            originalEditable: false,
            renderSideBySide: renderSideBySide,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
