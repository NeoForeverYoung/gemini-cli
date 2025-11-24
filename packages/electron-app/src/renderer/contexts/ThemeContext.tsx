/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { CliTheme, XtermTheme } from '../types/global';

// Default theme (Dracula-ish)
const defaultTheme: XtermTheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#44475a',
  black: '#000000',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#bfbfbf',
  brightBlack: '#4d4d4d',
  brightRed: '#ff6e67',
  brightGreen: '#5af78e',
  brightYellow: '#f4f99d',
  brightBlue: '#caa9fa',
  brightMagenta: '#ff92d0',
  brightCyan: '#9aedfe',
  brightWhite: '#e6e6e6',
};

interface ThemeContextType {
  theme: XtermTheme;
  setTheme: (theme: Partial<CliTheme> | Partial<XtermTheme>) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setInternalTheme] = useState<XtermTheme>(defaultTheme);

  const setTheme = (newTheme: Partial<CliTheme> | Partial<XtermTheme>) => {
    if ('colors' in newTheme && newTheme.colors) {
      // It's a CliTheme
      const colors = newTheme.colors;
      setInternalTheme({
        background: colors.Background,
        foreground: colors.Foreground,
        cursor: colors.Foreground,
        selectionBackground: '#44475a', // Default or derived?
        black: '#000000',
        red: colors.AccentRed,
        green: colors.AccentGreen,
        yellow: colors.AccentYellow,
        blue: colors.AccentBlue,
        magenta: colors.AccentPurple,
        cyan: colors.AccentCyan,
        white: '#bfbfbf',
        brightBlack: '#4d4d4d',
        brightRed: colors.AccentRed,
        brightGreen: colors.AccentGreen,
        brightYellow: colors.AccentYellow,
        brightBlue: colors.AccentBlue,
        brightMagenta: colors.AccentPurple,
        brightCyan: colors.AccentCyan,
        brightWhite: '#e6e6e6',
      });
    } else {
      // It's likely an XtermTheme or partial
      setInternalTheme((prev) => ({ ...prev, ...newTheme }));
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
