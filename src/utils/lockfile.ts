/**
 * Lazy accessor for the local proper-lockfile compatibility layer.
 *
 * The original proper-lockfile package crashes under Bun bundling when it
 * pulls in signal-exit@4 via its older CommonJS interop path. We keep the
 * lazy-loading behavior, but point it at a local compatible implementation.
 *
 * Import this module instead of loading the lock implementation directly. The
 * underlying package is only loaded the first time a lock function is used.
 */

import type {
  CheckOptions,
  LockOptions,
  UnlockOptions,
} from './properLockfileCompat.js'

type Lockfile = typeof import('./properLockfileCompat.js')

let _lockfile: Lockfile | undefined

function getLockfile(): Lockfile {
  if (!_lockfile) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _lockfile = require('./properLockfileCompat.js') as Lockfile
  }
  return _lockfile
}

export function lock(
  file: string,
  options?: LockOptions,
): Promise<() => Promise<void>> {
  return getLockfile().lock(file, options)
}

export function lockSync(file: string, options?: LockOptions): () => void {
  return getLockfile().lockSync(file, options)
}

export function unlock(file: string, options?: UnlockOptions): Promise<void> {
  return getLockfile().unlock(file, options)
}

export function check(file: string, options?: CheckOptions): Promise<boolean> {
  return getLockfile().check(file, options)
}
