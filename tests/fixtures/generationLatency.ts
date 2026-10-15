// Slowest measured v9 requests from the independently checked 1,216-request corpus.
export const GENERATION_LATENCY_INPUTS = [
  {
    variant: 'classic',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:057',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:043',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:058',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'expert',
    seed: 'local-product-corpus-v1:seed:050',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:054',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:042',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:034',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:061',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:035',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:058',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:062',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:052',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:033',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:009',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:055',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:014',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:010',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:008',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:062',
    expectedStatus: 'completed',
  },
] as const

// Natural v9 layout exhaustion; no authored replacement or identical-input retry.
export const GENERATION_RECOVERY_INPUTS = [
  {
    variant: 'classic',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:058',
  },
] as const

// Same-v9 control exhausts 4,000,000 work; cage support reuse completes in 1,917,870.
export const KILLER_HARD_RECOVERY_INPUT = {
  variant: 'killer',
  difficulty: 'hard',
  seed: 'targeted-release-v1:seed:005',
} as const
