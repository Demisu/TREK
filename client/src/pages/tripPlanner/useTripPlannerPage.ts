import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePoiExplore, type Bbox } from '../../components/Map/usePoiExplore'
import { placeActions } from '../../components/Planner/usePlaceActions'
import { tourRouteStyle } from '../../components/Tours/planner/tourRouteStyle'
import { useTrackPortageParts } from '../../components/Tours/paddle/useTrackPortageParts'
import { usePaddleObstacleSync } from '../../components/Tours/paddle/usePaddleObstacleSync'
import { tourPlannedTimes as projectTourPlannedTimes } from '../../components/Tours/tourPresentation'
import { usePlanMapViewport } from '../../hooks/usePlanMapViewport'
import { useMapLocationSearch } from './useMapLocationSearch'
import { useTripPlanner } from './useTripPlanner'
import { useTourWorkspace } from './useTourWorkspace'

export function useTripPlannerPage() {
  const planner = useTripPlanner()
  const {
    activeTab,
    can, places,
    setSelectedPlaceId,
    t,
    toast,
    tours,
    trip,
    tripActions,
    tripId } = planner

  const canPlaceEdit = can('place_edit', trip)
  const canDayEdit = can('day_edit', trip)
  const { tourPlanner, viewImportedTour, tourGpxImport, wandererBrowser, tourConversion, recordedTrack, trackPaddlePlan, tourDetailActions } =
    useTourWorkspace(planner, canPlaceEdit, canDayEdit)

  const tourDetailOpenerRef = useRef<{ placeId: number; element: HTMLElement } | null>(null)
  const lastPlanMapViewportRef = useRef<Bbox | null>(null)
  const [plannerViewportSnapshot, setPlannerViewportSnapshot] = useState<Bbox | null>(lastPlanMapViewportRef.current)
  useEffect(() => {
    if (activeTab === 'tour-planner') setPlannerViewportSnapshot(lastPlanMapViewportRef.current)
  }, [activeTab, tourPlanner.newDraftGeneration])

  const plannerFallbackFocusPoints = useMemo<[number, number][]>(() => {
    const bounds = plannerViewportSnapshot
    if (bounds) {
      const latitudeSpan = bounds.north - bounds.south
      const longitudeSpan = bounds.east - bounds.west
      if (latitudeSpan > 0 && latitudeSpan < 160 && longitudeSpan > 0 && longitudeSpan < 340) {
        return [[bounds.south, bounds.west], [bounds.north, bounds.east]]
      }
    }
    return places
      .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .map(place => [place.lat, place.lng] as [number, number])
  }, [places, plannerViewportSnapshot])

  const focusPoints = useMemo<[number, number][]>(() => {
    if (wandererBrowser.open) return wandererBrowser.line ?? plannerFallbackFocusPoints
    if (tourPlanner.mode.type === 'view-gpx') return tourPlanner.readOnlyGpxAnalysis?.routeCoordinates ?? []
    if (tourPlanner.mode.type === 'new-draft') {
      return tourPlanner.waypoints.map(point => [point.lat, point.lng])
    }
    if (tourPlanner.mode.type === 'edit-saved' && tourPlanner.waypoints.length) {
      return tourPlanner.waypoints.map(point => [point.lat, point.lng])
    }
    return plannerFallbackFocusPoints
  }, [
    wandererBrowser.open,
    wandererBrowser.line,
    tourPlanner.mode.type, tourPlanner.readOnlyGpxAnalysis?.routeCoordinates, tourPlanner.waypoints, plannerFallbackFocusPoints])

  const { mapFocusPoints, mapFocusKey, locationSearch } = useMapLocationSearch(tourPlanner.mapFocusKey, focusPoints)

  const trackParts = useTrackPortageParts(tourPlanner)
  // PAD-05B: the obstacles around the paddle tour in view, for the map and the rails alike.
  const paddleLine = tourPlanner.mode.type === 'view-gpx'
    ? (tourPlanner.mode.tour.tour_type === 'kayak' ? tourPlanner.readOnlyGpxAnalysis?.routeCoordinates ?? null : null)
    : tourPlanner.isPaddle ? tourPlanner.route : null
  usePaddleObstacleSync(paddleLine, activeTab === 'tour-planner')
  const route = useMemo<[number, number][][] | null>(() => {
    if (wandererBrowser.open) return wandererBrowser.line ? [wandererBrowser.line] : null
    if (tourPlanner.mode.type === 'view-gpx') {
      const coordinates = tourPlanner.readOnlyGpxAnalysis?.routeCoordinates
      if (!coordinates?.length) return null
      // While an editable version is previewed, the import (dashed) and the suggestion side by side.
      if (tourConversion.line) return [coordinates, tourConversion.line]
      // A paddle track with portages marked on it: the carried stretches as their own lines.
      return trackParts ? trackParts.map(part => part.coordinates) : [coordinates]
    }
    if (tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved') {
      // Routed and hand-drawn stretches as their own lines, so the map can tell them apart.
      if (tourPlanner.routeParts?.length) return tourPlanner.routeParts.map(part => part.coordinates)
      return tourPlanner.route ? [tourPlanner.route] : null
    }
    return null
  }, [
    wandererBrowser.open,
    wandererBrowser.line,
    tourPlanner.mode.type, tourPlanner.readOnlyGpxAnalysis?.routeCoordinates, tourPlanner.route, tourPlanner.routeParts,
    tourConversion.line, trackParts,
  ])
  const editingRoute = tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved'
  // A hand-drawn stretch of a hike is dotted, a paddle tour's portages dotted and brown.
  const partStyle = tourRouteStyle(
    !wandererBrowser.open && editingRoute ? tourPlanner.routeParts : !tourConversion.line ? trackParts : null,
    tourPlanner.isPaddle || !!trackParts,
  )
  const routeWalking = partStyle.walking ?? (route && route.length === 2 && tourConversion.line ? [true, false] : null)

  const { closeGpxTour } = tourPlanner
  useEffect(() => {
    if (activeTab !== 'tour-planner') closeGpxTour()
  }, [activeTab, closeGpxTour])

  const poi = usePoiExplore()
  const poiViewportChangeRef = useRef(poi.onViewportChange)
  poiViewportChangeRef.current = poi.onViewportChange
  // The place search looks where the plan map looks, and only while it is on screen.
  const reportViewport = usePlanMapViewport(tripId, activeTab === 'plan')
  const captureViewport = useCallback((bounds: Bbox) => {
    lastPlanMapViewportRef.current = bounds
    poiViewportChangeRef.current(bounds)
    reportViewport(bounds)
  }, [reportViewport])

  // Each tour's planned times keyed by its place, for the day plan's tour rows.
  const plannedTourDurations = new Map(tours.map(tour => [tour.place_id, { ...projectTourPlannedTimes(tour), tour }] as const))

  const onSelectTour = (tour: (typeof tours)[number] | null, opener?: HTMLElement) => {
    tourDetailOpenerRef.current = tour && opener ? { placeId: tour.place_id, element: opener } : null
    setSelectedPlaceId(tour?.place_id ?? null)
  }

  return {
    planner,
    poi,
    // The place inspector's writes, the same ones the phone's place sheet makes.
    placeActions: placeActions({ tripId, tripActions, toast, t }),
    permissions: { canPlaceEdit, canDayEdit },
    tourPlanner,
    tourGpxImport,
    wandererBrowser,
    viewImportedTour,
    tourDetails: { openerRef: tourDetailOpenerRef, onSelectTour },
    tourConversion,
    recordedTrack,
    trackPaddlePlan,
    tourDetailActions,
    tourMap: { route,
      routeWalking,
      routeColors: partStyle.colors,
      previewPoints: tourConversion.status === 'idle' ? null : tourConversion.points,
      focusPoints: mapFocusPoints,
      // A picked wanderer trail frames itself; the rest follows the planner.
      focusKey:
        wandererBrowser.open && wandererBrowser.selected ? `wanderer:${wandererBrowser.selected.id}` : mapFocusKey, captureViewport,
    },
    locationSearch,
    plannedTourDurations,
  }
}