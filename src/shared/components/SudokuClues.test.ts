import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import SudokuClues from '@/shared/components/SudokuClues.vue'
import { getBoardGeometry } from '@/shared/model/boardGeometry'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'

it.each(Object.entries(VARIANT_FIXTURES))(
  'keeps %s overlays outside the input and accessibility trees and hides them on pause',
  async (_, fixture) => {
    const wrapper = mount(SudokuClues, {
      props: { geometry: getBoardGeometry(fixture.rules), obscured: false },
    })

    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('svg').attributes('style')).toContain('pointer-events: none')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('path,line,circle,text').length).toBeGreaterThan(0)
    await wrapper.setProps({ obscured: true })

    expect(wrapper.find('svg').exists()).toBe(false)
    wrapper.unmount()
  },
)
