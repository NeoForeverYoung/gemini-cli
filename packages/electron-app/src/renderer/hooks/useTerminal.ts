/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { XtermTheme } from '../types/global';

// Helper for debounce
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  timeout = 100,
) {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  theme: XtermTheme,
  sessionId: string,
  visible: boolean = true,
  onData?: () => void,
) {
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const isResetting = useRef(false);
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    const terminalElement = containerRef.current;
    if (terminalElement && !term.current) {
      fitAddon.current = new FitAddon();
      term.current = new Terminal({
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        cursorBlink: true,
        allowTransparency: true,
        drawBoldTextInBrightColors: false,
        theme,
      });
      term.current.loadAddon(fitAddon.current);
      term.current.open(terminalElement);

      const onResize = () => {
        if (!terminalElement || terminalElement.clientWidth === 0 || terminalElement.clientHeight === 0) {
           return;
        }
        try {
          const geometry = fitAddon.current?.proposeDimensions();
          if (geometry && geometry.cols > 0 && geometry.rows > 0) {
            window.electron.terminal.resize({
              sessionId,
              cols: geometry.cols,
              rows: geometry.rows,
            });
          }
          fitAddon.current?.fit();
        } catch {
          // Ignore resize errors
        }
      };

      const debouncedResize = debounce(onResize, 50);

      // Initial resize
      requestAnimationFrame(() => onResize());

      const dataListener = window.electron.terminal.onData((_event, payload) => {
        const data = typeof payload === 'string' ? payload : payload.data;
        const msgSessionId =
          typeof payload === 'string' ? null : payload.sessionId;

        if (msgSessionId && msgSessionId !== sessionId) return;

        if (isResetting.current) {
          term.current?.clear();
          isResetting.current = false;
          term.current?.focus();
        }
        term.current?.write(data);
        onDataRef.current?.();
      });

      term.current.onKey(({ key, domEvent: event }) => {
        if (event.key === 'Enter' && event.shiftKey) {
          window.electron.terminal.sendKey(sessionId, '\n');
        } else {
          window.electron.terminal.sendKey(sessionId, key);
        }
      });

      const removeResetListener = window.electron.terminal.onReset(() => {
        term.current?.clear();
        isResetting.current = true;
      });

      const resizeObserver = new ResizeObserver(debouncedResize);
      resizeObserver.observe(terminalElement);
      window.addEventListener('focus', onResize);
      const removeMainWindowResizeListener =
        window.electron.onMainWindowResize(onResize);

      let scrollAccumulator = 0;
      const SCROLL_THRESHOLD = 20;

      term.current.attachCustomWheelEventHandler((event: WheelEvent) => {
        if (term.current?.buffer.active.type === 'alternate') {
          const delta = event.deltaY;
          if (delta === 0) return false;

          scrollAccumulator += delta;

          while (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD) {
            if (scrollAccumulator > 0) {
              window.electron.terminal.sendKey(sessionId, '\x1b[1;2B'); // Shift + Arrow Down
              scrollAccumulator -= SCROLL_THRESHOLD;
            } else {
              window.electron.terminal.sendKey(sessionId, '\x1b[1;2A'); // Shift + Arrow Up
              scrollAccumulator += SCROLL_THRESHOLD;
            }
          }
          return false;
        }
        return true;
      });

      return () => {
        debouncedResize.cancel();
        resizeObserver.disconnect();
        window.removeEventListener('focus', onResize);
        removeResetListener();
        removeMainWindowResizeListener();
        dataListener();
        term.current?.dispose();
        term.current = null;
        fitAddon.current = null;
      };
    }
  }, [containerRef, sessionId]);

  useEffect(() => {
    if (visible && term.current && fitAddon.current && containerRef.current) {
      // Trigger resize immediately when becoming visible
      // We use requestAnimationFrame to ensure the browser has applied the 'display: flex' layout
      requestAnimationFrame(() => {
        if (containerRef.current && containerRef.current.clientWidth > 0) {
            try {
              const geometry = fitAddon.current?.proposeDimensions();
              if (geometry && geometry.cols > 0 && geometry.rows > 0) {
                window.electron.terminal.resize({
                  sessionId,
                  cols: geometry.cols,
                  rows: geometry.rows,
                });
              }
              fitAddon.current?.fit();
              term.current?.focus();
            } catch {
              // Ignore errors
            }
        }
      });
    }
  }, [visible, sessionId]);

  useEffect(() => {
    if (term.current) {
      term.current.options.theme = theme;
    }
  }, [theme]);

  return { term, fitAddon };
}
