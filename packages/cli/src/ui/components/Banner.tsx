/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

interface BannerProps {
  bannerText: string;
  color: string[] | string;
}

export const Banner = ({ bannerText, color }: BannerProps) => (
  <Box flexDirection="column" paddingBottom={1} paddingTop={2}>
    {Array.isArray(color) ? (
      <Gradient colors={color}>
        <Text>{bannerText}</Text>
      </Gradient>
    ) : (
      <Text color={color}>{bannerText}</Text>
    )}
  </Box>
);
