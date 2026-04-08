/**
 * Download ripgrep binary from GitHub releases.
 *
 * Run automatically via `bun install` (postinstall hook),
 * or manually: `bun run scripts/download-ripgrep.ts [--force]`
 *
 * Idempotent — skips download if the binary already exists.
 * Use --force to re-download.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RG_VERSION = '15.0.1'
const BASE_URL = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${RG_VERSION}`

// --- Platform mapping ---

type PlatformMapping = {
  target: string
  ext: 'tar.gz' | 'zip'
}

function getPlatformMapping(): PlatformMapping {
  const arch = process.arch
  const platform = process.platform

  if (platform === 'darwin') {
    if (arch === 'arm64') return { target: 'aarch64-apple-darwin', ext: 'tar.gz' }
    if (arch === 'x64') return { target: 'x86_64-apple-darwin', ext: 'tar.gz' }
    throw new Error(`Unsupported macOS arch: ${arch}`)
  }

  if (platform === 'win32') {
    if (arch === 'x64') return { target: 'x86_64-pc-windows-msvc', ext: 'zip' }
    if (arch === 'arm64') return { target: 'aarch64-pc-windows-msvc', ext: 'zip' }
    throw new Error(`Unsupported Windows arch: ${arch}`)
  }

  if (platform === 'linux') {
    const isMusl = detectMusl()
    if (arch === 'x64') {
      // x64 Linux always uses musl (statically linked, most portable)
      return { target: 'x86_64-unknown-linux-musl', ext: 'tar.gz' }
    }
    if (arch === 'arm64') {
      return isMusl
        ? { target: 'aarch64-unknown-linux-musl', ext: 'tar.gz' }
        : { target: 'aarch64-unknown-linux-gnu', ext: 'tar.gz' }
    }
    throw new Error(`Unsupported Linux arch: ${arch}`)
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

function detectMusl(): boolean {
  const muslArch = process.arch === 'x64' ? 'x86_64' : 'aarch64'
  try {
    statSync(`/lib/libc.musl-${muslArch}.so.1`)
    return true
  } catch {
    return false
  }
}

// --- Target vendor path (must match ripgrep.ts logic) ---

function getVendorDir(): string {
  const packageRoot = path.resolve(__dirname, '..')

  // Dev mode: package root has src/ directory
  // ripgrep.ts at src/utils/ripgrep.ts: __dirname = src/utils/
  // vendor path = src/utils/vendor/ripgrep/
  if (existsSync(path.join(packageRoot, 'src'))) {
    return path.resolve(packageRoot, 'src', 'utils', 'vendor', 'ripgrep')
  }

  // Published mode: compiled chunks are flat in dist/
  // ripgrep chunk at dist/xxxx.js: __dirname = dist/
  // vendor path = dist/vendor/ripgrep/
  return path.resolve(packageRoot, 'dist', 'vendor', 'ripgrep')
}

function getBinaryPath(): string {
  const dir = getVendorDir()
  const subdir = `${process.arch}-${process.platform}`
  const binary = process.platform === 'win32' ? 'rg.exe' : 'rg'
  return path.resolve(dir, subdir, binary)
}

/** Archives may contain a top-level folder; locate rg / rg.exe anywhere under root. */
function findRgInTree(searchRoot: string): string | null {
  const want = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const walk = (dir: string): string | null => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        const found = walk(p)
        if (found) return found
      } else if (e.name === want) {
        return p
      }
    }
    return null
  }
  return walk(searchRoot)
}

function extractTarGz(archivePath: string, destDir: string): void {
  const result = spawnSync('tar', ['xzf', archivePath, '-C', destDir], {
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    const err = result.stderr?.toString() ?? result.stdout?.toString() ?? ''
    throw new Error(`tar extract failed: ${err}`)
  }
}

/** Windows: no Unix `unzip`; use built-in `tar` (Win10+) or PowerShell Expand-Archive. */
function extractZip(archivePath: string, destDir: string): void {
  if (process.platform === 'win32') {
    const tar = spawnSync('tar', ['-xf', archivePath, '-C', destDir], {
      stdio: 'pipe',
    })
    if (tar.status === 0) return

    const ap = archivePath.replace(/'/g, "''")
    const dd = destDir.replace(/'/g, "''")
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${ap}' -DestinationPath '${dd}' -Force`,
      ],
      { stdio: 'pipe' },
    )
    if (ps.status === 0) return

    const msg = [
      tar.stderr?.toString(),
      tar.stdout?.toString(),
      ps.stderr?.toString(),
      ps.stdout?.toString(),
    ]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`zip extract failed (tar + powershell): ${msg}`)
  }

  const result = spawnSync('unzip', ['-o', archivePath, '-d', destDir], {
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    const err = result.stderr?.toString() ?? result.stdout?.toString() ?? ''
    throw new Error(`unzip failed: ${err}`)
  }
}

// --- Download & extract ---

async function downloadAndExtract(): Promise<void> {
  const { target, ext } = getPlatformMapping()
  const assetName = `ripgrep-v${RG_VERSION}-${target}.${ext}`
  const downloadUrl = `${BASE_URL}/${assetName}`

  const binaryPath = getBinaryPath()
  const binaryDir = path.dirname(binaryPath)

  // Idempotent: skip if binary exists and has content
  const force = process.argv.includes('--force')
  if (!force && existsSync(binaryPath)) {
    const stat = statSync(binaryPath)
    if (stat.size > 0) {
      console.log(`[ripgrep] Binary already exists at ${binaryPath}, skipping.`)
      return
    }
  }

  console.log(`[ripgrep] Downloading v${RG_VERSION} for ${target}...`)
  console.log(`[ripgrep] URL: ${downloadUrl}`)

  // Prepare temp directory
  const tmpDir = path.join(binaryDir, '.tmp-download')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  try {
    const archivePath = path.join(tmpDir, assetName)

    // Download
    const response = await fetch(downloadUrl, { redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const { writeFileSync } = await import('fs')
    writeFileSync(archivePath, buffer)
    console.log(`[ripgrep] Downloaded ${Math.round(buffer.length / 1024)} KB`)

    // Extract
    mkdirSync(binaryDir, { recursive: true })

    if (ext === 'tar.gz') {
      extractTarGz(archivePath, tmpDir)
    } else {
      extractZip(archivePath, tmpDir)
    }

    const srcBinary = findRgInTree(tmpDir)
    if (!srcBinary || !existsSync(srcBinary)) {
      throw new Error(`rg binary not found under ${tmpDir} after extract`)
    }

    // Move to final location
    renameSync(srcBinary, binaryPath)

    // Make executable (non-Windows)
    if (process.platform !== 'win32') {
      chmodSync(binaryPath, 0o755)
    }

    console.log(`[ripgrep] Installed to ${binaryPath}`)
  } finally {
    // Cleanup temp directory
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// --- Main ---

downloadAndExtract().catch(error => {
  console.error(`[ripgrep] Download failed: ${error.message}`)
  console.error(`[ripgrep] You can install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation`)
  // Don't exit with error code — postinstall should not break bun install
  process.exit(0)
})
