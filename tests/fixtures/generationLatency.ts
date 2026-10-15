// Slowest measured v10 requests from the independently checked 1,216-request corpus.
export const GENERATION_LATENCY_INPUTS = [
  {
    variant: 'classic',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:008',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:008',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:009',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'expert',
    seed: 'local-product-corpus-v1:seed:053',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:021',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:063',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:017',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:013',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:000',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:054',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:039',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:062',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:003',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:000',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:063',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:031',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:006',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:037',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:040',
    expectedStatus: 'completed',
  },
] as const

// Historical v9 failure, checked separately from current-identity construction.
export const GENERATION_RECOVERY_INPUTS = [
  {
    variant: 'classic',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:058',
  },
] as const

// Historical Killer Hard recovery input; current and paired v9 outputs are independently checked.
export const KILLER_HARD_RECOVERY_INPUT = {
  variant: 'killer',
  difficulty: 'hard',
  seed: 'targeted-release-v1:seed:005',
} as const
