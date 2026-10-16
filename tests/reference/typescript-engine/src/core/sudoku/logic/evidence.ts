import type { RuleEvidence, LogicalStep } from '@/core/sudoku/logic/types'

/** Copy nested proof data so independently completed trials cannot edit one another. */
/** Copies every nested proof array so later caller edits cannot corrupt a completed trial. */
export function copyLogicalStep(step: LogicalStep): LogicalStep {
  const evidence = copyStepEvidence(step.evidence)

  return step.kind === 'elimination'
    ? { ...step, evidence, removals: step.removals.map((removal) => ({ ...removal })) }
    : { ...step, evidence }
}

function copyRuleEvidence(evidence: RuleEvidence): RuleEvidence {
  const shared = { cells: [...evidence.cells], digits: [...evidence.digits] }
  switch (evidence.kind) {
    case 'cage':
      return { ...evidence, ...shared, domains: evidence.domains.map((domain) => ({ ...domain })) }
    case 'arrow':
      return {
        ...evidence,
        ...shared,
        shaft: [...evidence.shaft],
        domains: evidence.domains.map((domain) => ({ ...domain })),
      }
    case 'thermo':
      return {
        ...evidence,
        ...shared,
        path: [...evidence.path],
        bounds: evidence.bounds.map((bound) => ({ ...bound })),
      }
  }
}

function copyStepEvidence(evidence: LogicalStep['evidence']): LogicalStep['evidence'] {
  const shared = { cells: [...evidence.cells], digits: [...evidence.digits] }
  switch (evidence.kind) {
    case 'cage':
    case 'arrow':
    case 'thermo':
      return copyRuleEvidence(evidence)
    case 'unit':
      return {
        ...evidence,
        ...shared,
        unit: { ...evidence.unit },
        units: evidence.units?.map((unit) => ({ ...unit })),
        premises: evidence.premises.map(copyRuleEvidence),
      }
    case 'subset':
      return {
        ...evidence,
        ...shared,
        domains: evidence.domains.map((domain) => ({ ...domain })),
        unit: { ...evidence.unit },
      }
    case 'fish':
      return {
        ...evidence,
        ...shared,
        domains: evidence.domains.map((domain) => ({ ...domain })),
        bases: evidence.bases.map((unit) => ({ ...unit })),
        covers: evidence.covers.map((unit) => ({ ...unit })),
      }
    case 'wing':
      return {
        ...evidence,
        ...shared,
        domains: evidence.domains.map((domain) => ({ ...domain })),
        wings: [evidence.wings[0], evidence.wings[1]],
      }
    case 'coloring':
      return {
        ...evidence,
        ...shared,
        domains: evidence.domains.map((domain) => ({ ...domain })),
        colors: [[...evidence.colors[0]], [...evidence.colors[1]]],
        links: evidence.links.map((link) => ({
          unit: { ...link.unit },
          cells: [link.cells[0], link.cells[1]],
        })),
      }
  }
}
