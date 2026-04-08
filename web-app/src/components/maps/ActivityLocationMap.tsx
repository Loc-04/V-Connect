import type { LatLngExpression } from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
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
}

function MapViewportSync({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [center, map]);

  return null;
}

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
    <div className={classes}>
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
        <CircleMarker
          center={center}
          color="#7c3aed"
          fillColor="#a855f7"
          fillOpacity={0.92}
          radius={9}
          stroke
          weight={2}
        >
          <Popup>
            <strong>{title}</strong>
            <br />
            {address}
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
