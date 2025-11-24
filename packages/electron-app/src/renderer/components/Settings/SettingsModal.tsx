/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './SettingsModal.css';
import type {
  Settings,
  ThemeDisplay,
  SettingsSchema,
  SettingDefinition,
} from '@google/gemini-cli';
import { McpServerManager } from './McpServer/McpServerManager';
import { LanguageMappingsManager } from './LanguageMappings/LanguageMappingsManager';
import { useSettings } from '../../contexts/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: { id: string; cwd?: string }[];
}

// Helper to get nested properties safely
const get = (
  obj: Record<string, unknown>,
  path: string,
  defaultValue: unknown,
) => {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return defaultValue;
    }
    if (result === undefined || result === null || typeof result !== 'object') {
      return defaultValue;
    }
    result = (result as Record<string, unknown>)[key] as Record<
      string,
      unknown
    >;
  }
  return result === undefined ? defaultValue : result;
};

// Helper to set nested properties safely
const set = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return;
    }
    current[key] = current[key] || {};
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1];
  if (
    lastKey === '__proto__' ||
    lastKey === 'constructor' ||
    lastKey === 'prototype'
  ) {
    return;
  }
  current[lastKey] = value;
};

interface FlattenedSetting extends SettingDefinition {
  key: string;
}

function flattenSchema(
  schema: SettingsSchema,
  parentPath = '',
): FlattenedSetting[] {
  let result: FlattenedSetting[] = [];
  for (const key in schema) {
    const setting = schema[key];
    const path = parentPath ? `${parentPath}.${key}` : key;

    if (setting.showInDialog) {
      result.push({
        ...setting,
        key: path,
      });
    }

    if (setting.properties) {
      result = result.concat(flattenSchema(setting.properties, path));
    }
  }
  return result;
}

export function SettingsModal({
  isOpen,
  onClose,
  sessions,
}: SettingsModalProps) {
  const {
    settings: fullSettings,
    schema,
    refreshSettings,
    loading,
  } = useSettings();
  const [settings, setSettings] = useState<Partial<Settings>>(
    fullSettings?.merged || {},
  );
  const [availableThemes, setAvailableThemes] = useState<ThemeDisplay[]>([]);
  const [scope, setScope] = useState('User');
  const [activeCategory, setActiveCategory] = useState('General');
  const [envInput, setEnvInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const envDirty = useRef(false);
  const pendingChanges = useRef<Record<string, Record<string, unknown>>>({});
  const overrides = useRef<Map<string, unknown>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Manual settings metadata for search
  const manualSettings = useMemo(
    () => [
      {
        key: 'ui.theme',
        label: 'Theme',
        description: 'The color theme for the application.',
        category: 'UI',
      },
      {
        key: 'general.env',
        label: 'Environment Variables',
        description:
          'Set environment variables for the terminal session (e.g. API_KEY=value).',
        category: 'General',
      },
      {
        key: 'general.languages',
        label: 'Language Mappings',
        description:
          'Map file extensions to language names for syntax highlighting.',
        category: 'General',
      },
      {
        key: 'mcp.servers',
        label: 'MCP Servers',
        description: 'Configure Model Context Protocol servers.',
        category: 'MCP Servers',
      },
    ],
    [],
  );

  const flattenedSettings = useMemo(
    () => (schema ? flattenSchema(schema) : []),
    [schema],
  );

  const filteredSettings = useMemo(() => {
    if (!searchQuery) return flattenedSettings;
    const lowerQuery = searchQuery.toLowerCase();
    return flattenedSettings.filter(
      (s) =>
        s.key.toLowerCase().includes(lowerQuery) ||
        s.label.toLowerCase().includes(lowerQuery) ||
        (s.description && s.description.toLowerCase().includes(lowerQuery)) ||
        (s.category && s.category.toLowerCase().includes(lowerQuery)),
    );
  }, [flattenedSettings, searchQuery]);

  const isManualSettingVisible = useCallback(
    (settingKey: string) => {
      if (!searchQuery) return true;
      const lowerQuery = searchQuery.toLowerCase();
      const setting = manualSettings.find((s) => s.key === settingKey);
      if (!setting) return false;

      return (
        setting.label.toLowerCase().includes(lowerQuery) ||
        setting.description.toLowerCase().includes(lowerQuery) ||
        setting.category.toLowerCase().includes(lowerQuery)
      );
    },
    [searchQuery, manualSettings],
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();

    // Add dynamic settings categories
    filteredSettings.forEach((s) => cats.add(s.category || 'Uncategorized'));

    // Add manual settings categories if they are visible
    manualSettings.forEach((s) => {
      if (isManualSettingVisible(s.key)) {
        cats.add(s.category);
      }
    });

    const sortedCats = Array.from(cats).sort((a, b) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    });
    return sortedCats;
  }, [filteredSettings, isManualSettingVisible, manualSettings]);

  // Reset active category if it disappears from filter
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const prevIsOpen = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isSearchOpen) {
          e.preventDefault();
          e.stopPropagation(); // Prevent modal close if search is open
          setIsSearchOpen(false);
          setSearchQuery(''); // Optional: clear search on close
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      window.electron?.themes
        ?.get()
        .then(setAvailableThemes)
        .catch((err: Error) => console.error('Failed to get themes', err));

      refreshSettings();
      pendingChanges.current = {};
      overrides.current.clear();
      envDirty.current = false;
    }
    prevIsOpen.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (fullSettings?.merged) {
      const next = JSON.parse(JSON.stringify(fullSettings.merged)) as Record<
        string,
        unknown
      >;
      overrides.current.forEach((value, key) => {
        set(next, key, value);
      });
      setSettings(next);

      if (!envDirty.current) {
        setEnvInput(
          ((fullSettings.merged as Record<string, unknown>).env as string) ||
            '',
        );
      }
    }
  }, [fullSettings]);

  const handleChange = useCallback(
    (
      field: string,
      value: string | boolean | number | Record<string, unknown>,
    ) => {
      setSettings((prev) => {
        const newSettings = JSON.parse(JSON.stringify(prev)) as Record<
          string,
          unknown
        >;
        set(newSettings, field, value);
        return newSettings;
      });

      overrides.current.set(field, value);

      if (!pendingChanges.current[scope]) {
        pendingChanges.current[scope] = {};
      }
      set(pendingChanges.current[scope], field, value);
    },
    [scope],
  );

  const handleSave = async () => {
    setIsSaving(true);

    if (envDirty.current) {
      if (!pendingChanges.current[scope]) {
        pendingChanges.current[scope] = {};
      }
      pendingChanges.current[scope].env = envInput;
    }

    // Close immediately to avoid UI pause
    onClose();

    // Process in background
    try {
      const promises = Object.entries(pendingChanges.current).map(
        ([s, changes]) => window.electron.settings.set({ changes, scope: s }),
      );
      await Promise.all(promises);
      
      // Restart terminals in parallel
      await Promise.all(
        sessions.map((s) =>
          window.electron.settings.restartTerminal(s.id, s.cwd),
        ),
      );
      
      // Refresh settings last to update UI state if needed (though modal is closed)
      await refreshSettings();
    } catch (error) {
      console.error('Failed to save settings or restart terminal:', error);
      // Since modal is closed, we might want to show a toast or notification here in a real app
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const renderSetting = (config: FlattenedSetting) => {
    const value = get(settings as Record<string, unknown>, config.key, '');
    switch (config.type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            id={config.key}
            checked={!!value}
            onChange={(e) => handleChange(config.key, e.target.checked)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            id={config.key}
            value={value as number}
            onChange={(e) =>
              handleChange(config.key, parseInt(e.target.value, 10))
            }
          />
        );
      case 'string':
        return (
          <input
            type="text"
            id={config.key}
            value={value as string}
            onChange={(e) => handleChange(config.key, e.target.value)}
          />
        );
      case 'enum':
        return (
          <select
            id={config.key}
            value={value as string}
            onChange={(e) => handleChange(config.key, e.target.value)}
          >
            {config.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  if (loading && !fullSettings) {
    return (
      <div
        className="settings-container"
        style={{ justifyContent: 'center', alignItems: 'center' }}
      >
        <h2>Loading settings...</h2>
      </div>
    );
  }

  return (
    <div className="settings-container" onClick={(e) => e.stopPropagation()}>
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
        {isSearchOpen && (
          <div className="settings-search-popup">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="settings-search-input"
            />
          </div>
        )}
        <div className="settings-sidebar">
          <h2>Settings</h2>
          <div className="scope-selector">
            <label htmlFor="scope">Scope</label>
            <select
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="User">User</option>
              <option value="Workspace">Workspace</option>
              <option value="System">System</option>
            </select>
          </div>
          <ul>
            {categories.map((category) => (
              <li
                key={category}
                className={activeCategory === category ? 'active' : ''}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </li>
            ))}
          </ul>
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              className="close-button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                opacity: 1,
                fontWeight: 600,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '38px'
              }}
            >
              {isSaving ? (
                <div className="bouncing-loader">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              ) : (
                'Save'
              )}
            </button>
            <button
              className="close-button"
              onClick={handleCancel}
              disabled={isSaving}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                opacity: 1
              }}
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="settings-content">
          <h3>{activeCategory}</h3>
          {activeCategory === 'UI' && isManualSettingVisible('ui.theme') && (
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="ui.theme">Theme</label>
                <p>The color theme for the application.</p>
              </div>
              <div className="setting-control">
                <select
                  id="ui.theme"
                  value={
                    get(
                      settings as Record<string, unknown>,
                      'ui.theme',
                      '',
                    ) as string
                  }
                  onChange={(e) => handleChange('ui.theme', e.target.value)}
                >
                  <option value="">Default</option>
                  {availableThemes.map((theme) => (
                    <option key={theme.name} value={theme.name}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {filteredSettings
            .filter((s) => s.category === activeCategory)
            .map((config) => (
              <div className="setting-item" key={config.key}>
                <div className="setting-info">
                  <label htmlFor={config.key}>{config.label}</label>
                  <p>{config.description}</p>
                </div>
                <div className="setting-control">{renderSetting(config)}</div>
              </div>
            ))}
          {activeCategory === 'General' && (
            <>
              {isManualSettingVisible('general.env') && (
              <div className="setting-item">
                <div className="setting-info">
                  <label htmlFor="env">Environment Variables</label>
                  <p>
                    Set environment variables for the terminal session (e.g.
                    API_KEY=value). Separate entries with newlines or spaces.
                  </p>
                </div>
                <div className="setting-control">
                  <textarea
                    id="env"
                    value={envInput}
                    onChange={(e) => {
                      setEnvInput(e.target.value);
                      envDirty.current = true;
                    }}
                    placeholder="KEY=VALUE ANOTHER_KEY=VALUE"
                  />
                </div>
              </div>
              )}
              {isManualSettingVisible('general.languages') && (
              <div className="setting-item">
                <div className="setting-info">
                  <label>Language Mappings</label>
                  <p>
                    Map file extensions to language names for syntax highlighting.
                  </p>
                </div>
                <div className="setting-control">
                  <LanguageMappingsManager />
                </div>
              </div>
              )}
            </>
          )}
          {activeCategory === 'MCP Servers' && isManualSettingVisible('mcp.servers') && (
            <McpServerManager
              mcpServers={settings.mcpServers || {}}
              onChange={(newMcpServers) =>
                handleChange('mcpServers', newMcpServers)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
