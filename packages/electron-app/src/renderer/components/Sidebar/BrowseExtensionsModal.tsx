/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Star, Box, Check, Download, Loader2 } from 'lucide-react';
import type { AvailableExtension } from '../../types/extensions';
import { ExtensionDetailModal } from './ExtensionDetailModal';
import './BrowseExtensionsModal.css';

interface BrowseExtensionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrowseExtensionsModal({
  isOpen,
  onClose,
}: BrowseExtensionsModalProps) {
  const [extensions, setExtensions] = useState<AvailableExtension[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExtension, setSelectedExtension] = useState<AvailableExtension | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen && extensions.length === 0) {
      setIsLoading(true);
      window.electron.extensions
        .getAvailable()
        .then((data) => {
          setExtensions(data);
        })
        .catch((err) => {
          console.error('Failed to fetch extensions:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, extensions.length]);

  const filteredExtensions = useMemo(() => {
    if (!searchQuery) return extensions;
    const lowerQuery = searchQuery.toLowerCase();
    return extensions.filter(
      (ext) =>
        ext.name.toLowerCase().includes(lowerQuery) ||
        ext.description.toLowerCase().includes(lowerQuery) ||
        ext.author.toLowerCase().includes(lowerQuery),
    );
  }, [extensions, searchQuery]);

  // Mock spotlights for now, or pick top 3 by stars
  const spotlightExtensions = useMemo(() => {
    return [...extensions]
      .sort((a, b) => (b.stars || 0) - (a.stars || 0))
      .slice(0, 3);
  }, [extensions]);

  const handleCardClick = (extension: AvailableExtension) => {
    setSelectedExtension(extension);
    setIsDetailModalOpen(true);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedExtension(null);
  };

  return (
    <>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <button className="close-button" onClick={onClose}>
                <X size={24} />
              </button>
            </div>
            <div className="browse-container">
              <div className="browse-header">
                <h1>Extensions</h1>
                <p>
                  Connect your favorite tools and personalize your AI-powered
                  command line
                </p>
                <div className="search-bar-container">
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search by name, description, or keyword"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>

              <div className="browse-scroll-area">
                {!searchQuery && spotlightExtensions.length > 0 && (
                  <div className="extensions-section">
                    <h2>Spotlight Extensions</h2>
                    <div className="cards-grid spotlight">
                      {spotlightExtensions.map((ext) => (
                        <ExtensionCard
                          key={ext.id}
                          extension={ext}
                          onClick={handleCardClick}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="extensions-section">
                  <h2>
                    {searchQuery
                      ? `Search Results (${filteredExtensions.length})`
                      : `All Extensions (${filteredExtensions.length})`}
                  </h2>
                  {isLoading ? (
                    <div className="loading-indicator">
                      Loading extensions...
                    </div>
                  ) : (
                    <div className="cards-grid">
                      {filteredExtensions.map((ext) => (
                        <ExtensionCard
                          key={ext.id}
                          extension={ext}
                          onClick={handleCardClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <ExtensionDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleDetailModalClose}
        extension={selectedExtension}
      />
    </>
  );
}

function ExtensionCard({
  extension,
  onClick,
}: {
  extension: AvailableExtension;
  onClick: (ext: AvailableExtension) => void;
}) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInstalling || installSuccess) return;

    setIsInstalling(true);
    try {
      const source = `https://github.com/${extension.author}/${extension.name}`;
      await window.electron.extensions.install(source);
      setInstallSuccess(true);
      setTimeout(() => {
        window.electron.settings.restartTerminal();
      }, 1000);
    } catch (error) {
      console.error('Failed to install extension:', error);
      // Optionally show error state
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="extension-card" onClick={() => onClick(extension)}>
      <div className="card-header">
        <div className="card-title-row">
          <span className="card-title">{extension.name}</span>
          {extension.icon ? (
            <img src={extension.icon} className="card-icon" alt="" />
          ) : (
            <div className="card-icon-placeholder">
              <Box size={20} />
            </div>
          )}
        </div>
        <span className="card-author">@{extension.author}</span>
      </div>
      <div className="card-body">
        <p className="card-description">{extension.description}</p>
      </div>
      <div className="card-footer">
        <div className="card-tags">
          {extension.tags?.map((tag) => (
            <span key={tag} className="tag">
              {tag === 'MCP' && <Box size={12} style={{ marginRight: 4 }} />}
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {extension.stars !== undefined && (
            <div className="card-stars">
              <Star size={12} />
              <span>{extension.stars}</span>
            </div>
          )}
          <button
            className={`card-install-button ${isInstalling ? 'installing' : ''} ${installSuccess ? 'success' : ''}`}
            onClick={handleInstall}
            title={installSuccess ? 'Installed' : 'Install'}
          >
            {isInstalling ? (
              <Loader2 size={14} className="spinner" />
            ) : installSuccess ? (
              <Check size={14} />
            ) : (
              <Download size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
