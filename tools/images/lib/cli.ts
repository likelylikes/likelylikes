// Shared command-line handling for the image steps: `npm run images:<step> -- --pool <template>.v<n> …`.

import { resolve } from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { REPO, parsePool } from './records.ts'

type Options = NonNullable<ParseArgsConfig['options']>

const COMMON = {
  root: { type: 'string' },
  pool: { type: 'string' },
  help: { type: 'boolean' },
} as const

export function parseCli<O extends Options>(usage: string, options: O, allowPositionals = false) {
  const config = { options: { ...COMMON, ...options }, allowPositionals, strict: true as const }
  let parsed: ReturnType<typeof parseArgs<typeof config>>
  try {
    parsed = parseArgs(config)
  } catch (e) {
    fail(`${(e as Error).message}\n\n${usage}`)
  }
  const common = parsed.values as { root?: string; help?: boolean }
  if (common.help) {
    console.log(usage)
    process.exit(0)
  }
  return { values: parsed.values, positionals: parsed.positionals, root: resolve(common.root ?? REPO) }
}

export function requirePool(pool: unknown, usage: string): string {
  if (typeof pool !== 'string') fail(`--pool is required\n\n${usage}`)
  try {
    parsePool(pool)
  } catch (e) {
    fail((e as Error).message)
  }
  return pool
}

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** Runs a step's main, printing an error's message rather than a stack. */
export function run(main: () => Promise<void>): void {
  main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)))
}
