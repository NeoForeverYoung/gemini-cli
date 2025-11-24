/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, forwardRef, useImperativeHandle } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useTheme } from '../../contexts/ThemeContext';
import { BouncingLoader } from './BouncingLoader';

export interface TerminalRef {
  focus: () => void;
  fit: () => void;
  proposeDimensions: () => { cols: number; rows: number } | undefined;
}

export interface TerminalProps {
  sessionId: string;
  visible?: boolean;
  isLoading?: boolean;
  onData?: () => void;
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(
  ({ sessionId, visible, isLoading, onData }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const { term, fitAddon } = useTerminal(
      containerRef,
      theme,
      sessionId,
      visible,
      onData,
    );

    useImperativeHandle(ref, () => ({
      focus: () => {
        term.current?.focus();
      },
      fit: () => {
        if (fitAddon.current) {
          try {
            const geometry = fitAddon.current.proposeDimensions();
            if (geometry && geometry.cols > 0 && geometry.rows > 0) {
              window.electron.terminal.resize({
                sessionId,
                cols: geometry.cols,
                rows: geometry.rows,
              });
            }
            fitAddon.current.fit();
          } catch (e) {
            console.warn('Failed to fit terminal:', e);
          }
        }
      },
      proposeDimensions: () => {
        if (fitAddon.current) {
          try {
            const dims = fitAddon.current.proposeDimensions();
            if (dims && dims.cols > 0 && dims.rows > 0) {
              return dims;
            }
          } catch {
            return undefined;
          }
        }
        return undefined;
      },
    }));

    return (
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{
            height: '100%',
            width: '100%',
            padding: '0 10px 10px 10px',
            boxSizing: 'border-box',
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 0.15s ease-in',
          }}
        />
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.background || '#1e1e1e',
              zIndex: 9999,
            }}
          >
            <BouncingLoader />
          </div>
        )}
      </div>
    );
  },
);

Terminal.displayName = 'Terminal';
