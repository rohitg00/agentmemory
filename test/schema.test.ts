import { describe, it, expect } from 'vitest'
import { KV, STREAM, generateId } from '../src/state/schema.js'

describe('KV', () => {
  it('has correct session scope', () => {
    expect(KV.sessions).toBe('mem:sessions')
  })

  it('generates observation scope with session ID', () => {
    expect(KV.observations('ses_123')).toBe('mem:obs:ses_123')
  })

  it('has correct summaries scope', () => {
    expect(KV.summaries).toBe('mem:summaries')
  })
})

describe('STREAM', () => {
  it('has correct name', () => {
    expect(STREAM.name).toBe('mem-live')
  })

  it('group returns session ID', () => {
    expect(STREAM.group('ses_123')).toBe('ses_123')
  })
})

describe('generateId', () => {
  it('includes prefix', () => {
    expect(generateId('obs')).toMatch(/^obs_/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('test')))
    expect(ids.size).toBe(100)
  })

  it('has sufficient length', () => {
    const id = generateId('obs')
    expect(id.length).toBeGreaterThan(15)
  })
})
