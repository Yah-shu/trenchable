import type { Transition } from 'motion/react'

/** Critically damped UI spring — bounce 0 (emil / apple / DESIGN.md) */
export const springUi: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.28,
}

/** Flick / momentum only — still restrained */
export const springMomentum: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.28,
}

export const springSnappy: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.2,
}

export const fadeQuick: Transition = {
  type: 'tween',
  duration: 0.15,
  ease: 'easeOut',
}

/** Apple projection: resting distance from release velocity */
export function project(
  initialVelocity: number,
  decelerationRate = 0.998,
): number {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  )
}
