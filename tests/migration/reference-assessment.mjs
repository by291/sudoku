import assert from 'node:assert/strict'

const plain = (value) => JSON.parse(JSON.stringify(value))

export function computeScreening(engine, input) {
  let preparationWork = 0
  let owner
  if (input.prepared) {
    const setup = engine.createWorkBudget(4000000)
    const prepared = engine.prepareRuleComputation(input.rules, setup)
    assert.equal(prepared.status, 'ready')
    preparationWork = setup.used
    owner = engine.prepareAssessmentWithComputation(prepared.computation, input.limits)
  } else {
    owner = engine.prepareAssessment(input.rules, input.limits)
  }
  const budget = engine.createWorkBudget(input.workLimit)
  assert.equal(engine.consumeWork(budget, input.initialWork), true)
  const results = []
  for (let index = 0; index < input.repeats; index++) {
    let result
    if (input.mode === 'assess') {
      result = owner.assess(input.board, budget)
    } else if (input.mode === 'screen') {
      result = owner.screen(input.board, budget)
    } else {
      result = owner.screenTarget(input.board, input.target, budget)
    }
    if (typeof result.complete === 'function') {
      const before = budget.used
      const completed = result.complete()
      assert.equal(budget.used, before)
      results.push({ ...result, completed })
    } else results.push(result)
  }
  return plain({ results, used: budget.used, preparationWork })
}
