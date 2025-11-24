/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import './GitStatusBadge.css';

interface GitStatusBadgeProps {
  added: number;
  deleted: number;
}

export function GitStatusBadge({ added, deleted }: GitStatusBadgeProps) {
  if (added === 0 && deleted === 0) return null;

  return (
    <div className="git-status-badge">
      {added > 0 && <span className="git-status-added">+{added}</span>}
      {deleted > 0 && <span className="git-status-deleted">-{deleted}</span>}
    </div>
  );
}
