import React from 'react'
import { Box, Text } from 'src/ink.js'
import { hasCustomLogo } from 'src/utils/customLogo.js'
import { CustomLogo } from './CustomLogo.js'

/** Plain-text banner (Gemini CLI-style), with optional custom logo art. */
export function WelcomeV2() {
  const showCustomLogo = hasCustomLogo()

  return (
    <Box flexDirection="column" marginBottom={1}>
      <CustomLogo />
      {!showCustomLogo && <Text bold={true}>Wellbin</Text>}
      <Text dimColor={true}>v{MACRO.VERSION}</Text>
    </Box>
  )
}
