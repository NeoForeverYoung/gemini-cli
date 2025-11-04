/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface BannerProps {
  bannerText: string;
}

export const Banner = ({ bannerText }: BannerProps) => {
  const settings = useSettings();
  const config = useConfig();

  if (settings.merged.ui?.hideBanner || config.getScreenReader()) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text color="yellow">{bannerText}</Text>
    </Box>
  );
};
