/**
 * Image — their archetype A: your own work tiled edge to edge, with the composer
 * floating over it. Nothing between you and the last thing you made.
 *
 * The feed is the reference app's justified rows (JustifiedFeed.tsx), newest first, left to right:
 * jobs in flight take the head of row 1 in their own shape the moment you press Generate,
 * then become the result in place; failures stay where they happened in time. Any tile
 * opens the viewer. The feed renders a page at a time as you scroll (incremental.tsx).
 * Filter and View float top-right over it, as on the reference app (FeedBar.tsx): models, dates,
 * Hide failed, Liked only, and the card size (the rows' height).
 */
import { ImageIcon, ListFilter } from 'lucide-react'
import { Composer } from '../Composer.tsx'
import { isDone, recentFailures, useHistory } from '../api.ts'
import { FeedBar, useFeedPrefs } from '../FeedBar.tsx'
import { activeFilters, clearFilters, feedDefaults, showFailure, showJob, showResult } from '../feed.ts'
import { hiddenFailures, isActive, useJobs } from '../jobs.ts'
import { feedOrder } from '../justified.ts'
import { JustifiedFeed } from '../JustifiedFeed.tsx'
import { Empty } from '../parts.tsx'
import { openViewer } from '../viewer.ts'

export function ImageSurface() {
  const { items } = useHistory('image')
  const all = useJobs()
  const [prefs, setPrefs] = useFeedPrefs('image', feedDefaults('image', true))
  const queued = all.filter((j) => j.category === 'image' && j.meta.surface === 'image' && (isActive(j) || j.status === 'error'))
  const jobs = queued.filter((j) => showJob(j, prefs))
  // Newest first, as on screen, so the viewer's arrows walk the feed's order.
  const done = (items ?? []).filter((i) => isDone(i) && showResult(i, prefs)).sort((a, b) => b.createdAt - a.createdAt)
  // Hidden: failures a live tile already shows, and ones already retried or dismissed.
  const failed = recentFailures(items, hiddenFailures(all)).filter((i) => showFailure(i, prefs))
  const order = feedOrder({ jobs, failed, done })
  const loading = items === null && !queued.length
  const nothing = !done.length && !jobs.length && !failed.length
  const filteredOut = !loading && nothing && activeFilters(prefs) > 0 && Boolean(items?.length || queued.length)
  const empty = !loading && nothing && !filteredOut
  return (
    <>
      <div className="st-feed">
        {!loading && !empty && <FeedBar prefs={prefs} onChange={setPrefs} items={items ?? []} floating />}
        {!loading && !nothing && <JustifiedFeed pending={order.pending} timeline={order.timeline} size={prefs.size} onOpen={(it) => openViewer(it, done)} />}
        {filteredOut && (
          <div style={{ maxWidth: 560, margin: '12vh auto 0' }}>
            <Empty
              icon={ListFilter}
              title="Nothing matches the filter"
              sub="Widen the models, the dates or the toggles to see the rest."
              cta={
                <button type="button" className="vw-btn is-sm" onClick={() => setPrefs(clearFilters(prefs))}>
                  Clear filters
                </button>
              }
            />
          </div>
        )}
        {empty && (
          <div style={{ maxWidth: 560, margin: '12vh auto 0' }}>
            <Empty icon={ImageIcon} title="Nothing made yet" sub="Whatever you generate lands here, newest first. The bar below stays put while you scroll." />
          </div>
        )}
      </div>
      <Composer surface="image" category="image" klass="image" placeholder="Describe the image…" />
    </>
  )
}
