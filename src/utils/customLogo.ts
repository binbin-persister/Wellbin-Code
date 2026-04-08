import { existsSync, readFileSync } from 'fs'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { stringWidth } from '../ink/stringWidth.js'
import { getClaudeConfigHomeDir } from './envUtils.js'

export const DEFAULT_CUSTOM_LOGO_FILENAME = 'wellbin-logo.txt'

function normalizeLogo(source: string): string[] | null {
  const normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const trimmed = normalized.trimEnd()

  if (!trimmed || trimmed.split('\n').every(line => line.trim().length === 0)) {
    return null
  }

  return trimmed.split('\n')
}

function readEnvLogo(): string[] | null {
  if (!process.env.WELLBIN_CUSTOM_LOGO) {
    return null
  }

  return normalizeLogo(process.env.WELLBIN_CUSTOM_LOGO.replaceAll('\\n', '\n'))
}

export function getDefaultCustomLogoPath(): string {
  return (
    process.env.WELLBIN_CUSTOM_LOGO_FILE ??
    join(getClaudeConfigHomeDir(), DEFAULT_CUSTOM_LOGO_FILENAME)
  )
}

const getCustomLogoLinesMemoized = memoize(
  (): string[] | null => {
    const envLogo = readEnvLogo()
    if (envLogo) {
      return envLogo
    }

    const logoPath = getDefaultCustomLogoPath()
    if (!existsSync(logoPath)) {
      return null
    }

    try {
      return normalizeLogo(readFileSync(logoPath, 'utf8'))
    } catch {
      return null
    }
  },
  () =>
    [
      process.env.WELLBIN_CUSTOM_LOGO ?? '',
      process.env.WELLBIN_CUSTOM_LOGO_FILE ?? '',
      process.env.CLAUDE_CONFIG_DIR ?? '',
    ].join('::'),
)

export function getCustomLogoLines(): string[] | null {
  return getCustomLogoLinesMemoized()
}

export function hasCustomLogo(): boolean {
  return getCustomLogoLines() !== null
}

export function getCustomLogoWidth(): number {
  const lines = getCustomLogoLines()

  if (!lines || lines.length === 0) {
    return 0
  }

  return Math.max(...lines.map(line => stringWidth(line)))
}
