import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NumberPad from '@/shared/components/NumberPad.vue'

describe('NumberPad', () => {
  it('emits the selected digit using the game input labels', async () => {
    const wrapper = mount(NumberPad)

    expect(wrapper.findAll('button')).toHaveLength(9)
    await wrapper.get('button[aria-label="输入数字4"]').trigger('click')

    expect(wrapper.emitted('digit')).toEqual([[4]])
    wrapper.unmount()
  })

  it('uses lesson action labels and prevents input while disabled', async () => {
    const wrapper = mount(NumberPad, { props: { actionLabel: '排除', disabled: true } })
    const button = wrapper.get('button[aria-label="排除数字7"]')

    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('digit')).toBeUndefined()

    await wrapper.setProps({ disabled: false, actionLabel: '填写' })
    await wrapper.get('button[aria-label="填写数字7"]').trigger('click')
    expect(wrapper.emitted('digit')).toEqual([[7]])
    wrapper.unmount()
  })
})
