/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';

interface BannerProps {
  bannerText: string;
}

export const Banner = ({ bannerText }: BannerProps) => {

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text color="yellow">{bannerText}</Text>
    </Box>
  );
};
