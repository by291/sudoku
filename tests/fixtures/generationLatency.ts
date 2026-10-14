// Slowest measured v8 requests from the independently checked 1,216-request corpus.
export const GENERATION_LATENCY_INPUTS = [
  {
    variant: 'classic',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:013',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:015',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:036',
    expectedStatus: 'completed',
  },
  {
    variant: 'classic',
    difficulty: 'expert',
    seed: 'local-product-corpus-v1:seed:044',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:056',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:005',
    expectedStatus: 'completed',
  },
  {
    variant: 'diagonal',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:011',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:038',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:026',
    expectedStatus: 'completed',
  },
  {
    variant: 'jigsaw',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:015',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:010',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:018',
    expectedStatus: 'completed',
  },
  {
    variant: 'killer',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:048',
    expectedStatus: 'budget-exhausted',
  },
  {
    variant: 'thermo',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:045',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:047',
    expectedStatus: 'completed',
  },
  {
    variant: 'thermo',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:020',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'easy',
    seed: 'local-product-corpus-v1:seed:047',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'medium',
    seed: 'local-product-corpus-v1:seed:061',
    expectedStatus: 'completed',
  },
  {
    variant: 'arrow',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:041',
    expectedStatus: 'completed',
  },
] as const

// Natural v8 construction exhaustion; no authored replacement or identical-input retry.
export const GENERATION_EXHAUSTION_INPUTS = [
  {
    variant: 'killer',
    difficulty: 'hard',
    seed: 'local-product-corpus-v1:seed:048',
  },
] as const
