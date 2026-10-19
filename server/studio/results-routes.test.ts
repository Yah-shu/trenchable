import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mediaFile } from './results-routes.ts'

const root = mkdtempSync(join(tmpdir(), 'studio-media-'))
mkdirSync(join(root, 'task1'))
writeFileSync(join(root, 'task1', '0.png'), 'x')
const outside = mkdtempSync(join(tmpdir(), 'studio-outside-'))
writeFileSync(join(outside, 'secret.txt'), 'nope')

describe('mediaFile', () => {
  it('resolves an archived result inside the media root', () => {
    expect(mediaFile('/media/task1/0.png', root)).toMatch(/0\.png$/)
  })

  it('refuses anything outside the media root or not under /media', () => {
    for (const bad of ['/media/../secret.txt', '/media/%2e%2e/secret.txt', '/media/C:/Windows/win.ini', '/data/studio.db', 'media/task1/0.png', '/media/', '/media/task1/missing.png', '/media/task1']) {
      expect(mediaFile(bad, root)).toBeNull()
    }
  })

  it('does not follow a link that points out of the root', () => {
    try {
      symlinkSync(outside, join(root, 'link'), 'junction')
    } catch {
      return // no permission to make links here; nothing to test
    }
    expect(mediaFile('/media/link/secret.txt', root)).toBeNull()
  })
})
