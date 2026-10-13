import { test, expect, seedSession, readSessions, cellName, enterGameDigit } from './support'
import { runWorker } from './workerHarness'
import { RATING_FIXTURES } from '../fixtures/rating'
import { solvedBoard, emptyBoard, conflictingBoard } from '../fixtures/sudoku'
import { makeSession } from '../support/gameFixtures'
import { createAssessmentInput } from '@/core/sudoku/rating'
import { RATING_VERSION } from '@/core/sudoku/ratingPolicies'
import { parseWorkerResponse } from '@/worker/protocol'

test('assesses authored fixtures and explicit outcomes through real production workers', async ({
  page,
}) => {
  await page.goto('/#/')
  const cases = [
    ...RATING_FIXTURES.map((fixture) => ({
      id: fixture.id,
      input: createAssessmentInput(fixture.board, fixture.rules),
      expected: {
        status: 'rated',
        summary: {
          ratingVersion: RATING_VERSION,
          variant: fixture.rules.kind,
          difficulty: fixture.difficulty,
        },
      },
    })),
    {
      id: 'complete',
      input: createAssessmentInput(solvedBoard, { kind: 'classic' }),
      expected: {
        status: 'rated',
        summary: {
          ratingVersion: RATING_VERSION,
          variant: 'classic',
          difficulty: 'easy',
          workload: {
            steps: 0,
            placements: 0,
            eliminations: 0,
            candidateRemovals: 0,
            highestTechnique: null,
            highestTier: null,
            variantSteps: 0,
          },
        },
      },
    },
    {
      id: 'ungraded',
      input: createAssessmentInput(emptyBoard, { kind: 'classic' }),
      expected: { status: 'ungraded', ratingVersion: RATING_VERSION, variant: 'classic' },
    },
    {
      id: 'exhausted',
      input: createAssessmentInput(
        solvedBoard.map((digit, cell) => (cell === 40 ? 0 : digit)),
        { kind: 'classic' },
        { maxSteps: 0, maxWork: 1000000 },
      ),
      expected: {
        status: 'budget-exhausted',
        ratingVersion: RATING_VERSION,
        variant: 'classic',
        stage: 'logic',
        difficulty: 'easy',
      },
    },
    {
      id: 'invalid',
      input: createAssessmentInput(conflictingBoard, { kind: 'classic' }),
      expected: { status: 'invalid' },
    },
  ]

  // Fixture grades predate the assessor; complete/empty/conflicting boards pin outcome semantics.
  for (const { id, input, expected } of cases) {
    await test.step(id, async () => {
      const actual = parseWorkerResponse(
        await runWorker(page, { kind: 'assess', requestId: id, input }),
      )

      expect(actual).toMatchObject({
        valid: true,
        value: { kind: 'assess', requestId: id, outcome: { status: 'completed', value: expected } },
      })
    })
  }
})

test('honors assessment work limits for every type at the subpath deployment', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/sudoku/#/')
  for (const fixture of RATING_FIXTURES.filter((fixture) => fixture.difficulty === 'medium')) {
    const input = createAssessmentInput(fixture.board, fixture.rules, {
      maxSteps: 300,
      maxWork: 800000,
    })
    const actual = parseWorkerResponse(
      await runWorker(page, { kind: 'assess', requestId: fixture.id, input }, '/sudoku/'),
    )

    expect(actual).toMatchObject({
      valid: true,
      value: {
        kind: 'assess',
        requestId: fixture.id,
        outcome: {
          status: 'completed',
          value: {
            status: 'rated',
            summary: { variant: fixture.rules.kind, difficulty: fixture.difficulty },
          },
        },
      },
    })

    // These incomplete boards cannot be rated with zero work; this detects a dropped request budget.
    const exhaustedId = `${fixture.id}-zero-work`
    const exhausted = parseWorkerResponse(
      await runWorker(
        page,
        {
          kind: 'assess',
          requestId: exhaustedId,
          input: createAssessmentInput(fixture.board, fixture.rules, { maxSteps: 300, maxWork: 0 }),
        },
        '/sudoku/',
      ),
    )

    expect(exhausted).toMatchObject({
      valid: true,
      value: {
        kind: 'assess',
        requestId: exhaustedId,
        outcome: {
          status: 'completed',
          value: {
            status: 'budget-exhausted',
            ratingVersion: RATING_VERSION,
            variant: fixture.rules.kind,
          },
        },
      },
    })
  }
})

test('reloads a newly generated assessment snapshot', async ({ page }) => {
  await page.goto('/#/play/free')
  await page.getByRole('button', { name: '开始游戏', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '开始游戏', exact: true }).click()
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()
  const snapshot = (await readSessions(page))[0].session.assessment
  const savedRoute = page.url()

  expect(snapshot?.status).toBe('rated')
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.reload()
  await page.goto(savedRoute)
  await expect(page.getByRole('group', { name: '数独棋盘' })).toBeVisible()

  expect((await readSessions(page))[0].session.assessment).toEqual(snapshot)
})

for (const metadata of ['absent', 'unsupported'] as const) {
  test(`keeps a playable stored game with ${metadata} assessment metadata`, async ({ page }) => {
    const session = makeSession()
    await seedSession(page, session)
    const savedRoute = page.url()
    // Release the editing lease through the player flow before recreating the page.
    await page.getByRole('link', { name: '返回首页', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sudoku-local', 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const lease = await new Promise<unknown>((resolve, reject) => {
            const request = database
              .transaction('leases')
              .objectStore('leases')
              .get('fixture-free-session')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          database.close()
          // Released leases retain their fencing identity with a zero expiry.
          return (
            typeof lease === 'object' &&
            lease !== null &&
            'expiresAt' in lease &&
            lease.expiresAt === 0
          )
        }),
      )
      .toBe(true)
    if (metadata === 'unsupported') {
      await page.evaluate(async (session) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sudoku-local', 1)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('sessions', 'readwrite')
          transaction.objectStore('sessions').put({
            formatVersion: 2,
            revision: 1,
            session: {
              ...session,
              assessment: { status: 'rated', summary: { ratingVersion: 'future-rating' } },
            },
          })
          transaction.oncomplete = () => resolve()
          transaction.onabort = () => reject(transaction.error)
        })
        database.close()
      }, session)
    }
    await page.reload()
    await page.goto(savedRoute)
    await page.getByRole('button', { name: '继续游戏', exact: true }).first().click()
    await page.getByRole('button', { name: cellName(2) }).click()
    await enterGameDigit(page, 4)
    await expect.poll(async () => (await readSessions(page))[0].session.entries[2]).toBe(4)
    const saved = (await readSessions(page))[0].session

    expect(saved.puzzle).toEqual(session.puzzle)
    if (metadata === 'absent') {
      expect(Object.hasOwn(saved, 'assessment')).toBe(false)
    } else {
      expect(saved.assessment).toMatchObject({
        status: 'unavailable',
        reason: 'unsupported-version',
      })
    }
  })
}
