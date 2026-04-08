/**
 * Compatible replacement for proper-lockfile under Bun bundling.
 *
 * proper-lockfile@4 expects `require('signal-exit')` to return a callable
 * function, but signal-exit@4 exports an object with a named `onExit`.
 * Bun bundles that old CommonJS call pattern directly, which crashes at
 * module init time with "onExit is not a function".
 */

import { resolve } from 'path'
import * as fs from 'fs'
import { onExit } from 'signal-exit'

type RetryOptions =
  | number
  | {
      retries?: number
      factor?: number
      minTimeout?: number
      maxTimeout?: number
      randomize?: boolean
      forever?: boolean
      maxRetryTime?: number
      unref?: boolean
    }

type FsLike = typeof import('fs')

export type LockOptions = {
  stale?: number
  update?: number | null
  realpath?: boolean
  retries?: RetryOptions
  fs?: FsLike
  lockfilePath?: string
  onCompromised?: (error: Error) => void
}

export type UnlockOptions = {
  fs?: FsLike
  realpath?: boolean
  lockfilePath?: string
}

export type CheckOptions = {
  stale?: number
  realpath?: boolean
  fs?: FsLike
  lockfilePath?: string
}

type ReleaseCallback = (error?: Error | null) => void
type Callback<T> = (error: Error | null, result?: T) => void
type MtimePrecision = 's' | 'ms'

type NormalizedLockOptions = Required<
  Pick<LockOptions, 'stale' | 'realpath' | 'fs' | 'lockfilePath' | 'onCompromised'>
> & {
  update: number
  retries: RetryOptions
}

type NormalizedUnlockOptions = Required<Pick<UnlockOptions, 'fs' | 'realpath'>> &
  Pick<UnlockOptions, 'lockfilePath'>

type NormalizedCheckOptions = Required<Pick<CheckOptions, 'stale' | 'realpath' | 'fs'>> &
  Pick<CheckOptions, 'lockfilePath'>

type InternalLock = {
  lockfilePath: string
  mtime: Date
  mtimePrecision: MtimePrecision
  options: NormalizedLockOptions
  lastUpdate: number
  released?: boolean
  updateDelay?: number | null
  updateTimeout?: ReturnType<typeof setTimeout> | null
}

const locks: Record<string, InternalLock> = {}
const precisionCache = new WeakMap<object, MtimePrecision>()

function getLockFile(
  file: string,
  options: Pick<LockOptions, 'lockfilePath'>,
): string {
  return options.lockfilePath || `${file}.lock`
}

function removeDir(
  fsImpl: FsLike,
  path: string,
  callback: (error?: NodeJS.ErrnoException | null) => void,
): void {
  if (typeof fsImpl.rmdir === 'function') {
    fsImpl.rmdir(path, callback)
    return
  }

  if (typeof fsImpl.rm === 'function') {
    fsImpl.rm(path, { recursive: false, force: false }, callback)
    return
  }

  callback(
    Object.assign(new Error('Filesystem implementation does not support rmdir'), {
      code: 'ENOSYS',
    }),
  )
}

function removeDirSync(fsImpl: FsLike, path: string): void {
  if (typeof fsImpl.rmdirSync === 'function') {
    fsImpl.rmdirSync(path)
    return
  }

  if (typeof fsImpl.rmSync === 'function') {
    fsImpl.rmSync(path, { recursive: false, force: false })
    return
  }

  throw Object.assign(new Error('Filesystem implementation does not support rmdir'), {
    code: 'ENOSYS',
  })
}

function resolveCanonicalPath(
  file: string,
  options: Pick<LockOptions, 'realpath' | 'fs'>,
  callback: Callback<string>,
): void {
  if (!options.realpath) {
    callback(null, resolve(file))
    return
  }

  options.fs.realpath(file, callback)
}

function probeMtimePrecision(
  file: string,
  fsImpl: FsLike,
  callback: Callback<[Date, MtimePrecision]>,
): void {
  const cachedPrecision = precisionCache.get(fsImpl)

  if (cachedPrecision) {
    fsImpl.stat(file, (error, stat) => {
      if (error) {
        callback(error)
        return
      }
      callback(null, [stat.mtime, cachedPrecision])
    })
    return
  }

  const mtime = new Date(Math.ceil(Date.now() / 1000) * 1000 + 5)
  fsImpl.utimes(file, mtime, mtime, error => {
    if (error) {
      callback(error)
      return
    }

    fsImpl.stat(file, (statError, stat) => {
      if (statError) {
        callback(statError)
        return
      }

      const precision: MtimePrecision = stat.mtime.getTime() % 1000 === 0 ? 's' : 'ms'
      precisionCache.set(fsImpl, precision)
      callback(null, [stat.mtime, precision])
    })
  })
}

function getMtime(precision: MtimePrecision): Date {
  let now = Date.now()
  if (precision === 's') {
    now = Math.ceil(now / 1000) * 1000
  }
  return new Date(now)
}

function acquireLock(
  file: string,
  options: NormalizedLockOptions,
  callback: Callback<[Date, MtimePrecision]>,
): void {
  const lockfilePath = getLockFile(file, options)

  options.fs.mkdir(lockfilePath, error => {
    if (!error) {
      probeMtimePrecision(lockfilePath, options.fs, (probeError, result) => {
        if (probeError) {
          removeDir(options.fs, lockfilePath, () => {})
          callback(probeError)
          return
        }

        callback(null, result)
      })
      return
    }

    if (error.code !== 'EEXIST') {
      callback(error)
      return
    }

    if (options.stale <= 0) {
      callback(
        Object.assign(new Error('Lock file is already being held'), {
          code: 'ELOCKED',
          file,
        }),
      )
      return
    }

    options.fs.stat(lockfilePath, (statError, stat) => {
      if (statError) {
        if (statError.code === 'ENOENT') {
          acquireLock(file, { ...options, stale: 0 }, callback)
          return
        }

        callback(statError)
        return
      }

      if (!isLockStale(stat, options)) {
        callback(
          Object.assign(new Error('Lock file is already being held'), {
            code: 'ELOCKED',
            file,
          }),
        )
        return
      }

      removeLock(file, options, removeError => {
        if (removeError) {
          callback(removeError)
          return
        }

        acquireLock(file, { ...options, stale: 0 }, callback)
      })
    })
  })
}

function isLockStale(stat: import('fs').Stats, options: Pick<LockOptions, 'stale'>): boolean {
  return stat.mtime.getTime() < Date.now() - (options.stale || 0)
}

function removeLock(
  file: string,
  options: Pick<LockOptions, 'fs' | 'lockfilePath'>,
  callback: (error?: Error | null) => void,
): void {
  removeDir(options.fs || fs, getLockFile(file, options), error => {
    if (error && error.code !== 'ENOENT') {
      callback(error)
      return
    }

    callback()
  })
}

function updateLock(file: string, options: NormalizedLockOptions): void {
  const lock = locks[file]

  if (!lock || lock.updateTimeout) {
    return
  }

  lock.updateDelay = lock.updateDelay || options.update
  lock.updateTimeout = setTimeout(() => {
    const currentLock = locks[file]
    if (!currentLock) {
      return
    }

    currentLock.updateTimeout = null

    options.fs.stat(currentLock.lockfilePath, (error, stat) => {
      const isOverThreshold = currentLock.lastUpdate + options.stale < Date.now()

      if (error) {
        if (error.code === 'ENOENT' || isOverThreshold) {
          setLockAsCompromised(
            file,
            currentLock,
            Object.assign(error, { code: 'ECOMPROMISED' }),
          )
          return
        }

        currentLock.updateDelay = 1000
        updateLock(file, options)
        return
      }

      const isMtimeOurs = currentLock.mtime.getTime() === stat.mtime.getTime()

      if (!isMtimeOurs) {
        setLockAsCompromised(
          file,
          currentLock,
          Object.assign(
            new Error('Unable to update lock within the stale threshold'),
            { code: 'ECOMPROMISED' },
          ),
        )
        return
      }

      const mtime = getMtime(currentLock.mtimePrecision)
      options.fs.utimes(currentLock.lockfilePath, mtime, mtime, utimesError => {
        const isOverThresholdNow = currentLock.lastUpdate + options.stale < Date.now()

        if (currentLock.released) {
          return
        }

        if (utimesError) {
          if (utimesError.code === 'ENOENT' || isOverThresholdNow) {
            setLockAsCompromised(
              file,
              currentLock,
              Object.assign(utimesError, { code: 'ECOMPROMISED' }),
            )
            return
          }

          currentLock.updateDelay = 1000
          updateLock(file, options)
          return
        }

        currentLock.mtime = mtime
        currentLock.lastUpdate = Date.now()
        currentLock.updateDelay = null
        updateLock(file, options)
      })
    })
  }, lock.updateDelay)

  if (typeof lock.updateTimeout?.unref === 'function') {
    lock.updateTimeout.unref()
  }
}

function setLockAsCompromised(file: string, lock: InternalLock, error: Error): void {
  lock.released = true

  if (lock.updateTimeout) {
    clearTimeout(lock.updateTimeout)
  }

  if (locks[file] === lock) {
    delete locks[file]
  }

  lock.options.onCompromised(error)
}

function normalizeLockOptions(options?: LockOptions): NormalizedLockOptions {
  const normalized: NormalizedLockOptions = {
    stale: 10000,
    update: null as unknown as number,
    realpath: true,
    retries: 0,
    fs,
    lockfilePath: '',
    onCompromised: (error: Error) => {
      throw error
    },
    ...options,
  }

  normalized.retries = normalized.retries || 0
  normalized.stale = Math.max(normalized.stale || 0, 2000)
  normalized.update =
    normalized.update == null ? normalized.stale / 2 : normalized.update || 0
  normalized.update = Math.max(
    Math.min(normalized.update, normalized.stale / 2),
    1000,
  )

  return normalized
}

function normalizeRetryOptions(options: RetryOptions): Exclude<RetryOptions, number> {
  if (typeof options === 'number') {
    return { retries: options }
  }

  return {
    retries: 0,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: Number.POSITIVE_INFINITY,
    randomize: false,
    forever: false,
    maxRetryTime: Number.POSITIVE_INFINITY,
    unref: false,
    ...options,
  }
}

function getRetryDelay(
  options: Exclude<RetryOptions, number>,
  attemptNumber: number,
): number {
  const factor = options.factor ?? 2
  const minTimeout = options.minTimeout ?? 1000
  const maxTimeout = options.maxTimeout ?? Number.POSITIVE_INFINITY

  let timeout = minTimeout * factor ** Math.max(0, attemptNumber - 1)
  if (options.randomize) {
    timeout *= 1 + Math.random()
  }

  return Math.min(timeout, maxTimeout)
}

function runWithRetry<T>(
  options: RetryOptions,
  task: (callback: Callback<T>) => void,
  callback: Callback<T>,
): void {
  const normalized = normalizeRetryOptions(options)
  const maxRetries = normalized.retries ?? 0
  const maxRetryTime = normalized.maxRetryTime ?? Number.POSITIVE_INFINITY
  const start = Date.now()

  let attemptNumber = 0
  let lastError: Error | null = null

  const run = () => {
    task((error, result) => {
      if (!error) {
        callback(null, result)
        return
      }

      lastError = error
      const hasRetriesLeft = normalized.forever || attemptNumber < maxRetries
      const nextAttemptNumber = attemptNumber + 1
      const delay = getRetryDelay(normalized, nextAttemptNumber)
      const willExceedTimeBudget = Date.now() - start + delay > maxRetryTime

      if (!hasRetriesLeft || willExceedTimeBudget) {
        callback(lastError)
        return
      }

      attemptNumber = nextAttemptNumber
      const timer = setTimeout(run, delay)
      if (normalized.unref && typeof timer.unref === 'function') {
        timer.unref()
      }
    })
  }

  run()
}

function normalizeUnlockOptions(options?: UnlockOptions): NormalizedUnlockOptions {
  return {
    fs,
    realpath: true,
    ...options,
  }
}

function normalizeCheckOptions(options?: CheckOptions): NormalizedCheckOptions {
  const normalized: NormalizedCheckOptions = {
    stale: 10000,
    realpath: true,
    fs,
    ...options,
  }

  normalized.stale = Math.max(normalized.stale || 0, 2000)
  return normalized
}

function lockImpl(
  file: string,
  options: LockOptions | undefined,
  callback: Callback<(releasedCallback?: ReleaseCallback) => void>,
): void {
  const normalized = normalizeLockOptions(options)

  resolveCanonicalPath(file, normalized, (error, canonicalFile) => {
    if (error || !canonicalFile) {
      callback(error || new Error('Unable to resolve lock path'))
      return
    }

    runWithRetry(normalized.retries, retryCallback => {
      acquireLock(canonicalFile, normalized, retryCallback)
    }, (lockError, result) => {
      if (lockError || !result) {
        callback(lockError || new Error('Unable to acquire lock'))
        return
      }

      const [mtime, mtimePrecision] = result
      const lock: InternalLock = {
        lockfilePath: getLockFile(canonicalFile, normalized),
        mtime,
        mtimePrecision,
        options: normalized,
        lastUpdate: Date.now(),
      }

      locks[canonicalFile] = lock
      updateLock(canonicalFile, normalized)

      callback(null, releasedCallback => {
        if (lock.released) {
          releasedCallback?.(
            Object.assign(new Error('Lock is already released'), {
              code: 'ERELEASED',
            }),
          )
          return
        }

        unlockImpl(
          canonicalFile,
          { ...normalized, realpath: false },
          releasedCallback || (() => {}),
        )
      })
    })
  })
}

function unlockImpl(
  file: string,
  options: UnlockOptions | undefined,
  callback: ReleaseCallback,
): void {
  const normalized = normalizeUnlockOptions(options)

  resolveCanonicalPath(file, normalized, (error, canonicalFile) => {
    if (error || !canonicalFile) {
      callback(error || new Error('Unable to resolve unlock path'))
      return
    }

    const lock = locks[canonicalFile]
    if (!lock) {
      callback(
        Object.assign(new Error('Lock is not acquired/owned by you'), {
          code: 'ENOTACQUIRED',
        }),
      )
      return
    }

    if (lock.updateTimeout) {
      clearTimeout(lock.updateTimeout)
    }

    lock.released = true
    delete locks[canonicalFile]

    removeLock(canonicalFile, normalized, callback)
  })
}

function checkImpl(
  file: string,
  options: CheckOptions | undefined,
  callback: Callback<boolean>,
): void {
  const normalized = normalizeCheckOptions(options)

  resolveCanonicalPath(file, normalized, (error, canonicalFile) => {
    if (error || !canonicalFile) {
      callback(error || new Error('Unable to resolve lock path'))
      return
    }

    normalized.fs.stat(getLockFile(canonicalFile, normalized), (statError, stat) => {
      if (statError) {
        if (statError.code === 'ENOENT') {
          callback(null, false)
          return
        }

        callback(statError)
        return
      }

      callback(null, !isLockStale(stat, normalized))
    })
  })
}

function toPromise<T>(
  method: (...args: [...unknown[], Callback<T>]) => void,
): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      method(...args, (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result as T)
      })
    })
}

function toSync<T>(method: (...args: [...unknown[], Callback<T>]) => void): (...args: unknown[]) => T {
  return (...args: unknown[]) => {
    let error: Error | null = null
    let result: T | undefined

    method(...args, (callbackError, callbackResult) => {
      error = callbackError
      result = callbackResult
    })

    if (error) {
      throw error
    }

    return result as T
  }
}

function createSyncFs(fsImpl: FsLike): FsLike {
  return {
    ...fsImpl,
    mkdir: ((path: import('fs').PathLike, callback: (error?: Error | null) => void) => {
      try {
        fsImpl.mkdirSync(path)
        callback(null)
      } catch (error) {
        callback(error as Error)
      }
    }) as FsLike['mkdir'],
    realpath: ((path: import('fs').PathLike, callback: Callback<string>) => {
      try {
        callback(null, fsImpl.realpathSync(path))
      } catch (error) {
        callback(error as Error)
      }
    }) as FsLike['realpath'],
    stat: ((path: import('fs').PathLike, callback: Callback<import('fs').Stats>) => {
      try {
        callback(null, fsImpl.statSync(path))
      } catch (error) {
        callback(error as Error)
      }
    }) as FsLike['stat'],
    rmdir: ((path: import('fs').PathLike, callback: (error?: Error | null) => void) => {
      try {
        removeDirSync(fsImpl, path.toString())
        callback(null)
      } catch (error) {
        callback(error as Error)
      }
    }) as FsLike['rmdir'],
    utimes: ((
      path: import('fs').PathLike,
      atime: string | number | Date,
      mtime: string | number | Date,
      callback: (error?: Error | null) => void,
    ) => {
      try {
        fsImpl.utimesSync(path, atime, mtime)
        callback(null)
      } catch (error) {
        callback(error as Error)
      }
    }) as FsLike['utimes'],
  }
}

function toSyncOptions(options?: LockOptions): LockOptions {
  const syncOptions = { ...options }
  syncOptions.fs = createSyncFs(syncOptions.fs || fs)

  const retries = syncOptions.retries
  if (
    (typeof retries === 'number' && retries > 0) ||
    (typeof retries === 'object' &&
      retries !== null &&
      typeof retries.retries === 'number' &&
      retries.retries > 0)
  ) {
    throw Object.assign(new Error('Cannot use retries with the sync api'), {
      code: 'ESYNC',
    })
  }

  return syncOptions
}

export async function lock(
  file: string,
  options?: LockOptions,
): Promise<() => Promise<void>> {
  const release = await toPromise<(releasedCallback?: ReleaseCallback) => void>(
    lockImpl,
  )(file, options)

  return toPromise<void>(release)
}

export function lockSync(file: string, options?: LockOptions): () => void {
  const release = toSync<(releasedCallback?: ReleaseCallback) => void>(lockImpl)(
    file,
    toSyncOptions(options),
  )

  return toSync<void>(release)
}

export function unlock(file: string, options?: UnlockOptions): Promise<void> {
  return toPromise<void>(unlockImpl)(file, options)
}

export function check(file: string, options?: CheckOptions): Promise<boolean> {
  return toPromise<boolean>(checkImpl)(file, options)
}

export function getLocks(): Record<string, InternalLock> {
  return locks
}

onExit(() => {
  for (const file in locks) {
    const options = locks[file]?.options
    if (!options) {
      continue
    }

    try {
      removeDirSync(options.fs, getLockFile(file, options))
    } catch {}
  }
})
