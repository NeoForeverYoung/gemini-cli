/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session } from '../../types/session';

export class SessionService {
  private globalTempDir: string;

  constructor() {
    this.globalTempDir = path.join(os.homedir(), '.gemini', 'tmp');
  }

  async getRecentSessions(): Promise<Session[]> {
    try {
      const sessions: Session[] = [];
      const projectHashes = await fs.readdir(this.globalTempDir);

      for (const hash of projectHashes) {
        const projectDir = path.join(this.globalTempDir, hash);
        try {
          const stats = await fs.stat(projectDir);
          if (!stats.isDirectory()) continue;

          const files = await fs.readdir(projectDir);
          for (const file of files) {
            if (file.startsWith('checkpoint-') && file.endsWith('.json')) {
              const filePath = path.join(projectDir, file);
              try {
                const fileStats = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf-8');
                const json = JSON.parse(content);

                // Extract project path from the messages
                let projectPath = 'Unknown Project';
                const findPath = (text: string) => {
                  const match = text.match(
                    /I'm currently working in the directory: ([^\n]+)/,
                  );
                  return match ? match[1].trim() : null;
                };

                if (Array.isArray(json)) {
                  outerLoop: for (const message of json) {
                    if (message.parts) {
                      for (const part of message.parts) {
                        if (part.text) {
                          const found = findPath(part.text);
                          if (found) {
                            projectPath = found;
                            break outerLoop;
                          }
                        }
                      }
                    }
                  }
                }

                const tag = file.slice('checkpoint-'.length, -'.json'.length);
                // Decode tag (it might be URL encoded or similar if it has special chars, but usually it's safe)
                // The CLI uses decodeTagName but that's in core. For now, assume simple tags.

                sessions.push({
                  tag,
                  projectPath,
                  mtime: fileStats.mtime.toISOString(),
                  hash,
                });
              } catch (e) {
                console.error(`Failed to process checkpoint ${file}:`, e);
              }
            }
          }
        } catch (e) {
          // Ignore if not a directory or access denied
        }
      }

      return sessions.sort(
        (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
      );
    } catch (error) {
      console.error('Failed to get recent sessions:', error);
      return [];
    }
  }

  async deleteSession(hash: string, tag: string): Promise<void> {
    try {
      const checkpointPath = path.join(
        this.globalTempDir,
        hash,
        `checkpoint-${tag}.json`,
      );
      await fs.unlink(checkpointPath);
    } catch (error) {
      console.error(
        `Failed to delete session ${tag} in ${hash}:`,
        error,
      );
      throw error;
    }
  }
}
