/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isGitRepository: vi.fn(),
  };
});
const mocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

// Mock child_process because we can't spy on ESM namespace
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: mocks.execSync,
  };
});

// Mock debugLogger to avoid polluting output
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('getInstallationInfo', () => {
  let tempDir: string;
  let projectRoot: string;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    originalArgv = [...process.argv];

    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-install-test-'));
    // Canonicalize the path to resolve any symlinks (like /var -> /private/var on macOS)
    tempDir = fs.realpathSync(tempDir);
    projectRoot = tempDir;

    // Mock process.cwd() to return the temp directory
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});

    // Default execSync to fail
    mocks.execSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
  });

  afterEach(() => {
    // Clean up
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors
    }
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('should return UNKNOWN when cliPath is not available', () => {
    process.argv[1] = '';
    const info = getInstallationInfo(projectRoot, false);
    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
  });

  it('should return UNKNOWN and log error if cliPath does not exist', () => {
    process.argv[1] = path.join(tempDir, 'non-existent-cli');

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    // Since fs.realpathSync throws for non-existent files, debugLogger should be called
    expect(debugLogger.log).toHaveBeenCalled();
  });

  it('should detect running from a local git clone', () => {
    // Setup: Create a .git directory to simulate a git repo
    fs.mkdirSync(path.join(tempDir, '.git'));

    const cliDir = path.join(tempDir, 'packages', 'cli', 'dist');
    fs.mkdirSync(cliDir, { recursive: true });
    const cliPath = path.join(cliDir, 'index.js');
    fs.writeFileSync(cliPath, ''); // Create dummy file

    process.argv[1] = cliPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('should detect running via npx', () => {
    const npxDir = path.join(tempDir, '.npm', '_npx', '12345', 'bin');
    fs.mkdirSync(npxDir, { recursive: true });
    const npxPath = path.join(npxDir, 'gemini');
    fs.writeFileSync(npxPath, '');

    process.argv[1] = npxPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.NPX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via npx, update not applicable.');
  });

  it('should detect running via pnpx', () => {
    const pnpxDir = path.join(tempDir, '.pnpm', '_pnpx', '12345', 'bin');
    fs.mkdirSync(pnpxDir, { recursive: true });
    const pnpxPath = path.join(pnpxDir, 'gemini');
    fs.writeFileSync(pnpxPath, '');

    process.argv[1] = pnpxPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.PNPX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via pnpx, update not applicable.');
  });

  it('should detect running via bunx', () => {
    const bunxDir = path.join(
      tempDir,
      '.bun',
      'install',
      'cache',
      '12345',
      'bin',
    );
    fs.mkdirSync(bunxDir, { recursive: true });
    const bunxPath = path.join(bunxDir, 'gemini');
    fs.writeFileSync(bunxPath, '');

    process.argv[1] = bunxPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.BUNX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via bunx, update not applicable.');
  });

  it('should detect Homebrew installation via execSync', () => {
    // Only run this test on Darwin (or mock platform if possible, but we rely on process.platform)
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const cliDir = path.join(tempDir, 'usr', 'local', 'bin');
    fs.mkdirSync(cliDir, { recursive: true });
    const cliPath = path.join(cliDir, 'gemini');
    fs.writeFileSync(cliPath, '');

    process.argv[1] = cliPath;

    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('brew list')) {
        return Buffer.from('gemini-cli');
      }
      throw new Error('Command failed');
    });

    const info = getInstallationInfo(projectRoot, false);

    expect(mocks.execSync).toHaveBeenCalledWith(
      'brew list -1 | grep -q "^gemini-cli$"',
      { stdio: 'ignore' },
    );
    expect(info.packageManager).toBe(PackageManager.HOMEBREW);
    expect(info.isGlobal).toBe(true);
    expect(info.updateMessage).toContain('brew upgrade');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should fall through if brew command fails', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const cliDir = path.join(tempDir, 'usr', 'local', 'bin');
    fs.mkdirSync(cliDir, { recursive: true });
    const cliPath = path.join(cliDir, 'gemini');
    fs.writeFileSync(cliPath, '');

    process.argv[1] = cliPath;
    // execSyncSpy is already configured to fail by default

    const info = getInstallationInfo(projectRoot, false);

    expect(mocks.execSync).toHaveBeenCalledWith(
      'brew list -1 | grep -q "^gemini-cli$"',
      { stdio: 'ignore' },
    );
    // Should fall back to default global npm
    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(true);

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should detect global pnpm installation', () => {
    const pnpmDir = path.join(
      tempDir,
      '.pnpm',
      'global',
      '5',
      'node_modules',
      '.pnpm',
      'some-hash',
      'node_modules',
      '@google',
      'gemini-cli',
      'dist',
    );
    fs.mkdirSync(pnpmDir, { recursive: true });
    const pnpmPath = path.join(pnpmDir, 'index.js');
    fs.writeFileSync(pnpmPath, '');

    process.argv[1] = pnpmPath;

    const info = getInstallationInfo(projectRoot, false);
    expect(info.packageManager).toBe(PackageManager.PNPM);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('pnpm add -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    const infoDisabled = getInstallationInfo(projectRoot, true);
    expect(infoDisabled.updateMessage).toContain('Please run pnpm add');
  });

  it('should detect global yarn installation', () => {
    const yarnDir = path.join(
      tempDir,
      '.yarn',
      'global',
      'node_modules',
      '@google',
      'gemini-cli',
      'dist',
    );
    fs.mkdirSync(yarnDir, { recursive: true });
    const yarnPath = path.join(yarnDir, 'index.js');
    fs.writeFileSync(yarnPath, '');

    process.argv[1] = yarnPath;

    const info = getInstallationInfo(projectRoot, false);
    expect(info.packageManager).toBe(PackageManager.YARN);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe(
      'yarn global add @google/gemini-cli@latest',
    );
    expect(info.updateMessage).toContain('Attempting to automatically update');

    const infoDisabled = getInstallationInfo(projectRoot, true);
    expect(infoDisabled.updateMessage).toContain('Please run yarn global add');
  });

  it('should detect global bun installation', () => {
    const bunDir = path.join(tempDir, '.bun', 'bin');
    fs.mkdirSync(bunDir, { recursive: true });
    const bunPath = path.join(bunDir, 'gemini');
    fs.writeFileSync(bunPath, '');

    process.argv[1] = bunPath;

    const info = getInstallationInfo(projectRoot, false);
    expect(info.packageManager).toBe(PackageManager.BUN);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('bun add -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    const infoDisabled = getInstallationInfo(projectRoot, true);
    expect(infoDisabled.updateMessage).toContain('Please run bun add');
  });

  it('should detect local installation and identify yarn from lockfile', () => {
    const localDir = path.join(projectRoot, 'node_modules', '.bin');
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, 'gemini');
    fs.writeFileSync(localPath, '');

    fs.writeFileSync(path.join(projectRoot, 'yarn.lock'), '');

    process.argv[1] = localPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.YARN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toContain('Locally installed');
  });

  it('should detect local installation and identify pnpm from lockfile', () => {
    const localDir = path.join(projectRoot, 'node_modules', '.bin');
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, 'gemini');
    fs.writeFileSync(localPath, '');

    fs.writeFileSync(path.join(projectRoot, 'pnpm-lock.yaml'), '');

    process.argv[1] = localPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.PNPM);
    expect(info.isGlobal).toBe(false);
  });

  it('should detect local installation and identify bun from lockfile', () => {
    const localDir = path.join(projectRoot, 'node_modules', '.bin');
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, 'gemini');
    fs.writeFileSync(localPath, '');

    fs.writeFileSync(path.join(projectRoot, 'bun.lockb'), '');

    process.argv[1] = localPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.BUN);
    expect(info.isGlobal).toBe(false);
  });

  it('should default to local npm installation if no lockfile is found', () => {
    const localDir = path.join(projectRoot, 'node_modules', '.bin');
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, 'gemini');
    fs.writeFileSync(localPath, '');

    process.argv[1] = localPath;

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(false);
  });

  it('should default to global npm installation for unrecognized paths', () => {
    const globalDir = path.join(tempDir, 'usr', 'local', 'bin');
    fs.mkdirSync(globalDir, { recursive: true });
    const globalPath = path.join(globalDir, 'gemini');
    fs.writeFileSync(globalPath, '');

    process.argv[1] = globalPath;

    const info = getInstallationInfo(projectRoot, false);
    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('npm install -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    const infoDisabled = getInstallationInfo(projectRoot, true);
    expect(infoDisabled.updateMessage).toContain('Please run npm install');
  });
});
