import { expect, it } from 'vitest'
import { sessionLink } from '@/features/records/model/records'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
it('links to the saved type and retains explicit practice identity', () => {
  const session = makeSession({
    id: 'saved/arrow',
    mode: 'learning',
    metadata: { kind: 'learning', lessonId: 'arrow-rules' },
    puzzle: { ...makeSession().puzzle, ...VARIANT_FIXTURES.arrow },
  })
  expect(sessionLink(session)).toBe(
    '/learn/arrow-rules?practice=1&variant=arrow&session=saved%2Farrow',
  )
})
