/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Star, Copy, GitBranch, Database, Download, Loader2, Check, Box } from 'lucide-react';
import type { AvailableExtension } from '../../types/extensions';
import './ExtensionDetailModal.css';

interface ExtensionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  extension: AvailableExtension | null;
}

export function ExtensionDetailModal({
  isOpen,
  onClose,
  extension,
}: ExtensionDetailModalProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);

  const installCommand = extension
    ? `gemini extensions install https://github.com/${extension.author}/${extension.name}`
    : '';

  if (!isOpen || !extension) return null;

  const handleCopyClick = () => {
    navigator.clipboard.writeText(installCommand);
    // TODO: Add a visual feedback for copying
  };

  const handleViewInGithubClick = () => {
    // Assuming a direct mapping to GitHub URL for now
    const githubUrl = `https://github.com/${extension.author}/${extension.name}`;
    window.electron.openExternal(githubUrl);
  };

  const handleInstallClick = async () => {
    setIsInstalling(true);
    setInstallError(null);
    setInstallSuccess(false);
    try {
      const source = `https://github.com/${extension.author}/${extension.name}`;
      await window.electron.extensions.install(source);
      setInstallSuccess(true);
      
      // Restart CLI after short delay to allow user to see success state
      setTimeout(() => {
        window.electron.settings.restartTerminal();
        onClose(); // Optional: close modal after install
      }, 1500);
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="detail-modal-header">
          <button className="close-button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="extension-detail-container">
          <div className="detail-header">
            <div className="detail-icon-name-row">
              {extension.icon ? (
                <img
                  src={extension.icon}
                  className="detail-card-icon"
                  alt=""
                />
              ) : (
                <div className="detail-card-icon-placeholder">
                  <Box size={20} />
                </div>
              )}
              <div className="detail-text-content">
                <h2 className="detail-title">{extension.name}</h2>
                <span className="detail-author">@{extension.author}</span>
              </div>
            </div>
            <div className="detail-meta-info">
              {extension.stars !== undefined && (
                <div className="detail-stars">
                  <Star size={14} />
                  <span>{extension.stars}</span>
                </div>
              )}
              <span className="detail-version">{extension.version}</span>
              <div className="detail-tags">
                {extension.tags?.map((tag) => (
                  <span key={tag} className="detail-tag">
                    {tag === 'MCP' && <Database size={12} />}
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="detail-description">{extension.description}</p>

          <div className="install-section">
            <h3>Install this extension</h3>
            <div className="install-command-box">
              <pre>${installCommand}</pre>
              <button className="copy-button" onClick={handleCopyClick}>
                <Copy size={16} />
              </button>
            </div>
            <p className="disclaimer">
              The extensions listed here are sourced from public repositories and
              created by third-party developers. Google does not yet, endorse,
              or guarantee the functionality or security of these extensions.
              Please carefully inspect any extension and its source code before
              installing to understand the permissions it requires and the
              actions it may perform.
            </p>
            <div className="button-group">
              <button
                className="view-github-button"
                onClick={handleViewInGithubClick}
              >
                <GitBranch size={16} />
                View in Github
              </button>

              <button
                className={`install-button ${isInstalling ? 'installing' : ''} ${installSuccess ? 'success' : ''}`}
                onClick={handleInstallClick}
                disabled={isInstalling || installSuccess}
              >
                {isInstalling ? (
                  <Loader2 size={16} className="spinner" />
                ) : installSuccess ? (
                  <Check size={16} />
                ) : (
                  <Download size={16} />
                )}
                {isInstalling
                  ? 'Installing...'
                  : installSuccess
                    ? 'Installed'
                    : 'Install Extension'}
              </button>
            </div>
            {installError && (
              <p className="install-error">Error: {installError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
