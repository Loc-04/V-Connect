import { divIcon, type LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

import type { ActivityCoordinates } from '../../lib/activityLocation';
import './ActivityLocationMap.css';
import 'leaflet/dist/leaflet.css';

interface ActivityLocationMapProps {
  coordinates: ActivityCoordinates | null;
  title: string;
  address: string;
  className?: string;
  compact?: boolean;
  interactive?: boolean;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyMessage?: string;
  editable?: boolean;
  onCoordinatesChange?: ((coordinates: ActivityCoordinates) => void) | null;
  onCoordinatesPreviewChange?: ((coordinates: ActivityCoordinates) => void) | null;
  editInstruction?: string;
}

function MapViewportSync({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [center, map]);

  return null;
}

const draggableMarkerIcon = divIcon({
  className: 'activity-location-map__marker',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -18],
  html: '<span class="activity-location-map__marker-pin"></span>',
});

export function ActivityLocationMap({
  coordinates,
  title,
  address,
  className = '',
  compact = false,
  interactive = true,
  loading = false,
  error = null,
  emptyTitle = 'Map preview unavailable',
  emptyMessage = 'Complete the location details to preview the map.',
  editable = false,
  onCoordinatesChange = null,
  onCoordinatesPreviewChange = null,
  editInstruction = 'Drag the marker to place the exact activity location.',
}: ActivityLocationMapProps) {
  const classes = ['activity-location-map', compact ? 'is-compact' : '', className].filter(Boolean).join(' ');

  if (!coordinates) {
    return (
      <div className={classes}>
        <div className={`activity-location-map__fallback${loading ? ' is-loading' : ''}${error ? ' is-error' : ''}`}>
          <strong>{loading ? 'Locating address...' : error ? 'Unable to load map preview' : emptyTitle}</strong>
          <p>{loading ? 'Resolving the latest coordinates from the selected address.' : error ?? emptyMessage}</p>
          {address ? <small>{address}</small> : null}
        </div>
      </div>
    );
  }

  const center: LatLngExpression = [coordinates.lat, coordinates.lng];

  return (
    <div className={`${classes}${editable ? ' is-editable' : ''}`}>
      <MapContainer
        attributionControl
        center={center}
        className="activity-location-map__canvas"
        doubleClickZoom={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        touchZoom={interactive}
        zoom={15}
        zoomControl={interactive}
      >
        <MapViewportSync center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          draggable={editable}
          eventHandlers={
            editable
              ? {
                  drag(event) {
                    if (!onCoordinatesPreviewChange) {
                      return;
                    }

                    const position = event.target.getLatLng();
                    onCoordinatesPreviewChange({
                      lat: Number(position.lat.toFixed(7)),
                      lng: Number(position.lng.toFixed(7)),
                    });
                  },
                  dragend(event) {
                    if (!onCoordinatesChange) {
                      return;
                    }

                    const position = event.target.getLatLng();
                    onCoordinatesChange({
                      lat: Number(position.lat.toFixed(7)),
                      lng: Number(position.lng.toFixed(7)),
                    });
                  },
                }
              : undefined
          }
          icon={draggableMarkerIcon}
          position={center}
        >
          <Popup>
            <strong>{title}</strong>
            <br />
            {address}
          </Popup>
        </Marker>
      </MapContainer>
      {editable ? <div className="activity-location-map__overlay">{editInstruction}</div> : null}
    </div>
  );
}
