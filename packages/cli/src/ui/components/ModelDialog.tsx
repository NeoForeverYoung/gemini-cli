/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { ThemedGradient } from './ThemedGradient.js';

interface ModelDialogProps {
  onClose: () => void;
}

type Category = 'auto' | 'manual';

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  const autoOptions = useMemo(
    () => [
      {
        value: DEFAULT_GEMINI_MODEL_AUTO,
        title: 'Auto',
        description: 'Let the system choose the best model for your task.',
        key: DEFAULT_GEMINI_MODEL_AUTO,
      },
      {
        value: GEMINI_MODEL_ALIAS_PRO,
        title: config?.getPreviewFeatures()
          ? `Pro (${PREVIEW_GEMINI_MODEL}, ${DEFAULT_GEMINI_MODEL})`
          : `Pro (${DEFAULT_GEMINI_MODEL})`,
        description:
          'For complex tasks that require deep reasoning and creativity',
        key: GEMINI_MODEL_ALIAS_PRO,
      },
      {
        value: GEMINI_MODEL_ALIAS_FLASH,
        title: `Flash (${DEFAULT_GEMINI_FLASH_MODEL})`,
        description: 'For tasks that need a balance of speed and reasoning',
        key: GEMINI_MODEL_ALIAS_FLASH,
      },
      {
        value: GEMINI_MODEL_ALIAS_FLASH_LITE,
        title: `Flash-Lite (${DEFAULT_GEMINI_FLASH_LITE_MODEL})`,
        description: 'For simple tasks that need to be done quickly',
        key: GEMINI_MODEL_ALIAS_FLASH_LITE,
      },
    ],
    [config],
  );

  const manualOptions = useMemo(
    () => [
      {
        value: PREVIEW_GEMINI_MODEL,
        title: PREVIEW_GEMINI_MODEL,
        description: ' ',
        key: PREVIEW_GEMINI_MODEL,
      },
      {
        value: DEFAULT_GEMINI_MODEL,
        title: DEFAULT_GEMINI_MODEL,
        description: ' ',

        key: DEFAULT_GEMINI_MODEL,
      },
      {
        value: 'gemini-3-flash-preview',
        title: 'gemini-3-flash-preview',
        description: ' ',

        key: 'gemini-3-flash-preview',
      },
      {
        value: DEFAULT_GEMINI_FLASH_MODEL,
        title: DEFAULT_GEMINI_FLASH_MODEL,
        description: ' ',

        key: DEFAULT_GEMINI_FLASH_MODEL,
      },
      {
        value: 'gemini-3-flash-lite-preview',
        title: 'gemini-3-flash-lite-preview',
        description: ' ',

        key: 'gemini-3-flash-lite-preview',
      },
      {
        value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        title: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        description: ' ',

        key: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      },
    ],
    [],
  );

  const [category, setCategory] = useState<Category>(() => {
    const isAuto = autoOptions.some((opt) => opt.value === preferredModel);
    return isAuto ? 'auto' : 'manual';
  });

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
      if (key.name === 'left' || key.name === 'right') {
        setCategory((prev) => (prev === 'auto' ? 'manual' : 'auto'));
      }
    },
    { isActive: true },
  );

  const currentOptions = category === 'auto' ? autoOptions : manualOptions;

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(() => {
    const idx = currentOptions.findIndex(
      (option) => option.value === preferredModel,
    );
    return idx >= 0 ? idx : 0;
  }, [preferredModel, currentOptions]);

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback(
    (model: string) => {
      if (config) {
        config.setModel(model);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
      onClose();
    },
    [config, onClose],
  );

  const header =
    category === 'auto'
      ? config?.getPreviewFeatures()
        ? 'Gemini 3 is now enabled.'
        : 'Gemini 3 is now available.'
      : 'Select Manual Model';

  const subheader =
    category === 'auto'
      ? config?.getPreviewFeatures()
        ? `To disable Gemini 3, disable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features\n\nWhen you select Auto or Pro, Gemini CLI will attempt to use ${PREVIEW_GEMINI_MODEL} first, before falling back to ${DEFAULT_GEMINI_MODEL}.`
        : `To use Gemini 3, enable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features`
      : 'No routing or fallback. Just use what you choose.';

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>

      {/* Category Tabs */}
      <Box flexDirection="row" marginTop={1} marginBottom={1} gap={2}>
        <Text
          bold={category === 'auto'}
          color={
            category === 'auto' ? theme.text.primary : theme.text.secondary
          }
          underline={category === 'auto'}
        >
          Auto
        </Text>
        <Text
          bold={category === 'manual'}
          color={
            category === 'manual' ? theme.text.primary : theme.text.secondary
          }
          underline={category === 'manual'}
        >
          Manual
        </Text>
      </Box>

      {/* Header / Subheader */}
      <Box marginBottom={1} flexDirection="column">
        {category === 'auto' ? (
          <ThemedGradient>
            <Text bold>{header}</Text>
          </ThemedGradient>
        ) : (
          <Text bold>{header}</Text>
        )}
        <Text>{subheader}</Text>
      </Box>

      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={currentOptions}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          {'To use a specific Gemini model on startup, use the --model flag.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
