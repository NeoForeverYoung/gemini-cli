/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  listExtensions,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import type { ExtensionUpdateInfo , ExtensionConfig } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import {
  emptyIcon,
  MessageType,
  type HistoryItemExtensionsList,
  type HistoryItemInfo,
} from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import open from 'open';
import process from 'node:process';
import { ExtensionManager } from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';
import { theme } from '../semantic-colors.js';
import { stat, access, cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXAMPLES_PATH = join(
  __dirname,
  '..',
  '..',
  'commands',
  'extensions',
  'examples',
);

async function listAction(context: CommandContext) {
  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions: context.services.config
      ? listExtensions(context.services.config)
      : [],
  };

  context.ui.addItem(historyItem, Date.now());
}

function updateAction(context: CommandContext, args: string): Promise<void> {
  const updateArgs = args.split(' ').filter((value) => value.length > 0);
  const all = updateArgs.length === 1 && updateArgs[0] === '--all';
  const names = all ? null : updateArgs;

  if (!all && names?.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions update <extension-names>|--all',
      },
      Date.now(),
    );
    return Promise.resolve();
  }

  let resolveUpdateComplete: (updateInfo: ExtensionUpdateInfo[]) => void;
  const updateComplete = new Promise<ExtensionUpdateInfo[]>(
    (resolve) => (resolveUpdateComplete = resolve),
  );

  const historyItem: HistoryItemExtensionsList = {
    type: MessageType.EXTENSIONS_LIST,
    extensions: context.services.config
      ? listExtensions(context.services.config)
      : [],
  };

  updateComplete.then((updateInfos) => {
    if (updateInfos.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No extensions to update.',
        },
        Date.now(),
      );
    }

    context.ui.addItem(historyItem, Date.now());
    context.ui.setPendingItem(null);
  });

  try {
    context.ui.setPendingItem(historyItem);

    context.ui.dispatchExtensionStateUpdate({
      type: 'SCHEDULE_UPDATE',
      payload: {
        all,
        names,
        onComplete: (updateInfos) => {
          resolveUpdateComplete(updateInfos);
        },
      },
    });
    if (names?.length) {
      const extensions = listExtensions(context.services.config!);
      for (const name of names) {
        const extension = extensions.find(
          (extension) => extension.name === name,
        );
        if (!extension) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Extension ${name} not found.`,
            },
            Date.now(),
          );
          continue;
        }
      }
    }
  } catch (error) {
    resolveUpdateComplete!([]);
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
  return updateComplete.then((_) => {});
}

async function restartAction(
  context: CommandContext,
  args: string,
): Promise<void> {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!extensionLoader) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: "Extensions are not yet loaded, can't restart yet",
      },
      Date.now(),
    );
    return;
  }

  const restartArgs = args.split(' ').filter((value) => value.length > 0);
  const all = restartArgs.length === 1 && restartArgs[0] === '--all';
  const names = all ? null : restartArgs;
  if (!all && names?.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions restart <extension-names>|--all',
      },
      Date.now(),
    );
    return Promise.resolve();
  }

  let extensionsToRestart = extensionLoader
    .getExtensions()
    .filter((extension) => extension.isActive);
  if (names) {
    extensionsToRestart = extensionsToRestart.filter((extension) =>
      names.includes(extension.name),
    );
    if (names.length !== extensionsToRestart.length) {
      const notFound = names.filter(
        (name) =>
          !extensionsToRestart.some((extension) => extension.name === name),
      );
      if (notFound.length > 0) {
        context.ui.addItem(
          {
            type: MessageType.WARNING,
            text: `Extension(s) not found or not active: ${notFound.join(
              ', ',
            )}`,
          },
          Date.now(),
        );
      }
    }
  }
  if (extensionsToRestart.length === 0) {
    // We will have logged a different message above already.
    return;
  }

  const s = extensionsToRestart.length > 1 ? 's' : '';

  const restartingMessage = {
    type: MessageType.INFO,
    text: `Restarting ${extensionsToRestart.length} extension${s}...`,
    color: theme.text.primary,
  };
  context.ui.addItem(restartingMessage, Date.now());

  const results = await Promise.allSettled(
    extensionsToRestart.map(async (extension) => {
      if (extension.isActive) {
        await extensionLoader.restartExtension(extension);
        context.ui.dispatchExtensionStateUpdate({
          type: 'RESTARTED',
          payload: {
            name: extension.name,
          },
        });
      }
    }),
  );

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failures.length > 0) {
    const errorMessages = failures
      .map((failure, index) => {
        const extensionName = extensionsToRestart[index].name;
        return `${extensionName}: ${getErrorMessage(failure.reason)}`;
      })
      .join('\n  ');
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to restart some extensions:\n  ${errorMessages}`,
      },
      Date.now(),
    );
  } else {
    const infoItem: HistoryItemInfo = {
      type: MessageType.INFO,
      text: `${extensionsToRestart.length} extension${s} restarted successfully.`,
      icon: emptyIcon,
      color: theme.text.primary,
    };
    context.ui.addItem(infoItem, Date.now());
  }
}

async function exploreAction(context: CommandContext) {
  const extensionsUrl = 'https://geminicli.com/extensions/';

  // Only check for NODE_ENV for explicit test mode, not for unit test framework
  if (process.env['NODE_ENV'] === 'test') {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Would open extensions page in your browser: ${extensionsUrl} (skipped in test environment)`,
      },
      Date.now(),
    );
  } else if (
    process.env['SANDBOX'] &&
    process.env['SANDBOX'] !== 'sandbox-exec'
  ) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `View available extensions at ${extensionsUrl}`,
      },
      Date.now(),
    );
  } else {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Opening extensions page in your browser: ${extensionsUrl}`,
      },
      Date.now(),
    );
    try {
      await open(extensionsUrl);
    } catch (_error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to open browser. Check out the extensions gallery at ${extensionsUrl}`,
        },
        Date.now(),
      );
    }
  }
}

function getEnableDisableContext(
  context: CommandContext,
  argumentsString: string,
): {
  extensionManager: ExtensionManager;
  names: string[];
  scope: SettingScope;
} | null {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error(
      `Cannot ${context.invocation?.name} extensions in this environment`,
    );
    return null;
  }
  const parts = argumentsString.split(' ');
  const name = parts[0];
  if (
    name === '' ||
    !(
      (parts.length === 2 && parts[1].startsWith('--scope=')) || // --scope=<scope>
      (parts.length === 3 && parts[1] === '--scope') // --scope <scope>
    )
  ) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Usage: /extensions ${context.invocation?.name} <extension> [--scope=<user|workspace|session>]`,
      },
      Date.now(),
    );
    return null;
  }
  let scope: SettingScope;
  // Transform `--scope=<scope>` to `--scope <scope>`.
  if (parts.length === 2) {
    parts.push(...parts[1].split('='));
    parts.splice(1, 1);
  }
  switch (parts[2].toLowerCase()) {
    case 'workspace':
      scope = SettingScope.Workspace;
      break;
    case 'user':
      scope = SettingScope.User;
      break;
    case 'session':
      scope = SettingScope.Session;
      break;
    default:
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Unsupported scope ${parts[2]}, should be one of "user", "workspace", or "session"`,
        },
        Date.now(),
      );
      debugLogger.error();
      return null;
  }
  let names: string[] = [];
  if (name === '--all') {
    let extensions = extensionLoader.getExtensions();
    if (context.invocation?.name === 'enable') {
      extensions = extensions.filter((ext) => !ext.isActive);
    }
    if (context.invocation?.name === 'disable') {
      extensions = extensions.filter((ext) => ext.isActive);
    }
    names = extensions.map((ext) => ext.name);
  } else {
    names = [name];
  }

  return {
    extensionManager: extensionLoader,
    names,
    scope,
  };
}

async function disableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { names, scope, extensionManager } = enableContext;
  for (const name of names) {
    await extensionManager.disableExtension(name, scope);
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${name}" disabled for the scope "${scope}"`,
      },
      Date.now(),
    );
  }
}

async function enableAction(context: CommandContext, args: string) {
  const enableContext = getEnableDisableContext(context, args);
  if (!enableContext) return;

  const { names, scope, extensionManager } = enableContext;
  for (const name of names) {
    await extensionManager.enableExtension(name, scope);
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${name}" enabled for the scope "${scope}"`,
      },
      Date.now(),
    );
  }
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch (_e) {
    return false;
  }
}

async function createDirectory(path: string) {
  if (await pathExists(path)) {
    throw new Error(`Path already exists: ${path}`);
  }
  await mkdir(path, { recursive: true });
}

async function copyDirectory(template: string, path: string) {
  await createDirectory(path);

  const examplePath = join(EXAMPLES_PATH, template);
  const entries = await readdir(examplePath, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(examplePath, entry.name);
    const destPath = join(path, entry.name);
    await cp(srcPath, destPath, { recursive: true });
  }
}

async function newAction(context: CommandContext, args: string) {
  const [path, template] = args.split(' ').filter(Boolean);
  if (!path) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions new <path> [template]',
      },
      Date.now(),
    );
    return;
  }

  try {
    if (template) {
      await copyDirectory(template, path);
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Successfully created new extension from template "${template}" at ${path}.`,
        },
        Date.now(),
      );
    } else {
      await createDirectory(path);
      const extensionName = basename(path);
      const manifest = {
        name: extensionName,
        version: '1.0.0',
      };
      await writeFile(
        join(path, 'gemini-extension.json'),
        JSON.stringify(manifest, null, 2),
      );
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Successfully created new extension at ${path}.`,
        },
        Date.now(),
      );
    }
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `You can install this using "gemini extensions link ${path}" to test it out.`,
      },
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
}

async function validateAction(context: CommandContext, args: string) {
  const path = args.trim();
  if (!path) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions validate <path>',
      },
      Date.now(),
    );
    return;
  }

  try {
    const extensionLoader = context.services.config?.getExtensionLoader();
    if (!(extensionLoader instanceof ExtensionManager)) {
      debugLogger.error('Cannot validate extensions in this environment');
      return;
    }

    const absoluteInputPath = join(process.cwd(), path);
    const extensionConfig: ExtensionConfig =
      extensionLoader.loadExtensionConfig(absoluteInputPath);
    const warnings: string[] = [];
    const errors: string[] = [];

    if (extensionConfig.contextFileName) {
      const contextFileNames = Array.isArray(extensionConfig.contextFileName)
        ? extensionConfig.contextFileName
        : [extensionConfig.contextFileName];

      const missingContextFiles: string[] = [];
      for (const contextFilePath of contextFileNames) {
        const contextFileAbsolutePath = join(
          absoluteInputPath,
          contextFilePath,
        );
        if (!fs.existsSync(contextFileAbsolutePath)) {
          missingContextFiles.push(contextFilePath);
        }
      }
      if (missingContextFiles.length > 0) {
        errors.push(
          `The following context files referenced in gemini-extension.json are missing: ${missingContextFiles}`,
        );
      }
    }

    if (!semver.valid(extensionConfig.version)) {
      warnings.push(
        `Warning: Version '${extensionConfig.version}' does not appear to be standard semver (e.g., 1.0.0).`,
      );
    }

    if (warnings.length > 0) {
      for (const warning of warnings) {
        context.ui.addItem(
          {
            type: MessageType.WARNING,
            text: warning,
          },
          Date.now(),
        );
      }
    }

    if (errors.length > 0) {
      for (const error of errors) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: error,
          },
          Date.now(),
        );
      }
      throw new Error('Extension validation failed.');
    }
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension ${path} has been successfully validated.`,
      },
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
}

async function uninstallAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error('Cannot uninstall extensions in this environment');
    return;
  }
  const names = args.split(' ').filter((value) => value.length > 0);
  if (names.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions uninstall <extension-names...>',
      },
      Date.now(),
    );
    return;
  }

  const errors: Array<{ name: string; error: string }> = [];
  for (const name of [...new Set(names)]) {
    try {
      await extensionLoader.uninstallExtension(name, false);
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Extension "${name}" successfully uninstalled.`,
        },
        Date.now(),
      );
    } catch (error) {
      errors.push({ name, error: getErrorMessage(error) });
    }
  }

  if (errors.length > 0) {
    for (const { name, error } of errors) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to uninstall "${name}": ${error}`,
        },
        Date.now(),
      );
    }
  }
}

async function installAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error('Cannot install extensions in this environment');
    return;
  }

  // This is a very basic arg parser.
  const source = args.split(' ')[0];
  if (!source) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions install <source>',
      },
      Date.now(),
    );
    return;
  }

  try {
    let installMetadata: ExtensionInstallMetadata;
    if (
      source.startsWith('http://') ||
      source.startsWith('https://') ||
      source.startsWith('git@') ||
      source.startsWith('sso://')
    ) {
      installMetadata = {
        source,
        type: 'git',
        // TODO: support other args
      };
    } else {
      try {
        await stat(source);
        installMetadata = {
          source,
          type: 'local',
        };
      } catch {
        throw new Error('Install source not found.');
      }
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Installing extension from ${source}...`,
      },
      Date.now(),
    );

    const extension =
      await extensionLoader.installOrUpdateExtension(installMetadata);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${extension.name}" installed successfully and enabled.`,
      },
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
}

async function linkAction(context: CommandContext, args: string) {
  const extensionLoader = context.services.config?.getExtensionLoader();
  if (!(extensionLoader instanceof ExtensionManager)) {
    debugLogger.error('Cannot link extensions in this environment');
    return;
  }

  const path = args.trim();
  if (!path) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /extensions link <path>',
      },
      Date.now(),
    );
    return;
  }

  try {
    const installMetadata: ExtensionInstallMetadata = {
      source: path,
      type: 'link',
    };

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Linking extension from ${path}...`,
      },
      Date.now(),
    );

    const extension =
      await extensionLoader.installOrUpdateExtension(installMetadata);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Extension "${extension.name}" linked successfully and enabled.`,
      },
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: getErrorMessage(error),
      },
      Date.now(),
    );
  }
}

/**
 * Exported for testing.
 */
export function completeExtensions(
  context: CommandContext,
  partialArg: string,
) {
  let extensions = context.services.config?.getExtensions() ?? [];

  if (context.invocation?.name === 'enable') {
    extensions = extensions.filter((ext) => !ext.isActive);
  }
  if (
    context.invocation?.name === 'disable' ||
    context.invocation?.name === 'restart'
  ) {
    extensions = extensions.filter((ext) => ext.isActive);
  }
  const extensionNames = extensions.map((ext) => ext.name);
  const suggestions = extensionNames.filter((name) =>
    name.startsWith(partialArg),
  );

  if ('--all'.startsWith(partialArg) || 'all'.startsWith(partialArg)) {
    suggestions.unshift('--all');
  }

  return suggestions;
}

export function completeExtensionsAndScopes(
  context: CommandContext,
  partialArg: string,
) {
  return completeExtensions(context, partialArg).flatMap((s) => [
    `${s} --scope user`,
    `${s} --scope workspace`,
    `${s} --scope session`,
  ]);
}

const listExtensionsCommand: SlashCommand = {
  name: 'list',
  description: 'List active extensions',
  kind: CommandKind.BUILT_IN,
  action: listAction,
};

const updateExtensionsCommand: SlashCommand = {
  name: 'update',
  description: 'Update extensions. Usage: update <extension-names>|--all',
  kind: CommandKind.BUILT_IN,
  action: updateAction,
  completion: completeExtensions,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an extension',
  kind: CommandKind.BUILT_IN,
  action: disableAction,
  completion: completeExtensionsAndScopes,
};

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable an extension',
  kind: CommandKind.BUILT_IN,
  action: enableAction,
  completion: completeExtensionsAndScopes,
};

const exploreExtensionsCommand: SlashCommand = {
  name: 'explore',
  description: 'Open extensions page in your browser',
  kind: CommandKind.BUILT_IN,
  action: exploreAction,
};

const restartCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart all extensions',
  kind: CommandKind.BUILT_IN,
  action: restartAction,
  completion: completeExtensions,
};

const installCommand: SlashCommand = {
  name: 'install',
  description:
    'Installs an extension from a git repository URL or a local path',
  kind: CommandKind.BUILT_IN,
  action: installAction,
};

const linkCommand: SlashCommand = {
  name: 'link',
  description:
    'Links an extension from a local path. Updates made to the local path will always be reflected.',
  kind: CommandKind.BUILT_IN,
  action: linkAction,
};

const newCommand: SlashCommand = {
  name: 'new',
  description: 'Create a new extension from a boilerplate example.',
  kind: CommandKind.BUILT_IN,
  action: newAction,
};

const uninstallCommand: SlashCommand = {
  name: 'uninstall',
  description: 'Uninstalls one or more extensions.',
  kind: CommandKind.BUILT_IN,
  action: uninstallAction,
  completion: completeExtensions,
};

const validateCommand: SlashCommand = {
  name: 'validate',
  description: 'Validates an extension from a local path.',
  kind: CommandKind.BUILT_IN,
  action: validateAction,
};

export function extensionsCommand(
  enableExtensionReloading?: boolean,
): SlashCommand {
  const conditionalCommands = enableExtensionReloading
    ? [disableCommand, enableCommand]
    : [];
  return {
    name: 'extensions',
    description: 'Manage extensions',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      listExtensionsCommand,
      updateExtensionsCommand,
      exploreExtensionsCommand,
      restartCommand,
      installCommand,
      linkCommand,
      newCommand,
      uninstallCommand,
      validateCommand,
      ...conditionalCommands,
    ],
    action: (context, args) =>
      // Default to list if no subcommand is provided
      listExtensionsCommand.action!(context, args),
  };
}
