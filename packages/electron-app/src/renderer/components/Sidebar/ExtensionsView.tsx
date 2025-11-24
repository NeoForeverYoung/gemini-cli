/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Blocks, Plus, Trash2 } from 'lucide-react';
import { useExtensions } from '../../hooks/useExtensions';
import { BrowseExtensionsModal } from './BrowseExtensionsModal';
import './ExtensionsView.css';

interface ExtensionsViewProps {
  isCollapsed: boolean;
}

export function ExtensionsView({ isCollapsed }: ExtensionsViewProps) {
  const { extensions, isLoading, error, refresh } = useExtensions();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uninstallingExt, setUninstallingExt] = useState<string | null>(null);

  const handleUninstall = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (uninstallingExt) return;

    if (confirm(`Are you sure you want to uninstall "${name}"?`)) {
      setUninstallingExt(name);
      try {
        await window.electron.extensions.uninstall(name);
        await refresh();
      } catch (err) {
        console.error('Failed to uninstall extension:', err);
        alert(`Failed to uninstall extension: ${(err as Error).message}`);
      } finally {
        setUninstallingExt(null);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    refresh();
  };

  if (isLoading) {
    return <div className="sidebar-message loading">Loading...</div>;
  }

  if (error) {
    return <div className="sidebar-message error">Error loading extensions</div>;
  }

  return (
    <>
      <div className="extensions-view-container">
        {extensions.length === 0 ? (
          <div className="sidebar-message">No extensions installed</div>
        ) : (
          <ul className="extensions-list">
            {extensions.map((ext) => (
              <li key={ext.name} className="extension-item-container">
                <div
                  className="extension-item"
                  title={`${ext.name} v${ext.version}`}
                >
                  <div className="sidebar-icon-container">
                    {ext.icon ? (
                      <img
                        src={ext.icon}
                        alt=""
                        className="workspace-icon extension-icon"
                      />
                    ) : (
                      <Blocks size={16} className="workspace-icon" />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <div className="extension-info">
                        <div className="extension-header">
                          <span className="extension-name">{ext.name}</span>
                          <span className="extension-version">
                            v{ext.version}
                          </span>
                        </div>
                        {ext.description && (
                          <span className="extension-description">
                            {ext.description}
                          </span>
                        )}
                      </div>
                      <button
                        className={`extension-action-button delete ${uninstallingExt === ext.name ? 'loading' : ''}`}
                        onClick={(e) => handleUninstall(e, ext.name)}
                        title="Uninstall"
                        disabled={!!uninstallingExt}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="extensions-footer">
          <button
            className="browse-button"
            onClick={() => setIsModalOpen(true)}
            title="Browse Extensions"
          >
            <Plus size={14} />
            {!isCollapsed && <span>Browse Extensions</span>}
          </button>
        </div>
      </div>
      <BrowseExtensionsModal isOpen={isModalOpen} onClose={handleModalClose} />
    </>
  );
}
