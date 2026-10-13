<script setup lang="ts">
import { computed } from 'vue'
import type { BoardGeometry, BoardEdge } from '@/shared/model/boardGeometry'
import { getCageOutline } from '@/shared/model/boardGeometry'

const props = defineProps<{ geometry: BoardGeometry; obscured: boolean }>()

function center(cell: number) {
  return { x: (cell % 9) + 0.5, y: Math.floor(cell / 9) + 0.5 }
}

function path(cells: readonly number[]): string {
  return cells
    .map((cell, index) => {
      const point = center(cell)

      return `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`
    })
    .join(' ')
}

function edgePath(edge: BoardEdge): string {
  const x = edge.cell % 9
  const y = Math.floor(edge.cell / 9)
  switch (edge.edge) {
    case 'top':
      return `M${x},${y}H${x + 1}`
    case 'bottom':
      return `M${x},${y + 1}H${x + 1}`
    case 'left':
      return `M${x},${y}V${y + 1}`
    case 'right':
      return `M${x + 1},${y}V${y + 1}`
  }
}

function arrowPath(circle: number, shaft: readonly number[]): string {
  const start = center(circle)
  const next = center(shaft[0])
  const distance = Math.hypot(next.x - start.x, next.y - start.y)

  return `M${start.x + ((next.x - start.x) * 0.34) / distance},${start.y + ((next.y - start.y) * 0.34) / distance} ${shaft
    .map((cell) => {
      const point = center(cell)

      return `L${point.x},${point.y}`
    })
    .join(' ')}`
}

function arrowHead(circle: number, shaft: readonly number[]): string {
  const tip = center(shaft.at(-1) ?? circle)
  const before = center(shaft.at(-2) ?? circle)
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x)
  const length = 0.22
  const points = [angle - Math.PI / 5, angle + Math.PI / 5].map((direction) => ({
    x: tip.x - length * Math.cos(direction),
    y: tip.y - length * Math.sin(direction),
  }))

  return `M${points[0].x},${points[0].y}L${tip.x},${tip.y}L${points[1].x},${points[1].y}`
}

const drawings = computed(() =>
  props.geometry.clues.map((clue) => {
    if (clue.kind === 'cage') {
      return {
        ...clue,
        outline: getCageOutline(clue.cells),
        x: (clue.anchor % 9) + 0.16,
        y: Math.floor(clue.anchor / 9) + 0.25,
      }
    }

    if (clue.kind === 'arrow') {
      return {
        ...clue,
        point: center(clue.circle),
        path: arrowPath(clue.circle, clue.shaft),
        head: arrowHead(clue.circle, clue.shaft),
      }
    }

    return { ...clue, path: path(clue.cells), point: center(clue.cells[0]) }
  }),
)
const boundaries = computed(() => props.geometry.boundaries.map(edgePath))
</script>
<template>
  <svg
    v-if="!obscured"
    class="sudoku-clues"
    viewBox="0 0 9 9"
    aria-hidden="true"
    focusable="false"
    style="pointer-events: none"
  >
    <path
      v-for="(boundary, index) in boundaries"
      :key="`region-${index}`"
      :d="boundary"
      class="region"
    />
    <g v-for="(clue, index) in drawings" :key="index" :data-clue="clue.kind">
      <template v-if="clue.kind === 'cage'">
        <path :d="clue.outline" class="cage" />
        <text :x="clue.x" :y="clue.y" class="sum">{{ clue.sum }}</text>
      </template>
      <template v-else-if="clue.kind === 'thermo'">
        <path :d="clue.path" class="thermo" />
        <circle :cx="clue.point.x" :cy="clue.point.y" r="0.32" class="bulb" />
      </template>
      <template v-else-if="clue.kind === 'arrow'">
        <circle :cx="clue.point.x" :cy="clue.point.y" r="0.34" class="arrow" />
        <path :d="clue.path" class="arrow" />
        <path :d="clue.head" class="arrow" />
      </template>
      <path v-else :d="clue.path" class="diagonal" />
    </g>
  </svg>
</template>
<style scoped>
.sudoku-clues {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  fill: none;
}
.region {
  stroke: var(--text);
  stroke-width: 0.055;
}
.cage {
  stroke: var(--clue-stroke);
  stroke-width: 0.024;
  stroke-dasharray: 0.07 0.05;
}
.sum {
  fill: var(--text);
  stroke: var(--surface);
  stroke-width: 0.08;
  paint-order: stroke;
  font-size: 0.26px;
  font-weight: 650;
}
.thermo {
  stroke: var(--clue-fill);
  stroke-width: 0.24;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.bulb {
  fill: var(--clue-fill);
}
.arrow {
  stroke: var(--clue-stroke);
  stroke-width: 0.05;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.diagonal {
  stroke: var(--clue-fill);
  stroke-width: 0.12;
  stroke-dasharray: 0.15 0.09;
}
</style>
