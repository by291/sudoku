import type { ExerciseStage } from '@/features/learning/model/exerciseStages'

// Frozen authored states; independent course tests establish each unit, link, arithmetic and path premise.
export function createCourseFragments(ARROW_CIRCLE_EXAMPLE: ExerciseStage) {
  return {
    'naked-triple': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          3, 6, 5, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'naked-triple',
          evidence: {
            cells: [0, 1, 2],
            digits: [1, 2, 3],
            domains: [
              {
                cell: 0,
                mask: 3,
              },
              {
                cell: 1,
                mask: 6,
              },
              {
                cell: 2,
                mask: 5,
              },
              {
                cell: 3,
                mask: 511,
              },
              {
                cell: 4,
                mask: 511,
              },
              {
                cell: 5,
                mask: 511,
              },
              {
                cell: 6,
                mask: 511,
              },
              {
                cell: 7,
                mask: 511,
              },
              {
                cell: 8,
                mask: 511,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 511,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 511,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 511,
              },
              {
                cell: 28,
                mask: 511,
              },
              {
                cell: 29,
                mask: 511,
              },
              {
                cell: 30,
                mask: 511,
              },
              {
                cell: 31,
                mask: 511,
              },
              {
                cell: 32,
                mask: 511,
              },
              {
                cell: 33,
                mask: 511,
              },
              {
                cell: 34,
                mask: 511,
              },
              {
                cell: 35,
                mask: 511,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 511,
              },
              {
                cell: 38,
                mask: 511,
              },
              {
                cell: 39,
                mask: 511,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 511,
              },
              {
                cell: 42,
                mask: 511,
              },
              {
                cell: 43,
                mask: 511,
              },
              {
                cell: 44,
                mask: 511,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 511,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 511,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 511,
              },
              {
                cell: 57,
                mask: 511,
              },
              {
                cell: 58,
                mask: 511,
              },
              {
                cell: 59,
                mask: 511,
              },
              {
                cell: 60,
                mask: 511,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 511,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 511,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 511,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'subset',
            unit: {
              kind: 'row',
              index: 0,
            },
            hidden: false,
          },
          removals: [
            {
              cell: 3,
              digit: 1,
            },
            {
              cell: 3,
              digit: 2,
            },
            {
              cell: 3,
              digit: 3,
            },
            {
              cell: 4,
              digit: 1,
            },
            {
              cell: 4,
              digit: 2,
            },
            {
              cell: 4,
              digit: 3,
            },
            {
              cell: 5,
              digit: 1,
            },
            {
              cell: 5,
              digit: 2,
            },
            {
              cell: 5,
              digit: 3,
            },
            {
              cell: 6,
              digit: 1,
            },
            {
              cell: 6,
              digit: 2,
            },
            {
              cell: 6,
              digit: 3,
            },
            {
              cell: 7,
              digit: 1,
            },
            {
              cell: 7,
              digit: 2,
            },
            {
              cell: 7,
              digit: 3,
            },
            {
              cell: 8,
              digit: 1,
            },
            {
              cell: 8,
              digit: 2,
            },
            {
              cell: 8,
              digit: 3,
            },
          ],
        },
      },
    ],
    'hidden-triple': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          11, 14, 13, 504, 504, 504, 504, 504, 504, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'hidden-triple',
          evidence: {
            cells: [0, 1, 2],
            digits: [1, 2, 3],
            domains: [
              {
                cell: 0,
                mask: 11,
              },
              {
                cell: 1,
                mask: 14,
              },
              {
                cell: 2,
                mask: 13,
              },
              {
                cell: 3,
                mask: 504,
              },
              {
                cell: 4,
                mask: 504,
              },
              {
                cell: 5,
                mask: 504,
              },
              {
                cell: 6,
                mask: 504,
              },
              {
                cell: 7,
                mask: 504,
              },
              {
                cell: 8,
                mask: 504,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 511,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 511,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 511,
              },
              {
                cell: 28,
                mask: 511,
              },
              {
                cell: 29,
                mask: 511,
              },
              {
                cell: 30,
                mask: 511,
              },
              {
                cell: 31,
                mask: 511,
              },
              {
                cell: 32,
                mask: 511,
              },
              {
                cell: 33,
                mask: 511,
              },
              {
                cell: 34,
                mask: 511,
              },
              {
                cell: 35,
                mask: 511,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 511,
              },
              {
                cell: 38,
                mask: 511,
              },
              {
                cell: 39,
                mask: 511,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 511,
              },
              {
                cell: 42,
                mask: 511,
              },
              {
                cell: 43,
                mask: 511,
              },
              {
                cell: 44,
                mask: 511,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 511,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 511,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 511,
              },
              {
                cell: 57,
                mask: 511,
              },
              {
                cell: 58,
                mask: 511,
              },
              {
                cell: 59,
                mask: 511,
              },
              {
                cell: 60,
                mask: 511,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 511,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 511,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 511,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'subset',
            unit: {
              kind: 'row',
              index: 0,
            },
            hidden: true,
          },
          removals: [
            {
              cell: 0,
              digit: 4,
            },
            {
              cell: 1,
              digit: 4,
            },
            {
              cell: 2,
              digit: 4,
            },
          ],
        },
      },
    ],
    'x-wing': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          510, 511, 510, 510, 510, 510, 511, 510, 510, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 510, 511, 510, 510, 510, 510, 511, 510, 510,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'x-wing',
          evidence: {
            cells: [1, 6, 28, 33],
            digits: [1],
            domains: [
              {
                cell: 0,
                mask: 510,
              },
              {
                cell: 1,
                mask: 511,
              },
              {
                cell: 2,
                mask: 510,
              },
              {
                cell: 3,
                mask: 510,
              },
              {
                cell: 4,
                mask: 510,
              },
              {
                cell: 5,
                mask: 510,
              },
              {
                cell: 6,
                mask: 511,
              },
              {
                cell: 7,
                mask: 510,
              },
              {
                cell: 8,
                mask: 510,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 511,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 511,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 510,
              },
              {
                cell: 28,
                mask: 511,
              },
              {
                cell: 29,
                mask: 510,
              },
              {
                cell: 30,
                mask: 510,
              },
              {
                cell: 31,
                mask: 510,
              },
              {
                cell: 32,
                mask: 510,
              },
              {
                cell: 33,
                mask: 511,
              },
              {
                cell: 34,
                mask: 510,
              },
              {
                cell: 35,
                mask: 510,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 511,
              },
              {
                cell: 38,
                mask: 511,
              },
              {
                cell: 39,
                mask: 511,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 511,
              },
              {
                cell: 42,
                mask: 511,
              },
              {
                cell: 43,
                mask: 511,
              },
              {
                cell: 44,
                mask: 511,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 511,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 511,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 511,
              },
              {
                cell: 57,
                mask: 511,
              },
              {
                cell: 58,
                mask: 511,
              },
              {
                cell: 59,
                mask: 511,
              },
              {
                cell: 60,
                mask: 511,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 511,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 511,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 511,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'fish',
            bases: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'row',
                index: 3,
              },
            ],
            covers: [
              {
                kind: 'column',
                index: 1,
              },
              {
                kind: 'column',
                index: 6,
              },
            ],
          },
          removals: [
            {
              cell: 10,
              digit: 1,
            },
            {
              cell: 15,
              digit: 1,
            },
            {
              cell: 19,
              digit: 1,
            },
            {
              cell: 24,
              digit: 1,
            },
            {
              cell: 37,
              digit: 1,
            },
            {
              cell: 42,
              digit: 1,
            },
            {
              cell: 46,
              digit: 1,
            },
            {
              cell: 51,
              digit: 1,
            },
            {
              cell: 55,
              digit: 1,
            },
            {
              cell: 60,
              digit: 1,
            },
            {
              cell: 64,
              digit: 1,
            },
            {
              cell: 69,
              digit: 1,
            },
            {
              cell: 73,
              digit: 1,
            },
            {
              cell: 78,
              digit: 1,
            },
          ],
        },
      },
    ],
    swordfish: [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          510, 511, 510, 510, 511, 510, 510, 510, 510, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 510, 510, 510, 510, 511, 510, 510, 511, 510,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          510, 511, 510, 510, 510, 510, 510, 511, 510, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'swordfish',
          evidence: {
            cells: [1, 4, 31, 34, 55, 61],
            digits: [1],
            domains: [
              {
                cell: 0,
                mask: 510,
              },
              {
                cell: 1,
                mask: 511,
              },
              {
                cell: 2,
                mask: 510,
              },
              {
                cell: 3,
                mask: 510,
              },
              {
                cell: 4,
                mask: 511,
              },
              {
                cell: 5,
                mask: 510,
              },
              {
                cell: 6,
                mask: 510,
              },
              {
                cell: 7,
                mask: 510,
              },
              {
                cell: 8,
                mask: 510,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 511,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 511,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 510,
              },
              {
                cell: 28,
                mask: 510,
              },
              {
                cell: 29,
                mask: 510,
              },
              {
                cell: 30,
                mask: 510,
              },
              {
                cell: 31,
                mask: 511,
              },
              {
                cell: 32,
                mask: 510,
              },
              {
                cell: 33,
                mask: 510,
              },
              {
                cell: 34,
                mask: 511,
              },
              {
                cell: 35,
                mask: 510,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 511,
              },
              {
                cell: 38,
                mask: 511,
              },
              {
                cell: 39,
                mask: 511,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 511,
              },
              {
                cell: 42,
                mask: 511,
              },
              {
                cell: 43,
                mask: 511,
              },
              {
                cell: 44,
                mask: 511,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 511,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 510,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 510,
              },
              {
                cell: 57,
                mask: 510,
              },
              {
                cell: 58,
                mask: 510,
              },
              {
                cell: 59,
                mask: 510,
              },
              {
                cell: 60,
                mask: 510,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 510,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 511,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 511,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'fish',
            bases: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'row',
                index: 3,
              },
              {
                kind: 'row',
                index: 6,
              },
            ],
            covers: [
              {
                kind: 'column',
                index: 1,
              },
              {
                kind: 'column',
                index: 4,
              },
              {
                kind: 'column',
                index: 7,
              },
            ],
          },
          removals: [
            {
              cell: 10,
              digit: 1,
            },
            {
              cell: 13,
              digit: 1,
            },
            {
              cell: 16,
              digit: 1,
            },
            {
              cell: 19,
              digit: 1,
            },
            {
              cell: 22,
              digit: 1,
            },
            {
              cell: 25,
              digit: 1,
            },
            {
              cell: 37,
              digit: 1,
            },
            {
              cell: 40,
              digit: 1,
            },
            {
              cell: 43,
              digit: 1,
            },
            {
              cell: 46,
              digit: 1,
            },
            {
              cell: 49,
              digit: 1,
            },
            {
              cell: 52,
              digit: 1,
            },
            {
              cell: 64,
              digit: 1,
            },
            {
              cell: 67,
              digit: 1,
            },
            {
              cell: 70,
              digit: 1,
            },
            {
              cell: 73,
              digit: 1,
            },
            {
              cell: 76,
              digit: 1,
            },
            {
              cell: 79,
              digit: 1,
            },
          ],
        },
      },
    ],
    'xy-wing': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          3, 511, 511, 511, 5, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 6, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511, 511,
          511, 511, 511, 511, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'xy-wing',
          evidence: {
            cells: [0, 4, 27],
            digits: [1, 2, 3],
            domains: [
              {
                cell: 0,
                mask: 3,
              },
              {
                cell: 1,
                mask: 511,
              },
              {
                cell: 2,
                mask: 511,
              },
              {
                cell: 3,
                mask: 511,
              },
              {
                cell: 4,
                mask: 5,
              },
              {
                cell: 5,
                mask: 511,
              },
              {
                cell: 6,
                mask: 511,
              },
              {
                cell: 7,
                mask: 511,
              },
              {
                cell: 8,
                mask: 511,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 511,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 511,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 6,
              },
              {
                cell: 28,
                mask: 511,
              },
              {
                cell: 29,
                mask: 511,
              },
              {
                cell: 30,
                mask: 511,
              },
              {
                cell: 31,
                mask: 511,
              },
              {
                cell: 32,
                mask: 511,
              },
              {
                cell: 33,
                mask: 511,
              },
              {
                cell: 34,
                mask: 511,
              },
              {
                cell: 35,
                mask: 511,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 511,
              },
              {
                cell: 38,
                mask: 511,
              },
              {
                cell: 39,
                mask: 511,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 511,
              },
              {
                cell: 42,
                mask: 511,
              },
              {
                cell: 43,
                mask: 511,
              },
              {
                cell: 44,
                mask: 511,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 511,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 511,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 511,
              },
              {
                cell: 57,
                mask: 511,
              },
              {
                cell: 58,
                mask: 511,
              },
              {
                cell: 59,
                mask: 511,
              },
              {
                cell: 60,
                mask: 511,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 511,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 511,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 511,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'wing',
            pivot: 0,
            wings: [4, 27],
          },
          removals: [
            {
              cell: 31,
              digit: 3,
            },
          ],
        },
      },
    ],
    'simple-coloring': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          511, 510, 510, 510, 511, 510, 510, 510, 510, 511, 511, 511, 511, 510, 511, 511, 511, 511,
          511, 511, 511, 511, 510, 511, 511, 511, 511, 511, 511, 511, 511, 510, 511, 511, 511, 511,
          511, 510, 510, 510, 511, 510, 510, 510, 510, 511, 511, 511, 511, 510, 511, 511, 511, 511,
          511, 511, 511, 511, 510, 511, 511, 511, 511, 511, 511, 511, 511, 510, 511, 511, 511, 511,
          511, 511, 511, 511, 510, 511, 511, 511, 511,
        ],
        rules: {
          kind: 'classic',
        },
        step: {
          kind: 'elimination',
          technique: 'simple-coloring',
          evidence: {
            cells: [0, 4, 36, 40],
            digits: [1],
            domains: [
              {
                cell: 0,
                mask: 511,
              },
              {
                cell: 1,
                mask: 510,
              },
              {
                cell: 2,
                mask: 510,
              },
              {
                cell: 3,
                mask: 510,
              },
              {
                cell: 4,
                mask: 511,
              },
              {
                cell: 5,
                mask: 510,
              },
              {
                cell: 6,
                mask: 510,
              },
              {
                cell: 7,
                mask: 510,
              },
              {
                cell: 8,
                mask: 510,
              },
              {
                cell: 9,
                mask: 511,
              },
              {
                cell: 10,
                mask: 511,
              },
              {
                cell: 11,
                mask: 511,
              },
              {
                cell: 12,
                mask: 511,
              },
              {
                cell: 13,
                mask: 510,
              },
              {
                cell: 14,
                mask: 511,
              },
              {
                cell: 15,
                mask: 511,
              },
              {
                cell: 16,
                mask: 511,
              },
              {
                cell: 17,
                mask: 511,
              },
              {
                cell: 18,
                mask: 511,
              },
              {
                cell: 19,
                mask: 511,
              },
              {
                cell: 20,
                mask: 511,
              },
              {
                cell: 21,
                mask: 511,
              },
              {
                cell: 22,
                mask: 510,
              },
              {
                cell: 23,
                mask: 511,
              },
              {
                cell: 24,
                mask: 511,
              },
              {
                cell: 25,
                mask: 511,
              },
              {
                cell: 26,
                mask: 511,
              },
              {
                cell: 27,
                mask: 511,
              },
              {
                cell: 28,
                mask: 511,
              },
              {
                cell: 29,
                mask: 511,
              },
              {
                cell: 30,
                mask: 511,
              },
              {
                cell: 31,
                mask: 510,
              },
              {
                cell: 32,
                mask: 511,
              },
              {
                cell: 33,
                mask: 511,
              },
              {
                cell: 34,
                mask: 511,
              },
              {
                cell: 35,
                mask: 511,
              },
              {
                cell: 36,
                mask: 511,
              },
              {
                cell: 37,
                mask: 510,
              },
              {
                cell: 38,
                mask: 510,
              },
              {
                cell: 39,
                mask: 510,
              },
              {
                cell: 40,
                mask: 511,
              },
              {
                cell: 41,
                mask: 510,
              },
              {
                cell: 42,
                mask: 510,
              },
              {
                cell: 43,
                mask: 510,
              },
              {
                cell: 44,
                mask: 510,
              },
              {
                cell: 45,
                mask: 511,
              },
              {
                cell: 46,
                mask: 511,
              },
              {
                cell: 47,
                mask: 511,
              },
              {
                cell: 48,
                mask: 511,
              },
              {
                cell: 49,
                mask: 510,
              },
              {
                cell: 50,
                mask: 511,
              },
              {
                cell: 51,
                mask: 511,
              },
              {
                cell: 52,
                mask: 511,
              },
              {
                cell: 53,
                mask: 511,
              },
              {
                cell: 54,
                mask: 511,
              },
              {
                cell: 55,
                mask: 511,
              },
              {
                cell: 56,
                mask: 511,
              },
              {
                cell: 57,
                mask: 511,
              },
              {
                cell: 58,
                mask: 510,
              },
              {
                cell: 59,
                mask: 511,
              },
              {
                cell: 60,
                mask: 511,
              },
              {
                cell: 61,
                mask: 511,
              },
              {
                cell: 62,
                mask: 511,
              },
              {
                cell: 63,
                mask: 511,
              },
              {
                cell: 64,
                mask: 511,
              },
              {
                cell: 65,
                mask: 511,
              },
              {
                cell: 66,
                mask: 511,
              },
              {
                cell: 67,
                mask: 510,
              },
              {
                cell: 68,
                mask: 511,
              },
              {
                cell: 69,
                mask: 511,
              },
              {
                cell: 70,
                mask: 511,
              },
              {
                cell: 71,
                mask: 511,
              },
              {
                cell: 72,
                mask: 511,
              },
              {
                cell: 73,
                mask: 511,
              },
              {
                cell: 74,
                mask: 511,
              },
              {
                cell: 75,
                mask: 511,
              },
              {
                cell: 76,
                mask: 510,
              },
              {
                cell: 77,
                mask: 511,
              },
              {
                cell: 78,
                mask: 511,
              },
              {
                cell: 79,
                mask: 511,
              },
              {
                cell: 80,
                mask: 511,
              },
            ],
            kind: 'coloring',
            mode: 'trap',
            colors: [
              [0, 40],
              [4, 36],
            ],
            links: [
              {
                unit: {
                  kind: 'row',
                  index: 0,
                },
                cells: [0, 4],
              },
              {
                unit: {
                  kind: 'row',
                  index: 4,
                },
                cells: [36, 40],
              },
              {
                unit: {
                  kind: 'column',
                  index: 4,
                },
                cells: [4, 40],
              },
            ],
          },
          removals: [
            {
              cell: 9,
              digit: 1,
            },
            {
              cell: 18,
              digit: 1,
            },
            {
              cell: 27,
              digit: 1,
            },
            {
              cell: 45,
              digit: 1,
            },
            {
              cell: 54,
              digit: 1,
            },
            {
              cell: 63,
              digit: 1,
            },
            {
              cell: 72,
              digit: 1,
            },
          ],
        },
      },
    ],
    'diagonal-singles': [
      {
        board: [
          0, 0, 0, 4, 0, 0, 7, 8, 9, 4, 5, 0, 7, 8, 0, 0, 0, 3, 7, 0, 0, 1, 0, 0, 4, 5, 6, 0, 0, 0,
          0, 0, 0, 0, 6, 0, 6, 1, 0, 5, 0, 8, 0, 9, 0, 0, 0, 2, 6, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 7, 0, 0, 7, 0, 0, 6, 0, 0, 4, 0, 0, 0, 0, 9, 7, 0, 0, 0, 0,
        ],
        candidates: [
          7, 38, 37, 0, 22, 54, 0, 0, 0, 0, 0, 288, 0, 0, 288, 3, 3, 0, 0, 390, 388, 0, 6, 262, 0,
          0, 0, 404, 396, 476, 6, 271, 7, 151, 0, 219, 0, 0, 72, 0, 6, 0, 6, 0, 72, 404, 396, 0, 0,
          269, 0, 149, 5, 153, 263, 302, 149, 134, 23, 31, 423, 0, 147, 263, 0, 261, 134, 0, 23,
          407, 0, 147, 151, 46, 45, 0, 0, 31, 183, 7, 131,
        ],
        rules: {
          kind: 'diagonal',
        },
        step: {
          kind: 'placement',
          technique: 'hidden-single',
          cell: 60,
          digit: 6,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'diagonal',
              index: 0,
            },
            cells: [60],
            digits: [6],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 6,
              },
              {
                kind: 'column',
                index: 6,
              },
              {
                kind: 'box',
                index: 8,
              },
              {
                kind: 'diagonal',
                index: 0,
              },
            ],
          },
        },
      },
    ],
    'diagonal-intersections': [
      {
        board: [
          0, 0, 0, 4, 0, 0, 7, 8, 9, 4, 5, 0, 7, 0, 0, 0, 0, 3, 7, 0, 0, 1, 0, 0, 4, 5, 6, 0, 0, 0,
          0, 0, 0, 0, 6, 0, 0, 1, 0, 5, 0, 8, 0, 0, 0, 0, 0, 2, 6, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 7, 0, 0, 7, 0, 0, 6, 0, 0, 4, 0, 0, 0, 0, 9, 7, 0, 0, 0, 0,
        ],
        candidates: [
          39, 38, 37, 0, 22, 54, 0, 0, 0, 0, 0, 417, 0, 386, 290, 3, 3, 0, 0, 390, 388, 0, 390, 262,
          0, 0, 0, 404, 396, 476, 6, 271, 7, 407, 0, 219, 292, 0, 364, 0, 6, 0, 262, 262, 74, 404,
          396, 0, 0, 269, 0, 405, 261, 153, 439, 430, 149, 134, 159, 31, 423, 0, 147, 407, 0, 405,
          134, 0, 23, 407, 0, 147, 151, 174, 189, 0, 0, 31, 183, 7, 131,
        ],
        rules: {
          kind: 'diagonal',
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 0,
            },
            cells: [0, 2],
            digits: [1],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'column',
                index: 0,
              },
              {
                kind: 'column',
                index: 2,
              },
              {
                kind: 'box',
                index: 0,
              },
              {
                kind: 'diagonal',
                index: 0,
              },
            ],
          },
          removals: [
            {
              cell: 11,
              digit: 1,
            },
          ],
        },
      },
    ],
    'diagonal-combined': [
      {
        board: [
          0, 0, 0, 4, 0, 0, 7, 8, 9, 4, 5, 0, 7, 0, 0, 0, 0, 3, 7, 0, 0, 1, 0, 0, 4, 5, 6, 0, 0, 0,
          0, 0, 0, 0, 6, 0, 0, 1, 0, 5, 0, 8, 0, 0, 0, 0, 0, 2, 6, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 7, 0, 0, 7, 0, 0, 6, 0, 0, 4, 0, 0, 0, 0, 9, 7, 0, 0, 0, 0,
        ],
        candidates: [
          39, 38, 37, 0, 22, 54, 0, 0, 0, 0, 0, 417, 0, 386, 290, 3, 3, 0, 0, 390, 388, 0, 390, 262,
          0, 0, 0, 404, 396, 476, 6, 271, 7, 407, 0, 219, 292, 0, 364, 0, 6, 0, 262, 262, 74, 404,
          396, 0, 0, 269, 0, 405, 261, 153, 439, 430, 149, 134, 159, 31, 423, 0, 147, 407, 0, 405,
          134, 0, 23, 407, 0, 147, 151, 174, 189, 0, 0, 31, 183, 7, 131,
        ],
        rules: {
          kind: 'diagonal',
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 0,
            },
            cells: [0, 2],
            digits: [1],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'column',
                index: 0,
              },
              {
                kind: 'column',
                index: 2,
              },
              {
                kind: 'box',
                index: 0,
              },
              {
                kind: 'diagonal',
                index: 0,
              },
            ],
          },
          removals: [
            {
              cell: 11,
              digit: 1,
            },
          ],
        },
      },
      {
        board: [
          0, 0, 0, 4, 0, 0, 7, 8, 9, 4, 5, 0, 7, 0, 0, 0, 0, 3, 7, 0, 0, 1, 0, 0, 4, 5, 6, 0, 0, 0,
          0, 0, 0, 0, 6, 0, 0, 1, 0, 5, 0, 8, 0, 0, 0, 0, 0, 2, 6, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 7, 0, 0, 7, 0, 0, 6, 0, 0, 4, 0, 0, 0, 0, 9, 7, 0, 0, 0, 0,
        ],
        candidates: [
          39, 38, 37, 0, 22, 54, 0, 0, 0, 0, 0, 416, 0, 386, 290, 3, 3, 0, 0, 390, 388, 0, 390, 262,
          0, 0, 0, 404, 396, 476, 6, 271, 7, 407, 0, 219, 292, 0, 364, 0, 6, 0, 262, 262, 74, 404,
          396, 0, 0, 269, 0, 405, 261, 153, 439, 430, 149, 134, 159, 31, 423, 0, 147, 407, 0, 405,
          134, 0, 23, 407, 0, 147, 151, 174, 189, 0, 0, 31, 183, 7, 131,
        ],
        rules: {
          kind: 'diagonal',
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'column',
              index: 3,
            },
            cells: [57, 66],
            digits: [8],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 6,
              },
              {
                kind: 'row',
                index: 7,
              },
              {
                kind: 'column',
                index: 3,
              },
              {
                kind: 'box',
                index: 7,
              },
            ],
          },
          removals: [
            {
              cell: 58,
              digit: 8,
            },
          ],
        },
      },
      {
        board: [
          0, 0, 0, 4, 0, 0, 7, 8, 9, 4, 5, 0, 7, 0, 0, 0, 0, 3, 7, 0, 0, 1, 0, 0, 4, 5, 6, 0, 0, 0,
          0, 0, 0, 0, 6, 0, 0, 1, 0, 5, 0, 8, 0, 0, 0, 0, 0, 2, 6, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 7, 0, 0, 7, 0, 0, 6, 0, 0, 4, 0, 0, 0, 0, 9, 7, 0, 0, 0, 0,
        ],
        candidates: [
          39, 38, 37, 0, 22, 54, 0, 0, 0, 0, 0, 416, 0, 386, 290, 3, 3, 0, 0, 390, 388, 0, 390, 262,
          0, 0, 0, 404, 396, 476, 6, 271, 7, 407, 0, 219, 292, 0, 364, 0, 6, 0, 262, 262, 74, 404,
          396, 0, 0, 269, 0, 405, 261, 153, 439, 430, 149, 134, 31, 31, 423, 0, 147, 407, 0, 405,
          134, 0, 23, 407, 0, 147, 151, 174, 189, 0, 0, 31, 183, 7, 131,
        ],
        rules: {
          kind: 'diagonal',
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'column',
              index: 5,
            },
            cells: [59, 77],
            digits: [4],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 6,
              },
              {
                kind: 'row',
                index: 8,
              },
              {
                kind: 'column',
                index: 5,
              },
              {
                kind: 'box',
                index: 7,
              },
            ],
          },
          removals: [
            {
              cell: 58,
              digit: 4,
            },
          ],
        },
      },
    ],
    'jigsaw-singles': [
      {
        board: [
          0, 2, 3, 0, 0, 0, 7, 0, 9, 7, 8, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 0, 4,
          7, 0, 0, 0, 0, 1, 0, 0, 7, 0, 8, 0, 2, 3, 4, 8, 9, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 6, 0,
          0, 0, 0, 0, 0, 8, 2, 0, 1, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          41, 0, 0, 177, 25, 184, 0, 168, 0, 0, 0, 289, 293, 267, 298, 40, 0, 38, 300, 0, 288, 416,
          330, 490, 0, 170, 166, 0, 36, 0, 0, 276, 308, 432, 416, 0, 49, 33, 0, 305, 0, 304, 0, 0,
          0, 0, 0, 49, 0, 23, 54, 48, 96, 112, 277, 0, 273, 404, 0, 468, 400, 451, 210, 304, 96, 0,
          0, 344, 0, 0, 360, 112, 309, 101, 0, 404, 348, 476, 440, 489, 240,
        ],
        rules: {
          kind: 'jigsaw',
          regions: [
            [0, 1, 12, 9, 10, 11, 18, 19, 20],
            [3, 4, 5, 2, 13, 14, 21, 22, 23],
            [6, 7, 8, 15, 16, 17, 24, 25, 26],
            [27, 28, 29, 36, 37, 38, 45, 46, 47],
            [30, 31, 32, 39, 40, 41, 48, 49, 50],
            [33, 34, 35, 42, 43, 44, 51, 52, 53],
            [54, 55, 56, 63, 64, 65, 72, 73, 74],
            [57, 58, 59, 66, 67, 68, 75, 76, 77],
            [60, 61, 62, 69, 70, 71, 78, 79, 80],
          ],
        },
        step: {
          kind: 'placement',
          technique: 'hidden-single',
          cell: 28,
          digit: 3,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'region',
              index: 3,
            },
            cells: [28],
            digits: [3],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 3,
              },
              {
                kind: 'column',
                index: 1,
              },
              {
                kind: 'region',
                index: 3,
              },
            ],
          },
        },
      },
    ],
    'jigsaw-intersections': [
      {
        board: [
          0, 2, 3, 0, 0, 0, 7, 0, 9, 7, 8, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 3, 4,
          7, 0, 0, 0, 0, 1, 0, 0, 7, 0, 8, 0, 2, 3, 4, 8, 9, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 6, 0,
          0, 0, 0, 0, 0, 8, 2, 0, 1, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          41, 0, 0, 177, 25, 184, 0, 168, 0, 0, 0, 289, 293, 267, 298, 40, 0, 38, 300, 0, 288, 416,
          330, 490, 0, 170, 166, 0, 0, 0, 0, 272, 304, 432, 416, 0, 49, 33, 0, 305, 0, 304, 0, 0, 0,
          0, 0, 49, 0, 23, 54, 48, 96, 112, 277, 0, 273, 404, 0, 468, 400, 451, 210, 304, 96, 0, 0,
          344, 0, 0, 360, 112, 309, 97, 0, 404, 348, 476, 440, 489, 240,
        ],
        rules: {
          kind: 'jigsaw',
          regions: [
            [0, 1, 12, 9, 10, 11, 18, 19, 20],
            [3, 4, 5, 2, 13, 14, 21, 22, 23],
            [6, 7, 8, 15, 16, 17, 24, 25, 26],
            [27, 28, 29, 36, 37, 38, 45, 46, 47],
            [30, 31, 32, 39, 40, 41, 48, 49, 50],
            [33, 34, 35, 42, 43, 44, 51, 52, 53],
            [54, 55, 56, 63, 64, 65, 72, 73, 74],
            [57, 58, 59, 66, 67, 68, 75, 76, 77],
            [60, 61, 62, 69, 70, 71, 78, 79, 80],
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 4,
            },
            cells: [39, 41],
            digits: [9],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 4,
              },
              {
                kind: 'column',
                index: 3,
              },
              {
                kind: 'column',
                index: 5,
              },
              {
                kind: 'region',
                index: 4,
              },
            ],
          },
          removals: [
            {
              cell: 31,
              digit: 9,
            },
            {
              cell: 32,
              digit: 9,
            },
          ],
        },
      },
    ],
    'jigsaw-combined': [
      {
        board: [
          0, 2, 3, 0, 0, 0, 7, 0, 9, 7, 8, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 3, 4,
          7, 0, 0, 0, 0, 1, 0, 0, 7, 0, 8, 0, 2, 3, 4, 8, 9, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 6, 0,
          0, 0, 0, 0, 0, 8, 2, 0, 1, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          41, 0, 0, 177, 25, 184, 0, 168, 0, 0, 0, 289, 293, 267, 298, 40, 0, 38, 300, 0, 288, 416,
          330, 490, 0, 170, 166, 0, 0, 0, 0, 272, 304, 432, 416, 0, 49, 33, 0, 305, 0, 304, 0, 0, 0,
          0, 0, 49, 0, 23, 54, 48, 96, 112, 277, 0, 273, 404, 0, 468, 400, 451, 210, 304, 96, 0, 0,
          344, 0, 0, 360, 112, 309, 97, 0, 404, 348, 476, 440, 489, 240,
        ],
        rules: {
          kind: 'jigsaw',
          regions: [
            [0, 1, 12, 9, 10, 11, 18, 19, 20],
            [3, 4, 5, 2, 13, 14, 21, 22, 23],
            [6, 7, 8, 15, 16, 17, 24, 25, 26],
            [27, 28, 29, 36, 37, 38, 45, 46, 47],
            [30, 31, 32, 39, 40, 41, 48, 49, 50],
            [33, 34, 35, 42, 43, 44, 51, 52, 53],
            [54, 55, 56, 63, 64, 65, 72, 73, 74],
            [57, 58, 59, 66, 67, 68, 75, 76, 77],
            [60, 61, 62, 69, 70, 71, 78, 79, 80],
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 4,
            },
            cells: [39, 41],
            digits: [9],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 4,
              },
              {
                kind: 'column',
                index: 3,
              },
              {
                kind: 'column',
                index: 5,
              },
              {
                kind: 'region',
                index: 4,
              },
            ],
          },
          removals: [
            {
              cell: 31,
              digit: 9,
            },
            {
              cell: 32,
              digit: 9,
            },
          ],
        },
      },
      {
        board: [
          0, 2, 3, 0, 0, 0, 7, 0, 9, 7, 8, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 3, 4,
          7, 0, 0, 0, 0, 1, 0, 0, 7, 0, 8, 0, 2, 3, 4, 8, 9, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 6, 0,
          0, 0, 0, 0, 0, 8, 2, 0, 1, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          41, 0, 0, 177, 25, 184, 0, 168, 0, 0, 0, 289, 293, 267, 298, 40, 0, 38, 300, 0, 288, 416,
          330, 490, 0, 170, 166, 0, 0, 0, 0, 16, 48, 432, 416, 0, 49, 33, 0, 305, 0, 304, 0, 0, 0,
          0, 0, 49, 0, 23, 54, 48, 96, 112, 277, 0, 273, 404, 0, 468, 400, 451, 210, 304, 96, 0, 0,
          344, 0, 0, 360, 112, 309, 97, 0, 404, 348, 476, 440, 489, 240,
        ],
        rules: {
          kind: 'jigsaw',
          regions: [
            [0, 1, 12, 9, 10, 11, 18, 19, 20],
            [3, 4, 5, 2, 13, 14, 21, 22, 23],
            [6, 7, 8, 15, 16, 17, 24, 25, 26],
            [27, 28, 29, 36, 37, 38, 45, 46, 47],
            [30, 31, 32, 39, 40, 41, 48, 49, 50],
            [33, 34, 35, 42, 43, 44, 51, 52, 53],
            [54, 55, 56, 63, 64, 65, 72, 73, 74],
            [57, 58, 59, 66, 67, 68, 75, 76, 77],
            [60, 61, 62, 69, 70, 71, 78, 79, 80],
          ],
        },
        step: {
          kind: 'placement',
          technique: 'naked-single',
          cell: 31,
          digit: 5,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 3,
            },
            cells: [31],
            digits: [5],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 3,
              },
              {
                kind: 'column',
                index: 4,
              },
              {
                kind: 'region',
                index: 4,
              },
            ],
          },
        },
      },
      {
        board: [
          0, 2, 3, 0, 0, 0, 7, 0, 9, 7, 8, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 3, 4,
          7, 5, 0, 0, 0, 1, 0, 0, 7, 0, 8, 0, 2, 3, 4, 8, 9, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 6, 0,
          0, 0, 0, 0, 0, 8, 2, 0, 1, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0,
        ],
        candidates: [
          41, 0, 0, 177, 9, 184, 0, 168, 0, 0, 0, 289, 293, 267, 298, 40, 0, 38, 300, 0, 288, 416,
          330, 490, 0, 170, 166, 0, 0, 0, 0, 0, 32, 416, 416, 0, 49, 33, 0, 289, 0, 288, 0, 0, 0, 0,
          0, 49, 0, 7, 38, 48, 96, 112, 277, 0, 273, 404, 0, 468, 400, 451, 210, 304, 96, 0, 0, 328,
          0, 0, 360, 112, 309, 97, 0, 404, 332, 476, 440, 489, 240,
        ],
        rules: {
          kind: 'jigsaw',
          regions: [
            [0, 1, 12, 9, 10, 11, 18, 19, 20],
            [3, 4, 5, 2, 13, 14, 21, 22, 23],
            [6, 7, 8, 15, 16, 17, 24, 25, 26],
            [27, 28, 29, 36, 37, 38, 45, 46, 47],
            [30, 31, 32, 39, 40, 41, 48, 49, 50],
            [33, 34, 35, 42, 43, 44, 51, 52, 53],
            [54, 55, 56, 63, 64, 65, 72, 73, 74],
            [57, 58, 59, 66, 67, 68, 75, 76, 77],
            [60, 61, 62, 69, 70, 71, 78, 79, 80],
          ],
        },
        step: {
          kind: 'placement',
          technique: 'naked-single',
          cell: 32,
          digit: 6,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 3,
            },
            cells: [32],
            digits: [6],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 3,
              },
              {
                kind: 'column',
                index: 5,
              },
              {
                kind: 'region',
                index: 4,
              },
            ],
          },
        },
      },
    ],
    'killer-remainder': [
      {
        board: [
          1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0,
          0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
          0, 1, 2, 0, 0, 0, 9, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 0, 492, 252, 508, 444, 496, 496, 368, 488, 504, 488, 250, 506, 442, 0, 498, 0, 484,
          500, 484, 0, 502, 438, 0, 498, 368, 430, 429, 429, 190, 447, 0, 434, 446, 313, 0, 493,
          493, 174, 431, 431, 482, 494, 361, 494, 493, 493, 190, 447, 447, 498, 510, 377, 492, 492,
          0, 236, 236, 172, 352, 0, 0, 232, 233, 233, 0, 251, 187, 0, 120, 120, 364, 365, 0, 124,
          125, 61, 368, 376, 0,
        ],
        rules: {
          kind: 'killer',
          cages: [
            {
              cells: [0, 1, 2],
              sum: 6,
            },
            {
              cells: [3, 4, 5],
              sum: 15,
            },
            {
              cells: [6, 7, 8],
              sum: 24,
            },
            {
              cells: [9, 10, 11],
              sum: 15,
            },
            {
              cells: [12, 13, 14],
              sum: 24,
            },
            {
              cells: [15, 16, 17],
              sum: 6,
            },
            {
              cells: [18, 19, 20],
              sum: 24,
            },
            {
              cells: [21, 22, 23],
              sum: 6,
            },
            {
              cells: [24, 25, 26],
              sum: 15,
            },
            {
              cells: [27, 28, 29],
              sum: 9,
            },
            {
              cells: [30, 31, 32],
              sum: 18,
            },
            {
              cells: [33, 34, 35],
              sum: 18,
            },
            {
              cells: [36, 37, 38],
              sum: 18,
            },
            {
              cells: [39, 40, 41],
              sum: 18,
            },
            {
              cells: [42, 43, 44],
              sum: 9,
            },
            {
              cells: [45, 46, 47],
              sum: 18,
            },
            {
              cells: [48, 49, 50],
              sum: 9,
            },
            {
              cells: [51, 52, 53],
              sum: 18,
            },
            {
              cells: [54, 55, 56],
              sum: 12,
            },
            {
              cells: [57, 58, 59],
              sum: 21,
            },
            {
              cells: [60, 61, 62],
              sum: 12,
            },
            {
              cells: [63, 64, 65],
              sum: 21,
            },
            {
              cells: [66, 67, 68],
              sum: 12,
            },
            {
              cells: [69, 70, 71],
              sum: 12,
            },
            {
              cells: [72, 73, 74],
              sum: 12,
            },
            {
              cells: [75, 76, 77],
              sum: 12,
            },
            {
              cells: [78, 79, 80],
              sum: 21,
            },
          ],
        },
        step: {
          kind: 'placement',
          technique: 'cage-remainder',
          evidence: {
            constraintId: 'cage:0',
            cells: [0, 1, 2],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'cage',
            sum: 6,
            domains: [
              {
                cell: 0,
                mask: 1,
              },
              {
                cell: 1,
                mask: 2,
              },
              {
                cell: 2,
                mask: 492,
              },
            ],
          },
          cell: 2,
          digit: 3,
        },
      },
    ],
    'killer-combinations': [
      {
        board: [
          1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0,
          0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
          9, 1, 2, 0, 0, 0, 9, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 0, 0, 248, 504, 440, 240, 496, 368, 488, 504, 488, 240, 496, 432, 0, 0, 0, 480, 496,
          480, 0, 502, 438, 0, 496, 368, 430, 429, 425, 190, 445, 0, 178, 444, 313, 0, 493, 489,
          174, 429, 429, 226, 492, 361, 494, 493, 489, 190, 445, 445, 242, 508, 377, 236, 236, 0,
          236, 236, 172, 0, 0, 0, 232, 233, 233, 0, 251, 187, 0, 120, 120, 364, 365, 0, 124, 125,
          61, 112, 120, 0,
        ],
        rules: {
          kind: 'killer',
          cages: [
            {
              cells: [0, 1, 2],
              sum: 6,
            },
            {
              cells: [3, 4, 5],
              sum: 15,
            },
            {
              cells: [6, 7, 8],
              sum: 24,
            },
            {
              cells: [9, 10, 11],
              sum: 15,
            },
            {
              cells: [12, 13, 14],
              sum: 24,
            },
            {
              cells: [15, 16, 17],
              sum: 6,
            },
            {
              cells: [18, 19, 20],
              sum: 24,
            },
            {
              cells: [21, 22, 23],
              sum: 6,
            },
            {
              cells: [24, 25, 26],
              sum: 15,
            },
            {
              cells: [27, 28, 29],
              sum: 9,
            },
            {
              cells: [30, 31, 32],
              sum: 18,
            },
            {
              cells: [33, 34, 35],
              sum: 18,
            },
            {
              cells: [36, 37, 38],
              sum: 18,
            },
            {
              cells: [39, 40, 41],
              sum: 18,
            },
            {
              cells: [42, 43, 44],
              sum: 9,
            },
            {
              cells: [45, 46, 47],
              sum: 18,
            },
            {
              cells: [48, 49, 50],
              sum: 9,
            },
            {
              cells: [51, 52, 53],
              sum: 18,
            },
            {
              cells: [54, 55, 56],
              sum: 12,
            },
            {
              cells: [57, 58, 59],
              sum: 21,
            },
            {
              cells: [60, 61, 62],
              sum: 12,
            },
            {
              cells: [63, 64, 65],
              sum: 21,
            },
            {
              cells: [66, 67, 68],
              sum: 12,
            },
            {
              cells: [69, 70, 71],
              sum: 12,
            },
            {
              cells: [72, 73, 74],
              sum: 12,
            },
            {
              cells: [75, 76, 77],
              sum: 12,
            },
            {
              cells: [78, 79, 80],
              sum: 21,
            },
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'cage-combination',
          evidence: {
            constraintId: 'cage:1',
            cells: [3, 4, 5],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'cage',
            sum: 15,
            domains: [
              {
                cell: 3,
                mask: 248,
              },
              {
                cell: 4,
                mask: 504,
              },
              {
                cell: 5,
                mask: 440,
              },
            ],
          },
          removals: [
            {
              cell: 3,
              digit: 7,
            },
            {
              cell: 3,
              digit: 8,
            },
            {
              cell: 4,
              digit: 7,
            },
            {
              cell: 4,
              digit: 8,
            },
            {
              cell: 4,
              digit: 9,
            },
            {
              cell: 5,
              digit: 8,
            },
            {
              cell: 5,
              digit: 9,
            },
          ],
        },
      },
    ],
    'killer-combined': [
      {
        board: [
          1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0,
          0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
          9, 1, 2, 0, 0, 0, 9, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 0, 0, 248, 504, 440, 240, 496, 368, 488, 504, 488, 240, 496, 432, 0, 0, 0, 480, 496,
          480, 0, 502, 438, 0, 496, 368, 430, 429, 425, 190, 445, 0, 178, 444, 313, 0, 493, 489,
          174, 429, 429, 226, 492, 361, 494, 493, 489, 190, 445, 445, 242, 508, 377, 236, 236, 0,
          236, 236, 172, 0, 0, 0, 232, 233, 233, 0, 251, 187, 0, 120, 120, 364, 365, 0, 124, 125,
          61, 112, 120, 0,
        ],
        rules: {
          kind: 'killer',
          cages: [
            {
              cells: [0, 1, 2],
              sum: 6,
            },
            {
              cells: [3, 4, 5],
              sum: 15,
            },
            {
              cells: [6, 7, 8],
              sum: 24,
            },
            {
              cells: [9, 10, 11],
              sum: 15,
            },
            {
              cells: [12, 13, 14],
              sum: 24,
            },
            {
              cells: [15, 16, 17],
              sum: 6,
            },
            {
              cells: [18, 19, 20],
              sum: 24,
            },
            {
              cells: [21, 22, 23],
              sum: 6,
            },
            {
              cells: [24, 25, 26],
              sum: 15,
            },
            {
              cells: [27, 28, 29],
              sum: 9,
            },
            {
              cells: [30, 31, 32],
              sum: 18,
            },
            {
              cells: [33, 34, 35],
              sum: 18,
            },
            {
              cells: [36, 37, 38],
              sum: 18,
            },
            {
              cells: [39, 40, 41],
              sum: 18,
            },
            {
              cells: [42, 43, 44],
              sum: 9,
            },
            {
              cells: [45, 46, 47],
              sum: 18,
            },
            {
              cells: [48, 49, 50],
              sum: 9,
            },
            {
              cells: [51, 52, 53],
              sum: 18,
            },
            {
              cells: [54, 55, 56],
              sum: 12,
            },
            {
              cells: [57, 58, 59],
              sum: 21,
            },
            {
              cells: [60, 61, 62],
              sum: 12,
            },
            {
              cells: [63, 64, 65],
              sum: 21,
            },
            {
              cells: [66, 67, 68],
              sum: 12,
            },
            {
              cells: [69, 70, 71],
              sum: 12,
            },
            {
              cells: [72, 73, 74],
              sum: 12,
            },
            {
              cells: [75, 76, 77],
              sum: 12,
            },
            {
              cells: [78, 79, 80],
              sum: 21,
            },
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'cage-combination',
          evidence: {
            constraintId: 'cage:1',
            cells: [3, 4, 5],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'cage',
            sum: 15,
            domains: [
              {
                cell: 3,
                mask: 248,
              },
              {
                cell: 4,
                mask: 504,
              },
              {
                cell: 5,
                mask: 440,
              },
            ],
          },
          removals: [
            {
              cell: 3,
              digit: 7,
            },
            {
              cell: 3,
              digit: 8,
            },
            {
              cell: 4,
              digit: 7,
            },
            {
              cell: 4,
              digit: 8,
            },
            {
              cell: 4,
              digit: 9,
            },
            {
              cell: 5,
              digit: 8,
            },
            {
              cell: 5,
              digit: 9,
            },
          ],
        },
      },
      {
        board: [
          1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0,
          0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
          9, 1, 2, 0, 0, 0, 9, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 0, 0, 56, 56, 56, 240, 496, 368, 488, 504, 488, 240, 496, 432, 0, 0, 0, 480, 496, 480,
          0, 502, 438, 0, 496, 368, 430, 429, 425, 190, 445, 0, 178, 444, 313, 0, 493, 489, 174,
          429, 429, 226, 492, 361, 494, 493, 489, 190, 445, 445, 242, 508, 377, 236, 236, 0, 236,
          236, 172, 0, 0, 0, 232, 233, 233, 0, 251, 187, 0, 120, 120, 364, 365, 0, 124, 125, 61,
          112, 120, 0,
        ],
        rules: {
          kind: 'killer',
          cages: [
            {
              cells: [0, 1, 2],
              sum: 6,
            },
            {
              cells: [3, 4, 5],
              sum: 15,
            },
            {
              cells: [6, 7, 8],
              sum: 24,
            },
            {
              cells: [9, 10, 11],
              sum: 15,
            },
            {
              cells: [12, 13, 14],
              sum: 24,
            },
            {
              cells: [15, 16, 17],
              sum: 6,
            },
            {
              cells: [18, 19, 20],
              sum: 24,
            },
            {
              cells: [21, 22, 23],
              sum: 6,
            },
            {
              cells: [24, 25, 26],
              sum: 15,
            },
            {
              cells: [27, 28, 29],
              sum: 9,
            },
            {
              cells: [30, 31, 32],
              sum: 18,
            },
            {
              cells: [33, 34, 35],
              sum: 18,
            },
            {
              cells: [36, 37, 38],
              sum: 18,
            },
            {
              cells: [39, 40, 41],
              sum: 18,
            },
            {
              cells: [42, 43, 44],
              sum: 9,
            },
            {
              cells: [45, 46, 47],
              sum: 18,
            },
            {
              cells: [48, 49, 50],
              sum: 9,
            },
            {
              cells: [51, 52, 53],
              sum: 18,
            },
            {
              cells: [54, 55, 56],
              sum: 12,
            },
            {
              cells: [57, 58, 59],
              sum: 21,
            },
            {
              cells: [60, 61, 62],
              sum: 12,
            },
            {
              cells: [63, 64, 65],
              sum: 21,
            },
            {
              cells: [66, 67, 68],
              sum: 12,
            },
            {
              cells: [69, 70, 71],
              sum: 12,
            },
            {
              cells: [72, 73, 74],
              sum: 12,
            },
            {
              cells: [75, 76, 77],
              sum: 12,
            },
            {
              cells: [78, 79, 80],
              sum: 21,
            },
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 0,
            },
            cells: [6, 7, 8],
            digits: [7],
            premises: [
              {
                constraintId: 'cage:1',
                cells: [3, 4, 5],
                digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                kind: 'cage',
                sum: 15,
                domains: [
                  {
                    cell: 3,
                    mask: 248,
                  },
                  {
                    cell: 4,
                    mask: 504,
                  },
                  {
                    cell: 5,
                    mask: 440,
                  },
                ],
              },
            ],
            units: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'column',
                index: 6,
              },
              {
                kind: 'column',
                index: 7,
              },
              {
                kind: 'column',
                index: 8,
              },
              {
                kind: 'box',
                index: 2,
              },
            ],
          },
          removals: [
            {
              cell: 25,
              digit: 7,
            },
            {
              cell: 26,
              digit: 7,
            },
          ],
        },
      },
      {
        board: [
          1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0,
          0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
          9, 1, 2, 0, 0, 0, 9, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 0, 0, 56, 56, 56, 240, 496, 368, 488, 504, 488, 240, 496, 432, 0, 0, 0, 480, 496, 480,
          0, 502, 438, 0, 432, 304, 430, 429, 425, 190, 445, 0, 178, 444, 313, 0, 493, 489, 174,
          429, 429, 226, 492, 361, 494, 493, 489, 190, 445, 445, 242, 508, 377, 236, 236, 0, 236,
          236, 172, 0, 0, 0, 232, 233, 233, 0, 251, 187, 0, 120, 120, 364, 365, 0, 124, 125, 61,
          112, 120, 0,
        ],
        rules: {
          kind: 'killer',
          cages: [
            {
              cells: [0, 1, 2],
              sum: 6,
            },
            {
              cells: [3, 4, 5],
              sum: 15,
            },
            {
              cells: [6, 7, 8],
              sum: 24,
            },
            {
              cells: [9, 10, 11],
              sum: 15,
            },
            {
              cells: [12, 13, 14],
              sum: 24,
            },
            {
              cells: [15, 16, 17],
              sum: 6,
            },
            {
              cells: [18, 19, 20],
              sum: 24,
            },
            {
              cells: [21, 22, 23],
              sum: 6,
            },
            {
              cells: [24, 25, 26],
              sum: 15,
            },
            {
              cells: [27, 28, 29],
              sum: 9,
            },
            {
              cells: [30, 31, 32],
              sum: 18,
            },
            {
              cells: [33, 34, 35],
              sum: 18,
            },
            {
              cells: [36, 37, 38],
              sum: 18,
            },
            {
              cells: [39, 40, 41],
              sum: 18,
            },
            {
              cells: [42, 43, 44],
              sum: 9,
            },
            {
              cells: [45, 46, 47],
              sum: 18,
            },
            {
              cells: [48, 49, 50],
              sum: 9,
            },
            {
              cells: [51, 52, 53],
              sum: 18,
            },
            {
              cells: [54, 55, 56],
              sum: 12,
            },
            {
              cells: [57, 58, 59],
              sum: 21,
            },
            {
              cells: [60, 61, 62],
              sum: 12,
            },
            {
              cells: [63, 64, 65],
              sum: 21,
            },
            {
              cells: [66, 67, 68],
              sum: 12,
            },
            {
              cells: [69, 70, 71],
              sum: 12,
            },
            {
              cells: [72, 73, 74],
              sum: 12,
            },
            {
              cells: [75, 76, 77],
              sum: 12,
            },
            {
              cells: [78, 79, 80],
              sum: 21,
            },
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'locked-candidate',
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 0,
            },
            cells: [6, 7],
            digits: [8],
            premises: [
              {
                constraintId: 'cage:1',
                cells: [3, 4, 5],
                digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                kind: 'cage',
                sum: 15,
                domains: [
                  {
                    cell: 3,
                    mask: 248,
                  },
                  {
                    cell: 4,
                    mask: 504,
                  },
                  {
                    cell: 5,
                    mask: 440,
                  },
                ],
              },
            ],
            units: [
              {
                kind: 'row',
                index: 0,
              },
              {
                kind: 'column',
                index: 6,
              },
              {
                kind: 'column',
                index: 7,
              },
              {
                kind: 'box',
                index: 2,
              },
            ],
          },
          removals: [
            {
              cell: 25,
              digit: 8,
            },
          ],
        },
      },
    ],
    'thermo-bounds': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 9, 0, 0, 0, 0, 0, 0, 2, 0, 0,
          0, 6, 7, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 6, 7, 8,
          0, 0, 0, 0, 0, 0, 9, 1, 0, 0, 0, 5, 9, 1, 0, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          189, 190, 191, 95, 286, 318, 495, 507, 366, 61, 62, 63, 95, 0, 318, 367, 379, 366, 0, 190,
          0, 31, 30, 62, 175, 187, 46, 0, 412, 156, 28, 0, 0, 392, 392, 0, 56, 376, 120, 0, 282, 0,
          362, 0, 362, 173, 492, 237, 14, 270, 270, 0, 490, 362, 28, 30, 30, 0, 0, 0, 271, 267, 270,
          172, 238, 238, 0, 0, 14, 110, 106, 0, 0, 0, 126, 30, 30, 30, 110, 106, 0,
        ],
        rules: {
          kind: 'thermo',
          paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        },
        step: {
          kind: 'placement',
          technique: 'thermo-bound',
          evidence: {
            constraintId: 'thermo:0',
            cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'thermo',
            path: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            bounds: [
              {
                cell: 0,
                min: 1,
                max: 1,
              },
              {
                cell: 1,
                min: 2,
                max: 2,
              },
              {
                cell: 2,
                min: 3,
                max: 3,
              },
              {
                cell: 3,
                min: 4,
                max: 4,
              },
              {
                cell: 4,
                min: 5,
                max: 5,
              },
              {
                cell: 5,
                min: 6,
                max: 6,
              },
              {
                cell: 6,
                min: 7,
                max: 7,
              },
              {
                cell: 7,
                min: 8,
                max: 8,
              },
              {
                cell: 8,
                min: 9,
                max: 9,
              },
            ],
          },
          cell: 0,
          digit: 1,
        },
      },
    ],
    'thermo-interactions': [
      {
        board: [
          1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 9, 0, 0, 0, 0, 0, 0, 2, 0, 0,
          0, 6, 7, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 3, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0, 6, 7, 8,
          0, 0, 0, 0, 0, 0, 9, 1, 0, 0, 0, 5, 9, 1, 0, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 190, 190, 94, 286, 318, 494, 506, 366, 60, 62, 62, 95, 0, 318, 367, 379, 366, 0, 190,
          0, 31, 30, 62, 175, 187, 46, 0, 412, 156, 28, 0, 0, 392, 392, 0, 56, 376, 120, 0, 282, 0,
          362, 0, 362, 172, 492, 0, 14, 270, 270, 0, 490, 362, 28, 30, 30, 0, 0, 0, 271, 267, 270,
          172, 238, 238, 0, 0, 14, 110, 106, 0, 0, 0, 126, 30, 30, 30, 110, 106, 0,
        ],
        rules: {
          kind: 'thermo',
          paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        },
        step: {
          kind: 'placement',
          technique: 'thermo-bound',
          evidence: {
            constraintId: 'thermo:0',
            cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'thermo',
            path: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            bounds: [
              {
                cell: 0,
                min: 1,
                max: 1,
              },
              {
                cell: 1,
                min: 2,
                max: 2,
              },
              {
                cell: 2,
                min: 3,
                max: 3,
              },
              {
                cell: 3,
                min: 4,
                max: 4,
              },
              {
                cell: 4,
                min: 5,
                max: 5,
              },
              {
                cell: 5,
                min: 6,
                max: 6,
              },
              {
                cell: 6,
                min: 7,
                max: 7,
              },
              {
                cell: 7,
                min: 8,
                max: 8,
              },
              {
                cell: 8,
                min: 9,
                max: 9,
              },
            ],
          },
          cell: 1,
          digit: 2,
        },
      },
    ],
    'thermo-combined': [
      {
        board: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 9, 0, 0, 0, 0, 0, 0, 2, 0, 0,
          0, 6, 7, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 6, 7, 8,
          0, 0, 0, 0, 0, 0, 9, 1, 0, 0, 0, 5, 9, 1, 0, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          189, 190, 191, 95, 286, 318, 495, 507, 366, 61, 62, 63, 95, 0, 318, 367, 379, 366, 0, 190,
          0, 31, 30, 62, 175, 187, 46, 0, 412, 156, 28, 0, 0, 392, 392, 0, 56, 376, 120, 0, 282, 0,
          362, 0, 362, 173, 492, 237, 14, 270, 270, 0, 490, 362, 28, 30, 30, 0, 0, 0, 271, 267, 270,
          172, 238, 238, 0, 0, 14, 110, 106, 0, 0, 0, 126, 30, 30, 30, 110, 106, 0,
        ],
        rules: {
          kind: 'thermo',
          paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        },
        step: {
          kind: 'placement',
          technique: 'thermo-bound',
          evidence: {
            constraintId: 'thermo:0',
            cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'thermo',
            path: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            bounds: [
              {
                cell: 0,
                min: 1,
                max: 1,
              },
              {
                cell: 1,
                min: 2,
                max: 2,
              },
              {
                cell: 2,
                min: 3,
                max: 3,
              },
              {
                cell: 3,
                min: 4,
                max: 4,
              },
              {
                cell: 4,
                min: 5,
                max: 5,
              },
              {
                cell: 5,
                min: 6,
                max: 6,
              },
              {
                cell: 6,
                min: 7,
                max: 7,
              },
              {
                cell: 7,
                min: 8,
                max: 8,
              },
              {
                cell: 8,
                min: 9,
                max: 9,
              },
            ],
          },
          cell: 0,
          digit: 1,
        },
      },
      {
        board: [
          1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 9, 0, 0, 0, 0, 0, 0, 2, 0, 0,
          0, 6, 7, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 6, 7, 8,
          0, 0, 0, 0, 0, 0, 9, 1, 0, 0, 0, 5, 9, 1, 0, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 190, 190, 94, 286, 318, 494, 506, 366, 60, 62, 62, 95, 0, 318, 367, 379, 366, 0, 190,
          0, 31, 30, 62, 175, 187, 46, 0, 412, 156, 28, 0, 0, 392, 392, 0, 56, 376, 120, 0, 282, 0,
          362, 0, 362, 172, 492, 237, 14, 270, 270, 0, 490, 362, 28, 30, 30, 0, 0, 0, 271, 267, 270,
          172, 238, 238, 0, 0, 14, 110, 106, 0, 0, 0, 126, 30, 30, 30, 110, 106, 0,
        ],
        rules: {
          kind: 'thermo',
          paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        },
        step: {
          kind: 'placement',
          technique: 'hidden-single',
          cell: 47,
          digit: 1,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 5,
            },
            cells: [47],
            digits: [1],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 5,
              },
              {
                kind: 'column',
                index: 2,
              },
              {
                kind: 'box',
                index: 3,
              },
            ],
          },
        },
      },
      {
        board: [
          1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 9, 0, 0, 0, 0, 0, 0, 2, 0, 0,
          0, 6, 7, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 3, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0, 6, 7, 8,
          0, 0, 0, 0, 0, 0, 9, 1, 0, 0, 0, 5, 9, 1, 0, 0, 0, 0, 0, 0, 8,
        ],
        candidates: [
          0, 190, 190, 94, 286, 318, 494, 506, 366, 60, 62, 62, 95, 0, 318, 367, 379, 366, 0, 190,
          0, 31, 30, 62, 175, 187, 46, 0, 412, 156, 28, 0, 0, 392, 392, 0, 56, 376, 120, 0, 282, 0,
          362, 0, 362, 172, 492, 0, 14, 270, 270, 0, 490, 362, 28, 30, 30, 0, 0, 0, 271, 267, 270,
          172, 238, 238, 0, 0, 14, 110, 106, 0, 0, 0, 126, 30, 30, 30, 110, 106, 0,
        ],
        rules: {
          kind: 'thermo',
          paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        },
        step: {
          kind: 'placement',
          technique: 'thermo-bound',
          evidence: {
            constraintId: 'thermo:0',
            cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'thermo',
            path: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            bounds: [
              {
                cell: 0,
                min: 1,
                max: 1,
              },
              {
                cell: 1,
                min: 2,
                max: 2,
              },
              {
                cell: 2,
                min: 3,
                max: 3,
              },
              {
                cell: 3,
                min: 4,
                max: 4,
              },
              {
                cell: 4,
                min: 5,
                max: 5,
              },
              {
                cell: 5,
                min: 6,
                max: 6,
              },
              {
                cell: 6,
                min: 7,
                max: 7,
              },
              {
                cell: 7,
                min: 8,
                max: 8,
              },
              {
                cell: 8,
                min: 9,
                max: 9,
              },
            ],
          },
          cell: 1,
          digit: 2,
        },
      },
    ],
    'arrow-equations': [ARROW_CIRCLE_EXAMPLE],
    'arrow-combinations': [
      {
        board: [
          5, 0, 0, 2, 0, 0, 3, 4, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0, 6, 5, 0,
          7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 4, 1, 0, 9, 6, 5, 0, 8, 0, 0, 2, 5, 4, 8, 0,
          0, 0, 0, 0, 0, 6, 1, 0, 2, 0, 0, 0, 9, 4, 1, 5, 3, 0, 8, 0, 2,
        ],
        candidates: [
          0, 480, 448, 0, 321, 449, 0, 0, 480, 0, 480, 456, 164, 344, 460, 336, 0, 496, 0, 0, 456,
          160, 344, 456, 337, 369, 496, 0, 0, 390, 0, 10, 140, 266, 260, 0, 192, 448, 454, 132, 11,
          141, 0, 340, 348, 0, 0, 70, 0, 0, 0, 66, 0, 68, 68, 0, 0, 0, 0, 352, 321, 357, 356, 196,
          192, 0, 0, 320, 0, 344, 340, 348, 0, 0, 0, 0, 0, 96, 0, 96, 0,
        ],
        rules: {
          kind: 'arrow',
          arrows: [
            {
              circle: 8,
              shaft: [16, 24, 32, 40],
            },
          ],
        },
        step: {
          kind: 'placement',
          technique: 'arrow-combination',
          evidence: {
            constraintId: 'arrow:0',
            cells: [8, 16, 24, 32, 40],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'arrow',
            circle: 8,
            shaft: [16, 24, 32, 40],
            domains: [
              {
                cell: 8,
                mask: 480,
              },
              {
                cell: 16,
                mask: 2,
              },
              {
                cell: 24,
                mask: 337,
              },
              {
                cell: 32,
                mask: 140,
              },
              {
                cell: 40,
                mask: 11,
              },
            ],
          },
          cell: 24,
          digit: 1,
        },
      },
    ],
    'arrow-combined': [
      {
        board: [
          5, 0, 0, 2, 0, 0, 3, 4, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0, 6, 5, 0,
          7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 4, 1, 0, 9, 6, 5, 0, 8, 0, 0, 2, 5, 4, 8, 0,
          0, 0, 0, 0, 0, 6, 1, 0, 2, 0, 0, 0, 9, 4, 1, 5, 3, 0, 8, 0, 2,
        ],
        candidates: [
          0, 480, 448, 0, 321, 449, 0, 0, 480, 0, 480, 456, 164, 344, 460, 336, 0, 496, 0, 0, 456,
          160, 344, 456, 337, 369, 496, 0, 0, 390, 0, 10, 140, 266, 260, 0, 192, 448, 454, 132, 11,
          141, 0, 340, 348, 0, 0, 70, 0, 0, 0, 66, 0, 68, 68, 0, 0, 0, 0, 352, 321, 357, 356, 196,
          192, 0, 0, 320, 0, 344, 340, 348, 0, 0, 0, 0, 0, 96, 0, 96, 0,
        ],
        rules: {
          kind: 'arrow',
          arrows: [
            {
              circle: 8,
              shaft: [16, 24, 32, 40],
            },
          ],
        },
        step: {
          kind: 'placement',
          technique: 'arrow-combination',
          evidence: {
            constraintId: 'arrow:0',
            cells: [8, 16, 24, 32, 40],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'arrow',
            circle: 8,
            shaft: [16, 24, 32, 40],
            domains: [
              {
                cell: 8,
                mask: 480,
              },
              {
                cell: 16,
                mask: 2,
              },
              {
                cell: 24,
                mask: 337,
              },
              {
                cell: 32,
                mask: 140,
              },
              {
                cell: 40,
                mask: 11,
              },
            ],
          },
          cell: 24,
          digit: 1,
        },
      },
      {
        board: [
          5, 0, 0, 2, 0, 0, 3, 4, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 2, 3, 0, 0, 0, 0, 1, 0, 0, 6, 5, 0,
          7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 4, 1, 0, 9, 6, 5, 0, 8, 0, 0, 2, 5, 4, 8, 0,
          0, 0, 0, 0, 0, 6, 1, 0, 2, 0, 0, 0, 9, 4, 1, 5, 3, 0, 8, 0, 2,
        ],
        candidates: [
          0, 480, 448, 0, 321, 449, 0, 0, 480, 0, 480, 456, 164, 344, 460, 336, 0, 496, 0, 0, 456,
          160, 344, 456, 0, 368, 496, 0, 0, 390, 0, 10, 140, 266, 260, 0, 192, 448, 454, 132, 11,
          141, 0, 340, 348, 0, 0, 70, 0, 0, 0, 66, 0, 68, 68, 0, 0, 0, 0, 352, 320, 357, 356, 196,
          192, 0, 0, 320, 0, 344, 340, 348, 0, 0, 0, 0, 0, 96, 0, 96, 0,
        ],
        rules: {
          kind: 'arrow',
          arrows: [
            {
              circle: 8,
              shaft: [16, 24, 32, 40],
            },
          ],
        },
        step: {
          kind: 'placement',
          technique: 'hidden-single',
          cell: 61,
          digit: 1,
          evidence: {
            kind: 'unit',
            unit: {
              kind: 'row',
              index: 6,
            },
            cells: [61],
            digits: [1],
            premises: [],
            units: [
              {
                kind: 'row',
                index: 6,
              },
              {
                kind: 'column',
                index: 7,
              },
              {
                kind: 'box',
                index: 8,
              },
            ],
          },
        },
      },
      {
        board: [
          5, 0, 0, 2, 0, 0, 3, 4, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 2, 3, 0, 0, 0, 0, 1, 0, 0, 6, 5, 0,
          7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 4, 1, 0, 9, 6, 5, 0, 8, 0, 0, 2, 5, 4, 8, 0,
          0, 1, 0, 0, 0, 6, 1, 0, 2, 0, 0, 0, 9, 4, 1, 5, 3, 0, 8, 0, 2,
        ],
        candidates: [
          0, 480, 448, 0, 321, 449, 0, 0, 480, 0, 480, 456, 164, 344, 460, 336, 0, 496, 0, 0, 456,
          160, 344, 456, 0, 368, 496, 0, 0, 390, 0, 10, 140, 266, 260, 0, 192, 448, 454, 132, 11,
          141, 0, 340, 348, 0, 0, 70, 0, 0, 0, 66, 0, 68, 68, 0, 0, 0, 0, 352, 320, 0, 356, 196,
          192, 0, 0, 320, 0, 344, 340, 348, 0, 0, 0, 0, 0, 96, 0, 96, 0,
        ],
        rules: {
          kind: 'arrow',
          arrows: [
            {
              circle: 8,
              shaft: [16, 24, 32, 40],
            },
          ],
        },
        step: {
          kind: 'elimination',
          technique: 'arrow-combination',
          evidence: {
            constraintId: 'arrow:0',
            cells: [8, 16, 24, 32, 40],
            digits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            kind: 'arrow',
            circle: 8,
            shaft: [16, 24, 32, 40],
            domains: [
              {
                cell: 8,
                mask: 480,
              },
              {
                cell: 16,
                mask: 2,
              },
              {
                cell: 24,
                mask: 1,
              },
              {
                cell: 32,
                mask: 140,
              },
              {
                cell: 40,
                mask: 11,
              },
            ],
          },
          removals: [
            {
              cell: 8,
              digit: 6,
            },
            {
              cell: 32,
              digit: 8,
            },
            {
              cell: 40,
              digit: 4,
            },
          ],
        },
      },
    ],
  } satisfies Record<string, readonly ExerciseStage[]>
}
