// Effects' three addresses: each level reads back from its hash (so reload and back/forward
// keep your place), the reference app's own spellings work, and anything unknown lands on the home.
import { describe, expect, it } from 'vitest'
import { effectHref, effectView, type EffectView } from './route.ts'

const known = (id: string) => ['fx-melt', 'cam-orbit'].includes(id)

describe('effectView', () => {
  it('reads the three levels', () => {
    expect(effectView('#/gen/effects', known)).toEqual({ level: 'home' })
    expect(effectView('#/gen/effects/', known)).toEqual({ level: 'home' })
    expect(effectView('#/gen/effects/fx-melt', known)).toEqual({ level: 'page', id: 'fx-melt' })
    expect(effectView('#/gen/effects/fx-melt/use', known)).toEqual({ level: 'use', id: 'fx-melt' })
  })

  it("takes the reference app's spellings and the pre-v2 address", () => {
    expect(effectView('#/gen/effects/use/cam-orbit', known)).toEqual({ level: 'use', id: 'cam-orbit' })
    expect(effectView('#/gen/effects/examples/cam-orbit', known)).toEqual({ level: 'page', id: 'cam-orbit' })
    expect(effectView('#/studio/effects/fx-melt', known)).toEqual({ level: 'page', id: 'fx-melt' })
  })

  it('sends anything unknown to the home', () => {
    expect(effectView('#/gen/effects/gone', known)).toEqual({ level: 'home' })
    expect(effectView('#/gen/effects/use/gone', known)).toEqual({ level: 'home' })
    expect(effectView('#/gen/video', known)).toEqual({ level: 'home' })
    expect(effectView('', known)).toEqual({ level: 'home' })
    expect(effectView('#/gen/effects/%E0%A4%A', known)).toEqual({ level: 'home' })
  })

  it('round-trips every view through its address, ignoring a query', () => {
    const views: EffectView[] = [{ level: 'home' }, { level: 'page', id: 'fx-melt' }, { level: 'use', id: 'cam-orbit' }]
    for (const v of views) {
      expect(effectView(effectHref(v), known)).toEqual(v)
      expect(effectView(`${effectHref(v)}?from=x`, known)).toEqual(v)
    }
    expect(effectHref({ level: 'use', id: 'fx-melt' })).toBe('#/gen/effects/fx-melt/use')
  })
})
