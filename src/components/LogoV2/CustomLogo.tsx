import React from 'react'
import { Box, Text } from '../../ink.js'
import { getCustomLogoLines } from '../../utils/customLogo.js'

export function CustomLogo() {
  const lines = getCustomLogoLines()

  if (!lines) {
    return null
  }

  return (
    <Box flexDirection="column" alignItems="flex-start">
      {lines.map((line, index) => (
        <Text key={`${index}:${line}`} color="claude">
          {line.length > 0 ? line : ' '}
        </Text>
      ))}
    </Box>
  )
}
