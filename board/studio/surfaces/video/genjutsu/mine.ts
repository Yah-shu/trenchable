/**
 * Which history items are GenShitSu's, live. GenShitSu's History shows only these and Video's
 * shows everything else (each lane keeps its own clips; both still land in Assets). A job is GenShitSu's by its tracked tag (genjutsu.ts), recorded a moment after
 * Generate — well before the clip is done — so the filters follow the tags as they are written.
 */
import { useMemo } from 'react'
import type { HistoryItem } from '../../../api.ts'
import { useAllTracked } from '../../track.ts'
import { genjutsuTasks, isGenjutsuItem } from './genjutsu.ts'

export interface GenjutsuFilters {
  /** GenShitSu's History. */
  mine: (item: HistoryItem) => boolean
  /** Video's History. */
  notMine: (item: HistoryItem) => boolean
}

export function useGenjutsuFilters(): GenjutsuFilters {
  const tracked = useAllTracked()
  return useMemo(() => {
    const tasks = genjutsuTasks(tracked)
    return { mine: (i) => isGenjutsuItem(i, tasks), notMine: (i) => !isGenjutsuItem(i, tasks) }
  }, [tracked])
}

/** Video's History filter: every clip but GenShitSu's. */
export const useVideoFeed = () => useGenjutsuFilters().notMine
