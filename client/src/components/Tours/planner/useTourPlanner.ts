import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hikingPreferencesOf, paddleSpeedKmhSchema, tourWebsiteSchema, type HikingPreferences, type PlannableTourType, type TourCreateResponse, type TourFixedLeg, type TourListItem, type TourMaxHikingDifficulty } from '@trek/shared'
import { paddleRouteRepo } from '../../../repo/paddleRouteRepo'
import { tourRepo } from '../../../repo/tourRepo'
import { randomId } from '../../../utils/randomId'
import { analyzeRouteGeometry, type RouteProfileFocus } from '../../../utils/routeGeometry'
import { enrichTourElevations, routeWalkingTour, type TourElevationPoint, type TourRoutePart } from './tourRouting'
import { closeLoop, isClosedLoop, reverseRoute, toggleFreeLeg, withPointAppended } from './tourRouteActions'
import { normalizePlannerWaypoints, plannerWaypointsOf, sameWaypointSnapshot, savedWaypointsOf, tourWaypointKey, unlinkedPoint, type TourPlannerWaypoint } from './tourPlannerWaypoints'
import { tourPlannerFacts } from './tourPlannerFacts'
import { usePlannerHistory } from './usePlannerHistory'
import { useTourDraftStorage } from './useTourDraftStorage'
import { useTourRevisionGuard } from './useTourRevisionGuard'
import { useRouteShaping } from './useRouteShaping'
import { useTourMapView } from './useTourMapView'
import type { DraftPayload } from './tourPlannerDraft'
import { paddleEstimateOf } from './paddlePlanOf'
import { adoptChangedPoints, planPaddleStep, type PaddleTourRoute } from './paddleRouting'
import { NO_PADDLE_FIELDS, paddleFieldsOf, usePaddleFields, type PaddleFieldValues } from './usePaddleFields'
import { useTourPermissions, type TourPermissionProps } from '../useTourPermissions'

/** What a tour planned from an import starts with. */
export interface DerivedTourDraft {
  name: string
  description?: string | null
  website?: string | null
  difficulty: TourMaxHikingDifficulty
  points: Array<{ lat: number; lng: number }>
  /** The import the points were taken from. */
  sourcePlaceId: number
  /**
   * Plan the import over in place, keeping its id, days and notes (the server
   * keeps the recorded track to go back to), rather than as a new tour beside it.
   */
  inPlace: boolean
  /** P2C-03: the import's revision, which a save planned over in place names. */
  revision?: number
  /** A paddle import stays a paddle tour, with its boat and water. */
  tourType?: PlannableTourType
  paddle?: PaddleFieldValues
}

export type TourPlannerStatus =
  | 'empty'
  | 'dirty'
  | 'routing'
  | 'routing-failed'
  | 'enriching-elevation'
  | 'elevation-failed'
  | 'ready'
  | 'saving'
  | 'saved'

/** One step of the history: the route, and what the route depends on. */
interface HistoryEntry { waypoints: TourPlannerWaypoint[]; difficulty: TourMaxHikingDifficulty; preferences: HikingPreferences | null; tourType: PlannableTourType }

const ROUTE_DEBOUNCE_MS = 450

function hasCompleteElevation(points: TourElevationPoint[] | null): points is [number, number, number][] {
  return !!points && points.every(point => point.length === 3 && Number.isFinite(point[2]))
}

/** Where a new tour was planned from; an edit leaves it as it was saved. */
function derivedFromField(placeId: number | null, derivedFrom: number | null): { derived_from_place_id?: number } {
  return placeId === null && derivedFrom !== null ? { derived_from_place_id: derivedFrom } : {}
}

function trimmedOrNull(value: string): string | null {
  return value.trim() || null
}

function parsedWebsiteOrNull(value: string) {
  return value.trim() ? tourWebsiteSchema.parse(value) : null
}

export interface UseTourPlannerOptions extends TourPermissionProps {
  tripId: number | string
  active?: boolean
  onSaved?: (result: TourCreateResponse) => void | Promise<void>
}

export type TourPlannerMode =
  | { type: 'neutral' }
  | { type: 'new-draft' }
  | { type: 'edit-saved'; placeId: number }
  | { type: 'view-gpx'; placeId: number; tour: TourListItem }

export function selectTourPlannerMode(state: {
  readOnlyGpxTour: { tour: TourListItem } | null
  editingPlaceId: number | null
  hasUnsavedChanges: boolean
}): TourPlannerMode {
  if (state.readOnlyGpxTour) {
    return { type: 'view-gpx', placeId: state.readOnlyGpxTour.tour.place_id, tour: state.readOnlyGpxTour.tour }
  }
  if (state.editingPlaceId !== null) return { type: 'edit-saved', placeId: state.editingPlaceId }
  if (state.hasUnsavedChanges) return { type: 'new-draft' }
  return { type: 'neutral' }
}

export function useTourPlanner({ tripId, active = true, onSaved, canEdit: editPermission, canAssign: assignPermission }: UseTourPlannerOptions) {
  const { canEdit, canAssign } = useTourPermissions({ tripId, canEdit: editPermission, canAssign: assignPermission })
  const editPermissionRef = useRef(canEdit)
  editPermissionRef.current = canEdit
  const draftStorage = useTourDraftStorage(tripId)
  const { restored, keep: keepDraft, forget: forgetDraft } = draftStorage

  const [name, setNameState] = useState(restored?.name ?? '')
  const [description, setDescriptionState] = useState(restored?.description ?? '')
  const [website, setWebsiteState] = useState(restored?.website ?? '')
  const [plannedDurationMinutes, setPlannedDurationMinutesState] = useState<number | null>(restored?.plannedDurationMinutes ?? null)
  const [breakAdditionalMinutes, setBreakAdditionalMinutesState] = useState<number | null>(restored?.breakAdditionalMinutes ?? null)
  const [waypoints, setWaypoints] = useState<TourPlannerWaypoint[]>(restored?.waypoints ?? [])
  const [maxHikingDifficulty, setMaxHikingDifficultyState] = useState<TourMaxHikingDifficulty>(restored?.maxHikingDifficulty ?? 2)
  const [hikingPreferences, setHikingPreferencesState] = useState<HikingPreferences | null>(restored?.hikingPreferences ?? null)
  const [tourType, setTourTypeState] = useState<PlannableTourType>(restored?.tourType ?? 'hike')
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(restored?.waypoints[0]?.id ?? null)
  const history = usePlannerHistory<HistoryEntry>()
  const { record: recordStep, clear: clearHistory } = history
  const revision = useTourRevisionGuard(restored?.baseRevision ?? null)
  const { adopt: adoptRevision, refuse: refuseRevision, baseRef: revisionBaseRef } = revision
  const [status, setStatus] = useState<TourPlannerStatus>(restored?.waypoints.length ? 'dirty' : 'empty')
  const [route, setRoute] = useState<[number, number][] | null>(null)
  const [routeParts, setRouteParts] = useState<TourRoutePart[] | null>(null)
  const [paddleRoute, setPaddleRoute] = useState<PaddleTourRoute | null>(null)
  const [enrichedGeometry, setEnrichedGeometry] = useState<TourElevationPoint[] | null>(null)
  const [routeForKey, setRouteForKey] = useState<string | null>(null)
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(Boolean(restored))
  const [isSaving, setIsSaving] = useState(false)
  const [draftRestored, setDraftRestored] = useState(Boolean(restored))
  const [editingPlaceId, setEditingPlaceId] = useState<number | null>(restored?.editingPlaceId ?? null)
  const [derivedFromPlaceId, setDerivedFromPlaceId] = useState<number | null>(restored?.derivedFromPlaceId ?? null)
  const [openingTourId, setOpeningTourId] = useState<number | null>(null)
  const [saveOutcome, setSaveOutcome] = useState<TourListItem | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const mapView = useTourMapView()
  const [readOnlyGpxTour, setReadOnlyGpxTour] = useState<{ tour: TourListItem; routeGeometry: string | null } | null>(null)
  const [newTourConfirmationOpen, setNewTourConfirmationOpen] = useState(false)
  const [elevationProfileExpanded, setElevationProfileExpanded] = useState(true)
  const [routeProfileFocus, setRouteProfileFocus] = useState<RouteProfileFocus | null>(null)
  const [newDraftGeneration, setNewDraftGeneration] = useState(0)
  const [mapFocusKey, setMapFocusKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const draftRevisionRef = useRef(0)
  const saveRequestIdRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const deletedTourPlaceIdsRef = useRef(new Set<number>())
  const mountedRef = useRef(false)
  const contextGenerationRef = useRef(0)
  const detailRequestIdRef = useRef(0)
  const detailAbortRef = useRef<AbortController | null>(null)
  const detailPlaceIdRef = useRef<number | null>(null)
  const activeRef = useRef(active)
  const readOnlyGpxTourRef = useRef(readOnlyGpxTour)
  const tripIdRef = useRef(tripId)
  const editingPlaceIdRef = useRef(editingPlaceId)
  activeRef.current = active
  readOnlyGpxTourRef.current = readOnlyGpxTour
  tripIdRef.current = tripId
  editingPlaceIdRef.current = editingPlaceId
  const waypointsRef = useRef(waypoints)
  const difficultyRef = useRef(maxHikingDifficulty)
  const preferencesRef = useRef(hikingPreferences)
  const tourTypeRef = useRef(tourType)
  waypointsRef.current = waypoints
  difficultyRef.current = maxHikingDifficulty
  preferencesRef.current = hikingPreferences
  const snapshot = useCallback((): HistoryEntry => ({ waypoints: waypointsRef.current, difficulty: difficultyRef.current, preferences: preferencesRef.current, tourType: tourTypeRef.current }), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      saveRequestIdRef.current += 1
      saveInFlightRef.current = false
      detailRequestIdRef.current += 1
      detailPlaceIdRef.current = null
      detailAbortRef.current?.abort()
      detailAbortRef.current = null
    }
  }, [])

  const invalidateDetailRequest = useCallback(() => {
    detailRequestIdRef.current += 1
    detailPlaceIdRef.current = null
    detailAbortRef.current?.abort()
    detailAbortRef.current = null
    if (mountedRef.current) setOpeningTourId(null)
  }, [])

  useEffect(() => {
    if (!active) invalidateDetailRequest()
  }, [active, invalidateDetailRequest])

  useEffect(() => {
    invalidateDetailRequest()
  }, [tripId, invalidateDetailRequest])

  const interruptRouting = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const commitWaypoints = useCallback((nextValue: TourPlannerWaypoint[] | ((current: TourPlannerWaypoint[]) => TourPlannerWaypoint[])) => {
    if (!editPermissionRef.current) return
    const current = waypointsRef.current
    const changed = typeof nextValue === 'function' ? nextValue(current) : nextValue
    const paddle = tourTypeRef.current === 'kayak'
    // A point the router set that the paddler moves or edits is theirs from then on.
    const next = normalizePlannerWaypoints(paddle ? adoptChangedPoints(current, changed) : changed, paddle)
    if (sameWaypointSnapshot(current, next)) return
    invalidateDetailRequest()
    interruptRouting()
    draftRevisionRef.current += 1
    recordStep(snapshot())
    waypointsRef.current = next
    setWaypoints(next)
    setHasUnsavedChanges(true)
    setSaveOutcome(null)
    setStatus('dirty')
    setError(null)
  }, [recordStep, invalidateDetailRequest, interruptRouting, snapshot])

  // Detail laid in after the step that asked for it (a portage's way on land), with no step of its own.
  const amendWaypoints = useCallback((change: (current: TourPlannerWaypoint[]) => TourPlannerWaypoint[]) => {
    if (!editPermissionRef.current || saveInFlightRef.current) return
    const changed = change(waypointsRef.current)
    if (changed === waypointsRef.current) return
    interruptRouting()
    draftRevisionRef.current += 1
    waypointsRef.current = normalizePlannerWaypoints(changed, tourTypeRef.current === 'kayak')
    setWaypoints(waypointsRef.current)
    setHasUnsavedChanges(true)
    setStatus('dirty')
  }, [interruptRouting])

  /** A hike's routing choices, its limit and its preferences (MF-08), as one step of the history; the route is planned again. */
  const setRoutingChoice = useCallback((change: { difficulty?: TourMaxHikingDifficulty; preferences?: HikingPreferences | null }) => {
    if (!editPermissionRef.current) return
    const difficulty = change.difficulty ?? difficultyRef.current
    const preferences = change.preferences === undefined ? preferencesRef.current : hikingPreferencesOf(change.preferences)
    if (difficulty === difficultyRef.current && JSON.stringify(preferences) === JSON.stringify(preferencesRef.current)) return
    invalidateDetailRequest()
    interruptRouting()
    draftRevisionRef.current += 1
    recordStep(snapshot())
    difficultyRef.current = difficulty
    preferencesRef.current = preferences
    setMaxHikingDifficultyState(difficulty)
    setHikingPreferencesState(preferences)
    setHasUnsavedChanges(true)
    setSaveOutcome(null)
    setStatus('dirty')
    setError(null)
  }, [recordStep, invalidateDetailRequest, interruptRouting, snapshot])
  const setMaxHikingDifficulty = useCallback((difficulty: TourMaxHikingDifficulty) => setRoutingChoice({ difficulty }), [setRoutingChoice])
  const setHikingPreferences = useCallback((preferences: HikingPreferences | null) => setRoutingChoice({ preferences }), [setRoutingChoice])

  const addWaypoint = useCallback((lat: number, lng: number) => {
    if (!editPermissionRef.current) return
    const id = randomId()
    commitWaypoints(current => withPointAppended<TourPlannerWaypoint>(current, { id, lat, lng, role: 'end' }))
    setSelectedWaypointId(id)
  }, [commitWaypoints])

  /**
   * A fixed leg onto the end of the tour, as one step of the history: a
   * waypoint at the line's start that carries it, and one at its end.
   */
  const appendFixedLeg = useCallback((leg: TourFixedLeg) => {
    if (!editPermissionRef.current) return
    const first = leg.geometry[0]
    const last = leg.geometry[leg.geometry.length - 1]
    if (!first || !last) return
    const startId = randomId()
    const endId = randomId()
    commitWaypoints(current => [
      ...current,
      { id: startId, lat: Number(first[0]), lng: Number(first[1]), role: 'via', fixedLeg: leg },
      { id: endId, lat: Number(last[0]), lng: Number(last[1]), role: 'end' },
    ])
    setSelectedWaypointId(endId)
  }, [commitWaypoints])

  const setWaypointPosition = useCallback((id: string, lat: number, lng: number) => {
    if (!editPermissionRef.current || saveInFlightRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
    const current = waypointsRef.current.find(point => point.id === id)
    if (!current) return false
    if (current.lat === lat && current.lng === lng) return true
    const points = waypointsRef.current
    // In a loop the start and the way back are one spot: moving either moves both.
    const loopEnds = isClosedLoop(points) && (id === points[0].id || id === points[points.length - 1].id)
      ? new Set([points[0].id, points[points.length - 1].id])
      : new Set([id])
    // A point moved stands for no place any more (PR1-10): it is where the hand put it.
    commitWaypoints(list => list.map(point => loopEnds.has(point.id) ? unlinkedPoint({ ...point, lat, lng }) : point))
    return true
  }, [commitWaypoints])

  /** PR1-01: the tour taken back from its last point to its start, as one step. */
  const returnToStart = useCallback(() => {
    if (!editPermissionRef.current || saveInFlightRef.current) return
    commitWaypoints(current => closeLoop(current, randomId()))
  }, [commitWaypoints])

  /** PR1-02: the tour the other way round, as one step. */
  const reverse = useCallback(() => {
    if (!editPermissionRef.current || saveInFlightRef.current) return
    commitWaypoints(current => reverseRoute(current))
  }, [commitWaypoints])

  /** PAD-03/PAD-07: a paddler's change to the control points (a portage, a lock), as one step. */
  const editPaddlePoints = useCallback((change: (current: TourPlannerWaypoint[]) => TourPlannerWaypoint[]) => {
    if (!editPermissionRef.current || saveInFlightRef.current || tourTypeRef.current !== 'kayak') return
    commitWaypoints(change)
  }, [commitWaypoints])

  /** P2A-04: the leg after this waypoint drawn by hand, or routed again (a paddle tour's on the water). */
  const toggleWaypointFreeLeg = useCallback((id: string) => {
    if (!editPermissionRef.current || saveInFlightRef.current) return
    commitWaypoints(current => toggleFreeLeg(current, id))
  }, [commitWaypoints])

  const removeWaypoint = useCallback((id: string) => {
    if (!editPermissionRef.current) return
    commitWaypoints(current => current.filter(point => point.id !== id))
    setSelectedWaypointId(current => current === id ? null : current)
  }, [commitWaypoints])

  const moveWaypoint = useCallback((id: string, direction: -1 | 1) => {
    commitWaypoints(current => {
      const index = current.findIndex(point => point.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [commitWaypoints])

  const reorderWaypoint = useCallback(
    (id: string, targetId: string, placement: 'before' | 'after') => {
      if (!editPermissionRef.current || saveInFlightRef.current || id === targetId) return;
      commitWaypoints((current) => {
        const fromIndex = current.findIndex((point) => point.id === id);
        const targetIndex = current.findIndex((point) => point.id === targetId);
        if (fromIndex < 0 || targetIndex < 0) return current;
        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        const targetAfterRemoval = next.findIndex((point) => point.id === targetId);
        const insertIndex = targetAfterRemoval + (placement === 'after' ? 1 : 0);
        next.splice(insertIndex, 0, moved);
        return next;
      });
    },
    [commitWaypoints]
  );

  /** A snapshot of the history put back: the route and what it depends on. */
  const restoreStep = useCallback((entry: HistoryEntry) => {
    invalidateDetailRequest()
    interruptRouting()
    draftRevisionRef.current += 1
    waypointsRef.current = entry.waypoints
    difficultyRef.current = entry.difficulty
    preferencesRef.current = entry.preferences
    tourTypeRef.current = entry.tourType
    setWaypoints(entry.waypoints)
    setMaxHikingDifficultyState(entry.difficulty)
    setHikingPreferencesState(entry.preferences)
    setTourTypeState(entry.tourType)
    setSelectedWaypointId(id => entry.waypoints.some(point => point.id === id) ? id : entry.waypoints[0]?.id ?? null)
    setHasUnsavedChanges(true)
    setStatus('dirty')
    setError(null)
  }, [invalidateDetailRequest, interruptRouting])

  const { undo: undoStep, redo: redoStep } = history
  const undo = useCallback(() => {
    if (!editPermissionRef.current) return
    const previous = undoStep(snapshot())
    if (previous) restoreStep(previous)
  }, [restoreStep, snapshot, undoStep])

  const redo = useCallback(() => {
    if (!editPermissionRef.current) return
    const next = redoStep(snapshot())
    if (next) restoreStep(next)
  }, [redoStep, restoreStep, snapshot])

  /** A field other than the route changed: the draft is unsaved again, and a finished save is no longer current. */
  const markEdited = useCallback(() => {
    if (!editPermissionRef.current) return false
    invalidateDetailRequest()
    draftRevisionRef.current += 1
    setHasUnsavedChanges(true)
    setSaveOutcome(null)
    setStatus(current => current === 'saved' || current === 'saving' ? (waypointsRef.current.length < 2 ? 'dirty' : 'ready') : current)
    return true
  }, [invalidateDetailRequest])

  const setName = useCallback((value: string) => {
    if (value !== name && markEdited()) setNameState(value)
  }, [markEdited, name])

  const setDescription = useCallback((value: string) => {
    if (value !== description && markEdited()) setDescriptionState(value)
  }, [description, markEdited])

  const setWebsite = useCallback((value: string) => {
    if (value !== website && markEdited()) setWebsiteState(value)
  }, [markEdited, website])

  const setPlannedDurationMinutes = useCallback((value: number | null) => {
    if (value !== plannedDurationMinutes && markEdited()) setPlannedDurationMinutesState(value)
  }, [markEdited, plannedDurationMinutes])

  const setBreakAdditionalMinutes = useCallback((value: number | null) => {
    if (value !== breakAdditionalMinutes && markEdited()) setBreakAdditionalMinutesState(value)
  }, [breakAdditionalMinutes, markEdited])

  const paddle = usePaddleFields(restored?.paddle ?? NO_PADDLE_FIELDS, markEdited)
  const loadPaddle = paddle.load
  const paddleBoat = paddle.boatType
  const paddleLakeStyle = paddle.lakeStyle

  /**
   * PAD-01: hike or paddle tour, as one step of the history with the route,
   * since a paddle tour draws every leg by hand. Nothing is routed or put on
   * a day by the choice itself.
   */
  const setTourType = useCallback((value: PlannableTourType) => {
    if (!editPermissionRef.current || saveInFlightRef.current || value === tourTypeRef.current) return
    invalidateDetailRequest()
    interruptRouting()
    draftRevisionRef.current += 1
    recordStep(snapshot())
    tourTypeRef.current = value
    setTourTypeState(value)
    const next = normalizePlannerWaypoints(waypointsRef.current, value === 'kayak')
    waypointsRef.current = next
    setWaypoints(next)
    setHasUnsavedChanges(true)
    setSaveOutcome(null)
    setStatus('dirty')
    setError(null)
  }, [recordStep, invalidateDetailRequest, interruptRouting, snapshot])

  const routeAnalysis = useMemo(
    () => analyzeRouteGeometry(JSON.stringify(enrichedGeometry ?? route)),
    [enrichedGeometry, route],
  )
  const isPaddle = tourType === 'kayak'
  const paddleSpeedInvalid = paddle.speedKmh !== null && !paddleSpeedKmhSchema.safeParse(paddle.speedKmh).success
  const { effectiveSpeedKmh, portageSpeedKmh, boatType, waterContext, speedKmh, lakeStyle } = paddle
  // The routed length of each leg while the route is the current points' (PAD-11); straight lines before that.
  const routedLegLengths = paddleRoute && routeForKey === tourWaypointKey(waypoints) ? paddleRoute.legLengths : undefined
  const paddleEstimate = useMemo(() => isPaddle ? paddleEstimateOf(waypoints, { effectiveSpeedKmh, portageSpeedKmh }, paddleSpeedInvalid, routedLegLengths) : null,
    [effectiveSpeedKmh, isPaddle, paddleSpeedInvalid, portageSpeedKmh, routedLegLengths, waypoints])
  const facts = useMemo(() => tourPlannerFacts({
    tourType, maxHikingDifficulty, hikingPreferences, website, plannedDurationMinutes, breakAdditionalMinutes,
    paddle: { boatType, waterContext, speedKmh, portageSpeedKmh, lakeStyle },
    paddleSpeedInvalid, paddleEstimate, routeAnalysis, durationSeconds,
  }), [boatType, breakAdditionalMinutes, durationSeconds, hikingPreferences, lakeStyle, maxHikingDifficulty, paddleEstimate, paddleSpeedInvalid,
    plannedDurationMinutes, portageSpeedKmh, routeAnalysis, speedKmh, tourType, waterContext, website])
  const { websiteInvalid, plannedDurationInvalid, breakAdditionalInvalid, paddleIncomplete, walkingDurationMinutes,
    plannedTotalMinutes, plannedTotalInvalid, savedDurationSeconds, typeFields } = facts

  const returnToNeutral = useCallback(() => {
    if (saveInFlightRef.current) return
    invalidateDetailRequest()
    interruptRouting()
    contextGenerationRef.current += 1
    draftRevisionRef.current += 1
    setRouteProfileFocus(null)
    forgetDraft()
    setNameState('')
    setDescriptionState('')
    setWebsiteState('')
    setPlannedDurationMinutesState(null)
    setBreakAdditionalMinutesState(null)
    setWaypoints([])
    setMaxHikingDifficultyState(2)
    setTourTypeState('hike')
    loadPaddle(NO_PADDLE_FIELDS)
    waypointsRef.current = []
    difficultyRef.current = 2
    preferencesRef.current = null
    setHikingPreferencesState(null)
    tourTypeRef.current = 'hike'
    setSelectedWaypointId(null)
    clearHistory()
    setStatus('empty')
    setRoute(null)
    setRouteParts(null)
    setPaddleRoute(null)
    setEnrichedGeometry(null)
    setRouteForKey(null)
    setDistanceMeters(null)
    setDurationSeconds(null)
    setError(null)
    setHasUnsavedChanges(false)
    setDraftRestored(false)
    setEditingPlaceId(null)
    editingPlaceIdRef.current = null
    setDerivedFromPlaceId(null)
    adoptRevision(null)
    setOpeningTourId(null)
    setSaveOutcome(null)
    setReadOnlyGpxTour(null)
    setNewTourConfirmationOpen(false)
    setElevationProfileExpanded(true)
    setNewDraftGeneration(generation => generation + 1)
    setMapFocusKey(key => key + 1)
  }, [clearHistory, invalidateDetailRequest, interruptRouting, loadPaddle, forgetDraft])

  const forgetDeletedTour = useCallback((placeId: number) => {
    deletedTourPlaceIdsRef.current.add(placeId)
    const editorReferencesTour = editingPlaceIdRef.current === placeId
      || readOnlyGpxTourRef.current?.tour.place_id === placeId
      || detailPlaceIdRef.current === placeId
    if (!editorReferencesTour) return
    if (saveInFlightRef.current) {
      saveRequestIdRef.current += 1
      saveInFlightRef.current = false
      setIsSaving(false)
    }
    returnToNeutral()
  }, [returnToNeutral])

  const startNewTour = useCallback((confirmed = false) => {
    if (!editPermissionRef.current || saveInFlightRef.current) return
    const currentDraftIsEmpty = editingPlaceId === null && waypoints.length === 0 && name.trim().length === 0
    if (!confirmed && hasUnsavedChanges && !currentDraftIsEmpty) {
      setNewTourConfirmationOpen(true)
      return
    }
    returnToNeutral()
    setHasUnsavedChanges(true)
  }, [editingPlaceId, hasUnsavedChanges, name, returnToNeutral, waypoints.length]
  )

  /**
   * A draft through the control points taken from an import: a new tour that
   * remembers the import, or the import itself planned over in place. Nothing
   * is stored until the draft is saved like any other.
   */
  const startDerivedTour = useCallback(
    (draft: DerivedTourDraft) => {
      if (!editPermissionRef.current || saveInFlightRef.current || draft.points.length < 2) return false
      returnToNeutral()
      const type = draft.tourType ?? 'hike'
      const points = normalizePlannerWaypoints(
        draft.points.map(({ lat, lng }) => ({ id: randomId(), lat, lng, role: 'via' as const })),
        type === 'kayak',
      )
      tourTypeRef.current = type
      setTourTypeState(type)
      if (draft.paddle) loadPaddle(draft.paddle)
      setNameState(draft.name)
      setDescriptionState(draft.description ?? '')
      setWebsiteState(draft.website ?? '')
      setWaypoints(points)
      waypointsRef.current = points
      setMaxHikingDifficultyState(draft.difficulty)
      difficultyRef.current = draft.difficulty
      setSelectedWaypointId(points[0].id)
      if (draft.inPlace) {
        setEditingPlaceId(draft.sourcePlaceId)
        editingPlaceIdRef.current = draft.sourcePlaceId
        adoptRevision(draft.revision)
      } else {
        setDerivedFromPlaceId(draft.sourcePlaceId)
      }
      setStatus('dirty')
      setHasUnsavedChanges(true)
      return true
    },
    [loadPaddle, returnToNeutral])

  const cancelNewTour = useCallback(() => setNewTourConfirmationOpen(false), [])
  const toggleElevationProfile = useCallback(() => {
    if (elevationProfileExpanded) setRouteProfileFocus(null)
    setElevationProfileExpanded(expanded => !expanded)
  }, [elevationProfileExpanded])
  const discard = useCallback(() => returnToNeutral(), [returnToNeutral])

  const viewGpxTour = useCallback((tour: TourListItem, routeGeometry: string | null) => {
    if (saveInFlightRef.current) return
    invalidateDetailRequest()
    contextGenerationRef.current += 1
    returnToNeutral()
    setReadOnlyGpxTour({ tour, routeGeometry })
  }, [invalidateDetailRequest, returnToNeutral])

  const closeGpxTour = useCallback(() => {
    invalidateDetailRequest()
    contextGenerationRef.current += 1
    setRouteProfileFocus(null)
    setReadOnlyGpxTour(null)
  }, [invalidateDetailRequest])

  const openTour = useCallback(async (tour: Pick<TourListItem, 'place_id'> & Partial<TourListItem>) => {
    if (!mountedRef.current || !activeRef.current || saveInFlightRef.current || deletedTourPlaceIdsRef.current.has(tour.place_id)) return false
    detailAbortRef.current?.abort()
    const controller = new AbortController()
    detailAbortRef.current = controller
    const requestId = ++detailRequestIdRef.current
    const submittedTripId = String(tripId)
    const submittedPlaceId = tour.place_id
    const submittedContextGeneration = contextGenerationRef.current
    const submittedRevision = draftRevisionRef.current
    const submittedEditingPlaceId = editingPlaceIdRef.current
    const submittedGpxPlaceId = readOnlyGpxTourRef.current?.tour.place_id ?? null
    detailPlaceIdRef.current = submittedPlaceId
    const requestIsCurrent = () => mountedRef.current
      && activeRef.current
      && requestId === detailRequestIdRef.current
      && detailPlaceIdRef.current === submittedPlaceId
      && String(tripIdRef.current) === submittedTripId
      && contextGenerationRef.current === submittedContextGeneration
      && draftRevisionRef.current === submittedRevision
      && editingPlaceIdRef.current === submittedEditingPlaceId
      && (readOnlyGpxTourRef.current?.tour.place_id ?? null) === submittedGpxPlaceId
    setRouteProfileFocus(null)
    setOpeningTourId(tour.place_id)
    setError(null)
    try {
      const result = await tourRepo.detail(tripId, tour.place_id, controller.signal)
      if (!requestIsCurrent() || saveInFlightRef.current) return false
      if (result.waypoints.length < 2) {
        setError('open')
        return false
      }

      interruptRouting()
      const openedType: PlannableTourType = result.tour.tour_type === 'kayak' ? 'kayak' : 'hike'
      const nextWaypoints = normalizePlannerWaypoints(plannerWaypointsOf(result.waypoints, randomId), openedType === 'kayak')
      forgetDraft()
      contextGenerationRef.current += 1
      draftRevisionRef.current += 1
      setNameState(result.tour.name)
      setDescriptionState(result.tour.description ?? '')
      setWebsiteState(result.tour.website ?? '')
      setPlannedDurationMinutesState(result.tour.planned_duration_minutes ?? null)
      setBreakAdditionalMinutesState(result.tour.break_additional_minutes ?? null)
      setWaypoints(nextWaypoints)
      setMaxHikingDifficultyState(result.tour.max_hiking_difficulty ?? 2)
      setTourTypeState(openedType)
      loadPaddle(paddleFieldsOf(result.tour))
      waypointsRef.current = nextWaypoints
      difficultyRef.current = result.tour.max_hiking_difficulty ?? 2
      preferencesRef.current = result.tour.hiking_preferences ?? null
      setHikingPreferencesState(preferencesRef.current)
      tourTypeRef.current = openedType
      setSelectedWaypointId(nextWaypoints[0]?.id ?? null)
      clearHistory()
      setStatus('dirty')
      setRoute(null)
      setRouteParts(null)
      setPaddleRoute(null)
      setEnrichedGeometry(null)
      setRouteForKey(null)
      setDistanceMeters(null)
      setDurationSeconds(null)
      setHasUnsavedChanges(false)
      setDraftRestored(false)
      setEditingPlaceId(result.tour.place_id)
      editingPlaceIdRef.current = result.tour.place_id
      adoptRevision(result.tour.revision)
      setMapFocusKey(key => key + 1)
      setSaveOutcome(null)
      setReadOnlyGpxTour(null)
      return true
    } catch {
      if (requestIsCurrent() && !saveInFlightRef.current) setError('open')
      return false
    } finally {
      if (mountedRef.current && requestId === detailRequestIdRef.current) {
        detailPlaceIdRef.current = null
        if (detailAbortRef.current === controller) detailAbortRef.current = null
        setOpeningTourId(null)
      }
    }
  }, [clearHistory, interruptRouting, loadPaddle, forgetDraft, tripId])

  const retry = useCallback(() => {
    if (waypointsRef.current.length < 2) return
    interruptRouting()
    setError(null)
    setStatus('dirty')
    setRetryToken(value => value + 1)
  }, [interruptRouting])

  // P2A-03/P2A-05/PAD-11: shaping points, a leg planned afresh, drawn legs handed back to the router.
  const shaping = useRouteShaping({
    commit: commitWaypoints, waypointsRef, retry,
    mayEdit: useCallback(() => editPermissionRef.current && !saveInFlightRef.current, []),
    isPaddle: useCallback(() => tourTypeRef.current === 'kayak', []),
    forgetLeg: useCallback((from: TourPlannerWaypoint, to: TourPlannerWaypoint) =>
      paddleRouteRepo.forget(tripId, from, to, { boat: paddleBoat ?? 'kayak', lakeStyle: paddleLakeStyle }), [paddleBoat, paddleLakeStyle, tripId]),
  })

  const waypointKey = useMemo(() => tourWaypointKey(waypoints), [waypoints])
  const readOnlyGpxAnalysis = useMemo(
    () => analyzeRouteGeometry(readOnlyGpxTour?.routeGeometry),
    [readOnlyGpxTour?.routeGeometry],
  )
  const mode = useMemo(() => selectTourPlannerMode({ readOnlyGpxTour, editingPlaceId, hasUnsavedChanges }), [editingPlaceId, hasUnsavedChanges, readOnlyGpxTour])
  const focusOwner = mode.type === 'view-gpx' || mode.type === 'edit-saved' ? `${mode.type}:${mode.placeId}` : mode.type
  useEffect(() => { setRouteProfileFocus(null) }, [focusOwner, routeAnalysis, readOnlyGpxAnalysis, readOnlyGpxTour])

  useEffect(() => {
    if (waypoints.length < 2) {
      interruptRouting()
      setStatus(waypoints.length === 0 ? 'empty' : 'dirty')
      setRoute(null)
      setRouteParts(null)
      setRouteForKey(null)
      setEnrichedGeometry(null)
      setDistanceMeters(null)
      setDurationSeconds(null)
      setRouteProfileFocus(null)
      setError(null)
      return
    }

    const generation = ++generationRef.current
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    const stale = () => controller.signal.aborted || generation !== generationRef.current
    // Points the router set, changed by its own planning and not by the paddler: no step of the history.
    const patch = (next: TourPlannerWaypoint[]) => {
      waypointsRef.current = next
      setWaypoints(next)
    }

    // PAD-11: a paddle tour is planned on the water by the server's router; its heights are no concern.
    const routePaddle = async () => {
      setStatus('routing')
      const step = await planPaddleStep(waypoints, tripId, { boat: paddleBoat ?? 'kayak', lakeStyle: paddleLakeStyle }, controller.signal, randomId)
      if (stale()) return
      if ('points' in step) return patch(normalizePlannerWaypoints(step.points, true))
      const planned = step.route
      setRoute(planned.coordinates)
      setRouteParts(planned.parts)
      setPaddleRoute(planned)
      setDistanceMeters(planned.distanceMeters)
      setDurationSeconds(null)
      setRouteForKey(waypointKey)
      setEnrichedGeometry(planned.coordinates.map(([lat, lng]): [number, number, number] => [lat, lng, 0]))
      if (planned.failures.length > 0) {
        setStatus('routing-failed')
        setError('paddle-route')
        return
      }
      setStatus('ready')
      setError(null)
    }

    const routeHike = async () => {
      setStatus('routing')
      const routed = await routeWalkingTour(waypoints, controller.signal, maxHikingDifficulty, hikingPreferences)
      if (stale()) return
      if (!routed) {
        setStatus('routing-failed')
        setError('routing')
        return
      }

      setRoute(routed.coordinates)
      setRouteParts(routed.parts)
      setPaddleRoute(null)
      setDistanceMeters(routed.distanceMeters)
      setDurationSeconds(routed.durationSeconds)
      setRouteForKey(waypointKey)
      setEnrichedGeometry(null)
      setStatus('enriching-elevation')

      const enriched = await enrichTourElevations(routed.coordinates, controller.signal)
      if (stale()) return
      if (!enriched) {
        setStatus('elevation-failed')
        setError('elevation')
        return
      }
      setEnrichedGeometry(enriched)
      if (!hasCompleteElevation(enriched)) {
        setStatus('elevation-failed')
        setError('elevation')
        return
      }
      setStatus('ready')
      setError(null)
    }

    const timer = window.setTimeout(() => {
      const run = isPaddle ? routePaddle() : routeHike()
      run.catch(() => {
        if (stale()) return
        setStatus('routing-failed')
        setError('routing')
      })
    }, ROUTE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [hikingPreferences, interruptRouting, isPaddle, maxHikingDifficulty, paddleBoat, paddleLakeStyle, retryToken, tripId, waypointKey, waypoints])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const draft: DraftPayload = { version: 9, name, description, website, plannedDurationMinutes, breakAdditionalMinutes, waypoints, maxHikingDifficulty, editingPlaceId,
      derivedFromPlaceId, tourType, baseRevision: revision.base, hikingPreferences,
      paddle: { boatType: paddle.boatType, waterContext: paddle.waterContext, speedKmh: paddle.speedKmh, portageSpeedKmh: paddle.portageSpeedKmh, lakeStyle: paddle.lakeStyle },
    }
    keepDraft(draft)
  }, [breakAdditionalMinutes,
    derivedFromPlaceId, description, editingPlaceId, hasUnsavedChanges, maxHikingDifficulty, name, plannedDurationMinutes, keepDraft, waypoints, website,
    tourType, paddle.boatType, paddle.waterContext, paddle.speedKmh, paddle.portageSpeedKmh, paddle.lakeStyle, revision.base, hikingPreferences])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  const canSave = canEdit && !isSaving && hasUnsavedChanges && name.trim().length > 0 && status === 'ready'
    && routeForKey === waypointKey && hasCompleteElevation(enrichedGeometry)
    && description.length <= 2000 && !websiteInvalid && !plannedDurationInvalid && !breakAdditionalInvalid && !plannedTotalInvalid
    && !paddleIncomplete && !(isPaddle && paddleSpeedInvalid)

  /**
   * Saves the draft: over the tour it edits, naming the revision it was loaded
   * at (P2C-03), or with `asNew` as a tour of its own under `name`, the way out
   * of a refused save that keeps both versions.
   */
  const save = useCallback(async (options: { asNew?: boolean; name?: string } = {}) => {
    if (!mountedRef.current || saveInFlightRef.current || !editPermissionRef.current || !canSave || !hasCompleteElevation(enrichedGeometry)) return null
    if (editingPlaceId !== null && deletedTourPlaceIdsRef.current.has(editingPlaceId)) return null
    invalidateDetailRequest()
    saveInFlightRef.current = true
    const requestId = ++saveRequestIdRef.current
    const submittedRevision = draftRevisionRef.current
    const submittedContextGeneration = contextGenerationRef.current
    const submittedTripId = String(tripId)
    const submittedPlaceId = editingPlaceId
    const targetPlaceId = options.asNew ? null : submittedPlaceId
    const expectedRevision = targetPlaceId === null ? null : revisionBaseRef.current
    const payload = {
      name: (options.name ?? name).trim(),
      description: trimmedOrNull(description),
      website: parsedWebsiteOrNull(website),
      ...typeFields,
      route_geometry: enrichedGeometry.map(point => [point[0], point[1], point[2]]),
      waypoints: savedWaypointsOf(waypoints),
      duration_seconds: savedDurationSeconds,
      planned_duration_minutes: plannedDurationMinutes,
      break_additional_minutes: breakAdditionalMinutes,
      ...derivedFromField(targetPlaceId, derivedFromPlaceId),
      ...(expectedRevision !== null ? { expected_revision: expectedRevision } : {}),
    } as const
    setStatus('saving')
    setIsSaving(true)
    setError(null)
    const stillCurrent = () => mountedRef.current
      && requestId === saveRequestIdRef.current
      && String(tripIdRef.current) === submittedTripId
      && editingPlaceIdRef.current === submittedPlaceId
      && contextGenerationRef.current === submittedContextGeneration
      && draftRevisionRef.current === submittedRevision
    try {
      const result = targetPlaceId === null
        ? await tourRepo.create(tripId, payload)
        : await tourRepo.update(tripId, targetPlaceId, payload)
      if (stillCurrent()) {
        forgetDraft()
        adoptRevision(result.tour.revision)
        if (options.name) setNameState(options.name.trim())
        setHasUnsavedChanges(false)
        setStatus('saved')
        clearHistory()
        setEditingPlaceId(result.tour.place_id)
        editingPlaceIdRef.current = result.tour.place_id
        setSaveOutcome(result.tour)
      }
      if (mountedRef.current && String(tripIdRef.current) === submittedTripId && !deletedTourPlaceIdsRef.current.has(result.tour.place_id)) {
        try { await onSaved?.(result) } catch { return result }
      }
      return result
    } catch (failure: unknown) {
      if (stillCurrent()) {
        setStatus('ready')
        // A save refused because someone else saved the tour meanwhile keeps the draft and asks what to do.
        setError(refuseRevision(failure) ? 'conflict' : 'save')
      }
      return null
    } finally {
      if (mountedRef.current && requestId === saveRequestIdRef.current) {
        saveInFlightRef.current = false
        setIsSaving(false)
      }
    }
  }, [clearHistory, breakAdditionalMinutes, canSave,
    derivedFromPlaceId,
    description, savedDurationSeconds, editingPlaceId, enrichedGeometry, invalidateDetailRequest, name, onSaved, plannedDurationMinutes, forgetDraft, tripId, typeFields, waypoints, website])

  return {
    tripId, canEdit, canAssign,
    name, setName, maxHikingDifficulty, setMaxHikingDifficulty, hikingPreferences, setHikingPreferences,
    tourType, setTourType, isPaddle, paddle, paddleSpeedInvalid, paddleIncomplete,
    description, setDescription, website, setWebsite, websiteInvalid,
    plannedDurationMinutes, setPlannedDurationMinutes, plannedDurationInvalid,
    breakAdditionalMinutes, setBreakAdditionalMinutes, breakAdditionalInvalid,
    walkingDurationMinutes, plannedTotalMinutes, plannedTotalInvalid,
    waypoints, selectedWaypointId, setSelectedWaypointId,
    addWaypoint, appendFixedLeg, setWaypointPosition, removeWaypoint, moveWaypoint, reorderWaypoint, editWaypoints: commitWaypoints,
    reverse, returnToStart, isLoop: isClosedLoop(waypoints), toggleWaypointFreeLeg, editPaddlePoints, amendWaypoints, paddleEstimate,
    ...shaping, paddleRoute, routeCurrent: routeForKey === waypointKey,
    undo, redo, canUndo: history.canUndo, canRedo: history.canRedo,
    status, error, retry, isSaving,
    route, routeParts, enrichedGeometry, routeAnalysis, distanceMeters, durationSeconds,
    routeProfileFocus, setRouteProfileFocus,
    ...mapView,
    mode, readOnlyGpxTour, readOnlyGpxAnalysis, viewGpxTour, closeGpxTour,
    startNewTour,
    startDerivedTour,
    derivedFromPlaceId,
    newTourConfirmationOpen, cancelNewTour, forgetDeletedTour,
    elevationProfileExpanded, toggleElevationProfile, newDraftGeneration, draftRestored, mapFocusKey,
    editingPlaceId, openingTourId, openTour,
    saveOutcome, hasUnsavedChanges, canSave, save, discard, returnToNeutral, revision,
  }
}

export type TourPlannerController = ReturnType<typeof useTourPlanner>
