/**
 * Canvas — the reference app's node board, where generations chain.
 *
 * A prompt and pictures feed a generator; its result feeds an upscaler, a video or an
 * output card. The rules (what connects, what reaches a node, run order, saving) are in
 * canvas/graph.ts, running in canvas/run.ts, the cards in canvas/nodes.tsx. This file
 * draws the active board (the boards themselves live in canvas/store.ts, so a run keeps
 * its board while you are on another lane), the top bar, and the one effect that copies
 * finished jobs' results onto their nodes — so a result survives a reload, and a job
 * that was lost with the page says so instead of spinning forever.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react'
import { Check, Pencil, Play, Plus, Square, Trash2, Workflow, X } from 'lucide-react'
import { firstMedia, isDone, useCatalog, useHistory } from '../api.ts'
import { familiesOf } from '../families.ts'
import { isActive, useJobs } from '../jobs.ts'
import {
  checkConnection,
  connect,
  edgeKind,
  isRunnable,
  makeNode,
  newBoard,
  removeNodes,
  TITLES,
  uniqueName,
  type CanvasEdge,
  type CanvasNode,
  type Connection,
  type NodeData,
  type NodeType,
} from './canvas/graph.ts'
import { CanvasContext, ICONS, jobFor, nodeTypes, type CanvasApi } from './canvas/nodes.tsx'
import { outputFromJob, runAll, runNode, runPlan, type RunEnv } from './canvas/run.ts'
import { askStop, flush, getBoard, patchNode, setRunAll, setSending, stopRequested, updateBoard, updateBoards, useCanvasStore } from './canvas/store.ts'
import './canvas/canvas.css'

const ADDABLE: NodeType[] = ['prompt', 'image', 'genImage', 'genVideo', 'upscale', 'output']

function Inner() {
  const { boards: state, saveFailed, sending, runAll: runAllState } = useCanvasStore()
  const board = state.boards.find((b) => b.id === state.activeId) ?? state.boards[0]!
  const { models } = useCatalog()
  const { items: history } = useHistory()
  const jobs = useJobs()
  const flow = useReactFlow()
  const box = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const added = useRef(0)

  // Leaving the surface writes whatever the save debounce still holds.
  useEffect(() => () => flush(), [])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), notice.bad ? 9000 : 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  const families = useMemo(() => {
    const all = models ?? []
    return { image: familiesOf(all.filter((m) => m.category === 'image')), video: familiesOf(all.filter((m) => m.category === 'video')) }
  }, [models])

  /** A run is bound to the board it started on, even if you switch boards meanwhile. */
  const envFor = useCallback(
    (boardId: string): RunEnv => ({
      models,
      board: () => getBoard(boardId) ?? { id: boardId, name: '', nodes: [], edges: [], updatedAt: 0 },
      patch: (nodeId, data) => patchNode(boardId, nodeId, data),
      sending: setSending,
    }),
    [models],
  )

  const run = useCallback((nodeId: string) => void runNode(envFor(board.id), nodeId), [board.id, envFor])

  const startRunAll = () => {
    const plan = runPlan(board)
    if ('error' in plan) {
      setNotice({ text: plan.error, bad: true })
      return
    }
    const n = plan.ids.length
    if (!window.confirm(`Run all sends ${n} generation${n === 1 ? '' : 's'} to Kie, in order — this spends credits. Go ahead?`)) return
    const boardId = board.id
    setRunAll({ boardId, line: 'Starting…' })
    void runAll(envFor(boardId), { stopped: stopRequested, progress: (line) => setRunAll({ boardId, line }) })
      .then((err) => setNotice(err ? { text: err, bad: !err.startsWith('Stopped.') } : { text: 'Run all finished.' }))
      .catch((e: unknown) => setNotice({ text: `Run all stopped: ${(e as Error).message}`, bad: true }))
      .finally(() => setRunAll(null))
  }

  // Finished jobs → their nodes' outputs. Also adopts a resumed job's new local id, and
  // after a reload picks up results that landed in history while the page was away.
  useEffect(() => {
    for (const b of state.boards) {
      for (const n of b.nodes) {
        if (!isRunnable(n.type)) continue
        const d = n.data
        if (!d.jobId && !d.taskId) continue
        const job = jobFor(jobs, d)
        const next: Partial<NodeData> = {}
        if (job) {
          if (job.id !== d.jobId) next.jobId = job.id
          if (job.taskId && job.taskId !== d.taskId) next.taskId = job.taskId
          if (job.status === 'done' && !d.output) {
            const out = outputFromJob(job)
            if (out) next.output = out
          }
        }
        // History has the result too once it lands — archived on disk, so it never expires.
        // Take it when the node has nothing yet (finished while the page was away) or only
        // the provider's URL.
        const taskId = next.taskId ?? d.taskId
        const item = taskId && history ? history.find((i) => i.taskId === taskId) : undefined
        const url = item && isDone(item) ? firstMedia(item) : undefined
        const have = next.output ?? d.output
        if (item && url && (!job || job.status === 'done') && (!have || (item.media?.[0]?.localPath && have.url !== url))) {
          next.output = { url, kind: item.category === 'video' ? 'video' : 'image', media: item.media?.[0] }
        }
        if (Object.keys(next).length) patchNode(b.id, n.id, next)
      }
    }
  }, [jobs, history, state.boards])

  /* ---------- xyflow wiring ---------- */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      updateBoard(board.id, (b) => {
        const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id)
        const nodes = applyNodeChanges(changes, b.nodes as Node[]) as unknown as CanvasNode[]
        return removed.length ? removeNodes({ ...b, nodes }, removed) : { ...b, nodes }
      }),
    [board.id],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => updateBoard(board.id, (b) => ({ ...b, edges: applyEdgeChanges(changes, b.edges as Edge[]) as unknown as CanvasEdge[] })),
    [board.id],
  )

  const current = () => getBoard(board.id) ?? board

  const onConnect = (c: FlowConnection) => {
    const b = current()
    const res = connect(b.nodes, b.edges, c)
    if (res.error) setNotice({ text: res.error, bad: true })
    else updateBoard(b.id, (x) => ({ ...x, edges: res.edges }))
  }

  const isValidConnection = (c: FlowConnection | Edge) => checkConnection(board.nodes, board.edges, c) === null

  // Dropping a wire on a handle that refuses it: say why, instead of nothing happening.
  const onConnectEnd: OnConnectEnd = (_, s) => {
    if (s.isValid !== false || !s.fromHandle || !s.toHandle) return
    const [a, z] = s.fromHandle.type === 'source' ? [s.fromHandle, s.toHandle] : [s.toHandle, s.fromHandle]
    const c: Connection = { source: a.nodeId, sourceHandle: a.id ?? null, target: z.nodeId, targetHandle: z.id ?? null }
    const why = checkConnection(board.nodes, board.edges, c)
    if (why) setNotice({ text: why, bad: true })
  }

  const flowEdges = useMemo(
    () =>
      board.edges.map((e) => {
        const src = board.nodes.find((n) => n.id === e.source)
        const job = src && isRunnable(src.type) ? jobFor(jobs, src.data) : undefined
        return { ...e, className: `cv-edge is-${edgeKind(board.nodes, e) ?? 'image'}`, animated: Boolean(job && isActive(job)) }
      }),
    [board.edges, board.nodes, jobs],
  )

  /* ---------- boards and nodes ---------- */

  const addNode = (type: NodeType) => {
    const rect = box.current?.getBoundingClientRect()
    const centre = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 }
    const step = (added.current++ % 6) * 28
    const node = makeNode(type, { x: centre.x - 132 + step, y: centre.y - 80 + step })
    updateBoard(board.id, (b) => ({ ...b, nodes: [...b.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }] }))
  }

  const newOne = () => {
    const b = newBoard(uniqueName(state.boards, `Board ${state.boards.length + 1}`))
    updateBoards((s) => ({ ...s, activeId: b.id, boards: [...s.boards, b] }))
  }

  const switchTo = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    updateBoards((s) => (s.boards.some((b) => b.id === id) ? { ...s, activeId: id } : s))
  }

  const finishRename = () => {
    const name = renaming?.trim()
    setRenaming(null)
    if (name) updateBoard(board.id, (b) => (b.name === name ? b : { ...b, name }))
  }

  const deleteBoard = () => {
    if (!window.confirm(`Delete the board “${board.name}”? Its results stay in your history.`)) return
    updateBoards((s) => {
      const rest = s.boards.filter((b) => b.id !== board.id)
      if (!rest.length) {
        const fresh = newBoard('Board 1')
        return { ...s, activeId: fresh.id, boards: [fresh] }
      }
      return { ...s, activeId: rest[0]!.id, boards: rest }
    })
  }

  const api: CanvasApi = {
    board,
    jobs,
    history,
    models,
    families,
    sending,
    patch: (nodeId, data) => patchNode(board.id, nodeId, data),
    remove: (nodeId) => updateBoard(board.id, (b) => removeNodes(b, [nodeId])),
    run,
  }

  const runAllLine = runAllState?.line ?? null
  const runningAll = runAllState !== null

  return (
    <div className="cv-root">
      <div className="cv-bar">
        <div className="cv-bar-group">
          <Workflow size={16} aria-hidden />
          <span className="cv-bar-title">Canvas</span>
          {renaming !== null ? (
            <>
              <input
                className="studio-input cv-board-name"
                value={renaming}
                autoFocus
                aria-label="Board name"
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={finishRename}
              />
              <button type="button" className="st-pill is-icon" title="Save name" aria-label="Save name" onMouseDown={(e) => e.preventDefault()} onClick={finishRename}>
                <Check size={14} />
              </button>
            </>
          ) : (
            <>
              <select className="studio-input cv-board-select" value={board.id} onChange={switchTo} aria-label="Board">
                {state.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button type="button" className="st-pill is-icon" title="Rename board" aria-label="Rename board" onClick={() => setRenaming(board.name)}>
                <Pencil size={14} />
              </button>
            </>
          )}
          <button type="button" className="st-pill" onClick={newOne}>
            <Plus size={14} /> New board
          </button>
          <button type="button" className="st-pill is-icon" title="Delete board" aria-label="Delete board" onClick={deleteBoard}>
            <Trash2 size={14} />
          </button>
        </div>
        <span className="cv-bar-sep" />
        <div className="cv-bar-group">
          <span className="cv-bar-label">Add</span>
          {ADDABLE.map((t) => {
            const Icon = ICONS[t]
            return (
              <button key={t} type="button" className="st-pill" onClick={() => addNode(t)} title={`Add a node: ${TITLES[t]}`}>
                <Icon size={14} /> {TITLES[t]}
              </button>
            )
          })}
        </div>
        <span className="cv-bar-spacer" />
        <div className="cv-bar-group">
          {runningAll ? (
            <>
              <span className="cv-progress">
                {runAllState.boardId !== board.id ? `${state.boards.find((b) => b.id === runAllState.boardId)?.name ?? 'Another board'}: ` : ''}
                {runAllLine}
              </span>
              <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost" onClick={askStop}>
                <span className="plinth-btn__face">
                  <Square className="plinth-btn__icon" aria-hidden />
                  <span className="plinth-btn__label">Stop</span>
                </span>
              </button>
            </>
          ) : (
            <button type="button" className="plinth-btn plinth-btn--sm" onClick={startRunAll}>
              <span className="plinth-btn__face">
                <Play className="plinth-btn__icon" aria-hidden />
                <span className="plinth-btn__label">Run all</span>
              </span>
            </button>
          )}
        </div>
      </div>
      {saveFailed ? <div className="cv-notice is-bad">This browser won’t save boards right now — changes last until you reload.</div> : null}
      {notice ? (
        <div className={`cv-notice${notice.bad ? ' is-bad' : ''}`} role="status">
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={13} />
          </button>
        </div>
      ) : null}
      <div className="cv-flow" ref={box}>
        <CanvasContext.Provider value={api}>
          <ReactFlow
            key={board.id}
            nodes={board.nodes as Node[]}
            edges={flowEdges as Edge[]}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={2}
            colorMode="light"
            attributionPosition="bottom-right"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={2} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={3} />
          </ReactFlow>
        </CanvasContext.Provider>
      </div>
    </div>
  )
}

export function CanvasSurface() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  )
}
