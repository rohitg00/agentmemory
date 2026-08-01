import { describe, it, expect } from 'vitest'
import { KV, STREAM, generateId, jaccardSimilarity } from '../src/state/schema.js'

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

describe('jaccardSimilarity', () => {
  it('returns 1 for identical ASCII strings', () => {
    const s = 'always use express-jwt middleware for token validation'
    expect(jaccardSimilarity(s, s)).toBe(1)
  })

  it('keeps ASCII word-level behavior', () => {
    const a = 'always use express-jwt middleware for token validation'
    const b = 'always use express-jwt middleware for request validation'
    const score = jaccardSimilarity(a, b)
    expect(score).toBeGreaterThan(0.5)
    expect(score).toBeLessThan(1)
  })

  it('returns 0 for unrelated ASCII strings', () => {
    expect(
      jaccardSimilarity('the quick brown fox', 'lorem ipsum dolor sit'),
    ).toBe(0)
  })

  it('returns 0 (never 1) when both token sets are empty and inputs differ', () => {
    // Two short ASCII strings whose tokens are all filtered out by the
    // length gate must not be treated as identical.
    expect(jaccardSimilarity('a b', 'x y')).toBe(0)
  })

  it('supersedes identical short memories that tokenize to nothing', () => {
    // Regression: words <=2 chars are dropped, so "AI" / "go" / "a b"
    // produce empty token sets. Re-saving the exact same short memory must
    // still be detected as a duplicate (score 1) via an exact-equality
    // fallback, instead of leaking duplicate latest records.
    expect(jaccardSimilarity('AI', 'AI')).toBe(1)
    expect(jaccardSimilarity('go', 'go')).toBe(1)
    // Unrelated short strings must still score 0, not falsely supersede.
    expect(jaccardSimilarity('AI', 'ML')).toBe(0)
    expect(jaccardSimilarity('go', 'AI')).toBe(0)
  })

  it('treats whitespace-only differences in short text as identical', () => {
    // The exact-equality fallback collapses runs of whitespace and trims,
    // so cosmetic spacing differences on an otherwise-empty-token memory
    // still dedupe.
    expect(jaccardSimilarity('a b', 'a  b')).toBe(1)
    expect(jaccardSimilarity('  AI ', 'AI')).toBe(1)
  })

  it('gives high similarity for near-identical CJK sentences', () => {
    const a = '用户认证中间件必须先去除请求头里的 Bearer 前缀然后再校验令牌'
    const b = '用户认证中间件必须先去除请求头里的 Bearer 前缀然后校验令牌'
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.7)
  })

  it('gives low similarity for unrelated short CJK strings', () => {
    // "北京" vs "上海" — the old empty-set shortcut returned 1 here and
    // falsely superseded an unrelated memory. Must be well below the
    // 0.7 supersede threshold.
    expect(jaccardSimilarity('北京', '上海')).toBeLessThan(0.7)
    expect(jaccardSimilarity('北京', '上海')).toBe(0)
  })

  it('detects a duplicate for identical CJK strings', () => {
    expect(jaccardSimilarity('设置认证中间件', '设置认证中间件')).toBe(1)
  })

  it('handles Japanese kana without whitespace', () => {
    const a = 'トークンを検証する前に接頭辞を取り除く'
    const b = 'トークンを検証する前に接頭辞を削除する'
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.4)
    expect(jaccardSimilarity('東京', '大阪')).toBe(0)
  })

  it('NFC-normalizes before comparing', () => {
    // Composed U+00E9 vs decomposed 'e' + U+0301 combining accent for
    // "caf\u00e9" must compare equal even though the two strings differ
    // byte-for-byte before normalization.
    const composed = 'caf\u00e9 latte order'
    const decomposed = 'cafe\u0301 latte order'
    expect(composed).not.toBe(decomposed)
    expect(jaccardSimilarity(composed, decomposed)).toBe(1)
  })
})
