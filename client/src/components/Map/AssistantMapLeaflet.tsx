import type { ViewportPadding } from '../../utils/mapViewport';
import { useAssistantMarkerClasses } from './assistantCamera';
import { AssistantCameraController } from './AssistantCameraController';
import { AssistantGhostLayer } from './AssistantGhostLayer';
import type { AssistantMapProps } from './mapViewContract';

interface AssistantMapLeafletProps {
  assistant: AssistantMapProps;
  /** The planner's padding for its panels, for the camera's fits. */
  padding: ViewportPadding;
  /** The element of a place's pin, when it has one on the map now. */
  markerEl: (placeId: number) => HTMLElement | null;
}

/**
 * Everything the assistant does on the Leaflet map, mounted inside the map
 * container as one child, so MapView only hands its props on: the ghosts,
 * the camera, and the pop and pulse on the real pins.
 */
export function AssistantMapLeaflet({ assistant, padding, markerEl }: AssistantMapLeafletProps) {
  useAssistantMarkerClasses(markerEl, assistant.poppedPlaceIds, assistant.assistantPulsePlaceId);
  return (
    <>
      <AssistantGhostLayer
        ghosts={assistant.assistantGhosts}
        hoveredId={assistant.assistantHoveredId}
        onHover={assistant.onAssistantGhostHover}
        onClick={assistant.onAssistantGhostClick}
      />
      <AssistantCameraController camera={assistant.assistantCamera} padding={padding} />
    </>
  );
}
