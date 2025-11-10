/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';
import type {
  FallbackDialogOption,
  ResolvedModelRecommendation,
} from '../contexts/UIStateContext.js';
import type { FallbackIntent } from '@google/gemini-cli-core';

interface ProQuotaDialogProps {
  failedModel: string;
  recommendation: ResolvedModelRecommendation;
  title: string;
  choices: FallbackDialogOption[];
  onChoice: (choice: FallbackIntent) => void;
}

export function ProQuotaDialog({
  failedModel,
  recommendation,
  title,
  choices,
  onChoice,
}: ProQuotaDialogProps): React.JSX.Element {
  const items = choices.map(({ label, intent, key }) => ({
    label,
    value: intent,
    key,
  }));

  const defaultIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.defaultSelected),
  );

  const fallbackModel = recommendation.selected;

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold color={theme.status.warning}>
        {title}
      </Text>
      <Text>
        {failedModel} → {fallbackModel}
      </Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={defaultIndex}
          onSelect={onChoice}
        />
      </Box>
      <Text color={theme.text.primary}>
        Note: You can always use /model to select a different option.
      </Text>
    </Box>
  );
}
