import type { AssessmentIssue, LiveAssessmentOutcome, PuzzleAssessment } from '@/sudoku/contracts'
import { violationMessage } from '@/features/game/model/violationPresentation'

export function assessmentIssueMessage(issue: AssessmentIssue): string {
  switch (issue.kind) {
    case 'message':
      return issue.message
    case 'violation':
      return `${issue.violation.constraintId}: ${violationMessage(issue.violation)}`
  }
}

/** Explicit presentation boundary: historical metadata stores the rendered text unchanged. */
export function toStoredAssessment(outcome: LiveAssessmentOutcome): PuzzleAssessment {
  switch (outcome.status) {
    case 'rated':
      return { status: 'rated', summary: outcome.summary }
    case 'ungraded':
    case 'incomplete':
      return { status: 'unavailable', reason: outcome.status, issues: [] }
    case 'invalid':
      return {
        status: 'unavailable',
        reason: 'invalid-input',
        issues: outcome.issues.map(assessmentIssueMessage),
      }
  }
}
