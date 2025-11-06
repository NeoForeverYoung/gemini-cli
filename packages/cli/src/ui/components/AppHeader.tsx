/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { useEffect, useState } from 'react';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { Banner } from './Banner.js';
import { coreEvents, CoreEvent, type ExperimentsChangedPayload } from '@google/gemini-cli-core';
import type { Flag } from '@google/gemini-cli-core/src/code_assist/experiments/types.js';
import { theme } from '../semantic-colors.js';

interface AppHeaderProps {
  version: string;
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly } = useUIState();
  const [flags, setFlags] = useState<Record<string, Flag>>(() => {
  const initial = config.getExperiments();
  return initial?.flags ? { ...initial.flags } : {};
});

  useEffect(() => {
    const handleExperimentsChanged = (payload: ExperimentsChangedPayload) => {
      if (payload.experiments?.flags) {
        setFlags({ ...payload.experiments.flags });
      }
    };
    coreEvents.on(CoreEvent.ExperimentsChanged, handleExperimentsChanged);
    return () => {
      coreEvents.off(CoreEvent.ExperimentsChanged, handleExperimentsChanged);
    };
  }, [config]);

  const contextCompressionFlag =
    flags['GeminiCLIContextCompression__threshold_fraction'];

  const defaultText = contextCompressionFlag
    ? `Context compression enabled with threshold: ${contextCompressionFlag.floatValue}`
    : undefined;

  const capacityIssuesText = "";

  // const defaultText = flags['GeminiCLIBannerText__no_capacity_issues'].stringValue
  // const capacityIssuesText = flags['GeminiCLIBannerText__capacity_issues'].stringValue

  const  bannerText = capacityIssuesText === "" ? defaultText : capacityIssuesText;
  const fontColor = capacityIssuesText === "" ? theme.ui.gradient ? theme.ui.gradient : theme.status.success : theme.status.error
  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <Header version={version} nightly={nightly} />
      )}
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && bannerText && (
      <Banner bannerText={bannerText} color={fontColor}/> )} 
      {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
        <Tips config={config} />
      )}
    </Box>
  );
};