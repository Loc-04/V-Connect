import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, ExternalLink, ImagePlus, MapPin, Sparkles, X } from 'lucide-react';

import { normalizeRole } from '../auth/roleUtils';
import { useAuth } from '../auth/useAuth';
import { TimelineStatusBadge } from '../components/timeline';
import { ActivityLocationMap } from '../components/maps/ActivityLocationMap';
import { Button, Card } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { buildActivityMapUrl } from '../lib/activityLocation';
import { createActivity, getActivityById, updateActivity } from '../lib/activities';
import { geocodeLocation, listProvinces, listWards, reverseGeocodeLocation } from '../lib/locations';
import { safeText } from '../lib/timelineNormalization';
import { replaceActivityTimeline } from '../lib/timeline';
import { hasTimelineValidationErrors, sortTimelineByTime, validateTimelineDrafts } from '../lib/timelineValidation';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { GeocodedLocationRecord, ProvinceRecord, WardRecord } from '../types/location';
import type { TimelineMilestoneDraft, TimelineMilestoneType } from '../types/timeline';
import './CreateActivityPage.css';

function combineDateAndTime(date: string, time: string) {
  const localDate = new Date(`${date}T${time}`);
  if (Number.isNaN(localDate.getTime())) {
    throw new Error('Invalid date/time.');
  }
  return localDate.toISOString();
}

function splitDateAndTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: '', time: '' };
  }

  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value: string) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
}

const acceptedCoverImageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif']);
const maxCoverImageBytes = 10 * 1024 * 1024;
const coverTargetWidth = 1280;
const coverTargetHeight = 720;
const quickTimelineTypeOptions: TimelineMilestoneType[] = ['opening', 'session', 'break', 'closing', 'other'];

function formatTimelineTypeLabel(type: TimelineMilestoneType) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRange(startLocalValue: string, endLocalValue: string) {
  if (!startLocalValue || !endLocalValue) {
    return 'Time not set';
  }

  const start = new Date(startLocalValue);
  const end = new Date(endLocalValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Time not set';
  }

  const startLabel = start.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endLabel = end.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${startLabel} - ${endLabel}`;
}

function createLocalDraftId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read selected image.'));
    };
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode selected image.'));
    image.src = source;
  });
}

function estimateDataUrlSizeBytes(value: string) {
  const base64Payload = value.split(',')[1] ?? '';
  const paddingBytes = base64Payload.endsWith('==') ? 2 : base64Payload.endsWith('=') ? 1 : 0;
  return Math.floor((base64Payload.length * 3) / 4) - paddingBytes;
}

async function normalizeCoverImage(file: File): Promise<string> {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = coverTargetWidth / coverTargetHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = Math.round(sourceHeight * targetAspect);
    cropX = Math.round((sourceWidth - cropWidth) / 2);
  } else if (sourceAspect < targetAspect) {
    cropHeight = Math.round(sourceWidth / targetAspect);
    cropY = Math.round((sourceHeight - cropHeight) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = coverTargetWidth;
  canvas.height = coverTargetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processing is not available in this browser.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    coverTargetWidth,
    coverTargetHeight
  );

  const qualitySteps = [0.9, 0.84, 0.76, 0.68];
  for (const quality of qualitySteps) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (estimateDataUrlSizeBytes(encoded) <= maxCoverImageBytes) {
      return encoded;
    }
  }

  const fallback = canvas.toDataURL('image/jpeg', 0.6);
  if (estimateDataUrlSizeBytes(fallback) > maxCoverImageBytes) {
    throw new Error('Cover image is too large after processing. Please choose another image.');
  }
  return fallback;
}

function getAddressValue(location: ActivityRecord['location']) {
  if (!location) {
    return '';
  }

  if (typeof location === 'string') {
    return location;
  }

  return location.address ?? '';
}

function buildLocationRequestKey(address: string, provinceCode: string, wardCode: string) {
  return [address.trim().toLowerCase(), provinceCode.trim(), wardCode.trim()].join('|');
}

function areSameCoordinates(a: GeocodedLocationRecord | null, b: GeocodedLocationRecord | null) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.lat - b.lat) < 0.0000001 && Math.abs(a.lng - b.lng) < 0.0000001;
}

function mapActivityLocationToGeocodedRecord(activity: ActivityRecord): GeocodedLocationRecord | null {
  if (!activity.location || typeof activity.location === 'string') {
    return null;
  }

  if (typeof activity.location.lat !== 'number' || !Number.isFinite(activity.location.lat)) {
    return null;
  }

  if (typeof activity.location.lng !== 'number' || !Number.isFinite(activity.location.lng)) {
    return null;
  }

  return {
    address: activity.location.address ?? '',
    city: activity.location.city ?? null,
    province: activity.location.province ?? null,
    ward: activity.location.ward ?? null,
    formattedAddress:
      activity.location.formattedAddress ||
      [activity.location.address, activity.location.ward, activity.location.province].filter(Boolean).join(', '),
    provinceCode: activity.province_code ?? null,
    wardCode: activity.ward_code ?? null,
    mapProvider: activity.location.mapProvider ?? null,
    geocodedAt: activity.location.geocodedAt ?? null,
    geocodeConfidence: activity.location.geocodeConfidence ?? null,
    lat: activity.location.lat,
    lng: activity.location.lng,
  };
}

export function CreateActivityPage() {
  const navigate = useNavigate();
  const { id: activityId } = useParams<{ id?: string }>();
  const { profile, session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [streetAddress, setStreetAddress] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [beginDate, setBeginDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [endTimeManuallyChanged, setEndTimeManuallyChanged] = useState(false);
  const [capacity, setCapacity] = useState('10');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [provinces, setProvinces] = useState<ProvinceRecord[]>([]);
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [mapLocation, setMapLocation] = useState<GeocodedLocationRecord | null>(null);
  const [suggestedMapLocation, setSuggestedMapLocation] = useState<GeocodedLocationRecord | null>(null);
  const [resolvedLocationKey, setResolvedLocationKey] = useState('');
  const [loadingActivity, setLoadingActivity] = useState(Boolean(activityId));
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingWards, setLoadingWards] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdActivityId, setCreatedActivityId] = useState<string | null>(null);
  const [quickMilestones, setQuickMilestones] = useState<TimelineMilestoneDraft[]>([]);
  const [quickTimelineError, setQuickTimelineError] = useState<string | null>(null);
  const [quickTimelineWarning, setQuickTimelineWarning] = useState<string | null>(null);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [activeTimelineDraftId, setActiveTimelineDraftId] = useState<string | null>(null);
  const reverseGeocodeRequestId = useRef(0);

  const role = normalizeRole(profile?.role);
  const canManageActivities = role === 'organizer' || role === 'admin';
  const organizerHomePath = role === 'admin' ? '/admin/dashboard' : '/organizer/activities';
  const isEditing = Boolean(activityId);

  const createQuickMilestoneDraft = useCallback(
    (): TimelineMilestoneDraft => {
      let seedStart = '';
      let seedEnd = '';
      if (beginDate && startTime) {
        try {
          seedStart = combineDateAndTime(beginDate, startTime);
        } catch {
          seedStart = '';
        }
      }
      if (endDate && endTime) {
        try {
          seedEnd = combineDateAndTime(endDate, endTime);
        } catch {
          seedEnd = '';
        }
      }

      return {
        id: createLocalDraftId(),
        title: '',
        description: '',
        startTime: seedStart,
        endTime: seedEnd,
        type: 'session',
        status: 'upcoming',
      };
    },
    [beginDate, endDate, endTime, startTime]
  );

  const selectedProvince = useMemo(
    () => provinces.find((province) => province.code === provinceCode) ?? null,
    [provinceCode, provinces]
  );
  const selectedWard = useMemo(() => wards.find((ward) => ward.code === wardCode) ?? null, [wardCode, wards]);
  const currentLocationKey = useMemo(
    () => buildLocationRequestKey(streetAddress, provinceCode, wardCode),
    [provinceCode, streetAddress, wardCode]
  );
  const resolvedMapLocation = currentLocationKey === resolvedLocationKey ? mapLocation : null;
  const hasManualPinAdjustment = useMemo(
    () =>
      currentLocationKey === resolvedLocationKey &&
      Boolean(resolvedMapLocation) &&
      Boolean(suggestedMapLocation) &&
      !areSameCoordinates(resolvedMapLocation, suggestedMapLocation),
    [currentLocationKey, resolvedLocationKey, resolvedMapLocation, suggestedMapLocation]
  );
  const locationSummary = useMemo(
    () =>
      [
        streetAddress.trim(),
        selectedWard?.name ?? resolvedMapLocation?.ward ?? '',
        selectedProvince?.name ?? resolvedMapLocation?.province ?? '',
      ]
        .filter(Boolean)
        .join(', '),
    [resolvedMapLocation?.province, resolvedMapLocation?.ward, selectedProvince?.name, selectedWard?.name, streetAddress]
  );
  const openMapUrl = useMemo(
    () =>
      buildActivityMapUrl(
        resolvedMapLocation
          ? {
              address: resolvedMapLocation.address,
              city: resolvedMapLocation.city ?? undefined,
              province: resolvedMapLocation.province ?? undefined,
              ward: resolvedMapLocation.ward ?? undefined,
              formattedAddress: resolvedMapLocation.formattedAddress,
              mapProvider: resolvedMapLocation.mapProvider,
              geocodedAt: resolvedMapLocation.geocodedAt,
              geocodeConfidence: resolvedMapLocation.geocodeConfidence,
              lat: resolvedMapLocation.lat,
              lng: resolvedMapLocation.lng,
            }
          : locationSummary
            ? {
                address: streetAddress.trim(),
                province: selectedProvince?.name ?? undefined,
                ward: selectedWard?.name ?? undefined,
                formattedAddress: locationSummary,
              }
            : null
      ),
    [locationSummary, resolvedMapLocation, selectedProvince?.name, selectedWard?.name, streetAddress]
  );
  const currentDateTime = useMemo(() => {
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString();
    return {
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
    };
  }, []);
  const sortedTimelineDrafts = useMemo(() => sortTimelineByTime(quickMilestones), [quickMilestones]);
  const activeTimelineDraft = useMemo(
    () => sortedTimelineDrafts.find((item) => item.id === activeTimelineDraftId) ?? null,
    [activeTimelineDraftId, sortedTimelineDrafts]
  );

  useEffect(() => {
    if (!beginDate) {
      return;
    }
    if (!endDate || endDate < beginDate) {
      setEndDate(beginDate);
      if (!endTimeManuallyChanged) {
        setEndTime('23:59');
      }
    }
  }, [beginDate, endDate, endTimeManuallyChanged]);

  useEffect(() => {
    if (!endDate || endTimeManuallyChanged) {
      return;
    }
    if (endTime !== '23:59') {
      setEndTime('23:59');
    }
  }, [endDate, endTime, endTimeManuallyChanged]);

  useEffect(() => {
    if (quickMilestones.length === 0) {
      setActiveTimelineDraftId(null);
      return;
    }
    const hasActiveDraft = activeTimelineDraftId && quickMilestones.some((item) => item.id === activeTimelineDraftId);
    if (!hasActiveDraft) {
      setActiveTimelineDraftId(quickMilestones[0].id ?? null);
    }
  }, [activeTimelineDraftId, quickMilestones]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoadingProvinces(false);
      return;
    }

    let isMounted = true;
    setLoadingProvinces(true);

    void listProvinces(session.access_token)
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setProvinces(rows);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load provinces.');
      })
      .finally(() => {
        if (isMounted) {
          setLoadingProvinces(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !provinceCode) {
      setWards([]);
      setLoadingWards(false);
      return;
    }

    let isMounted = true;
    setLoadingWards(true);

    void listWards(provinceCode, session.access_token)
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setWards(rows);
        setWardCode((current) => (rows.some((ward) => ward.code === current) ? current : ''));
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load wards.');
        setWards([]);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingWards(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [provinceCode, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !activityId) {
      setLoadingActivity(false);
      return;
    }

    let isMounted = true;
    setLoadingActivity(true);
    setError(null);

    void getActivityById(activityId, session.access_token)
      .then((activity) => {
        if (!isMounted) {
          return;
        }

        const start = splitDateAndTime(activity.start_time);
        const end = splitDateAndTime(activity.end_time);
        setTitle(activity.title ?? '');
        setDescription(activity.description ?? '');
        setCoverImageUrl(typeof activity.cover_image_url === 'string' ? activity.cover_image_url : null);
        setStreetAddress(getAddressValue(activity.location));
        setProvinceCode(activity.province_code ?? '');
        setWardCode(activity.ward_code ?? '');
        const existingMapLocation = mapActivityLocationToGeocodedRecord(activity);
        setMapLocation(existingMapLocation);
        setSuggestedMapLocation(existingMapLocation);
        setResolvedLocationKey(
          existingMapLocation ? buildLocationRequestKey(getAddressValue(activity.location), activity.province_code ?? '', activity.ward_code ?? '') : ''
        );
        setGeocodeError(null);
        setBeginDate(start.date);
        setStartTime(start.time);
        setEndDate(end.date);
        setEndTime(end.time);
        setEndTimeManuallyChanged(true);
        setCapacity(String(activity.capacity ?? 10));
        setRequiredSkills(Array.isArray(activity.required_skills) ? activity.required_skills : []);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load activity.');
      })
      .finally(() => {
        if (isMounted) {
          setLoadingActivity(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activityId, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || loadingActivity) {
      return;
    }

    let cancelled = false;
    const address = streetAddress.trim();
    if (!address || !provinceCode || !wardCode) {
      if (currentLocationKey !== resolvedLocationKey) {
        setMapLocation(null);
        setSuggestedMapLocation(null);
      }
      setGeocoding(false);
      setGeocodeError(null);
      return;
    }

    if (currentLocationKey === resolvedLocationKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGeocoding(true);
      setGeocodeError(null);

      const fallbackAddressCandidate = selectedWard?.name ?? selectedProvince?.name ?? '';

      void (async () => {
        try {
          const nextLocation = await geocodeLocation(
            {
              address,
              provinceCode,
              wardCode,
            },
            session.access_token
          );
          if (cancelled) {
            return;
          }
          setMapLocation(nextLocation);
          setSuggestedMapLocation(nextLocation);
          setResolvedLocationKey(currentLocationKey);
        } catch (geocodeLoadError) {
          if (cancelled) {
            return;
          }

          const shouldAttemptAreaFallback =
            fallbackAddressCandidate.length > 0 && fallbackAddressCandidate.toLowerCase() !== address.toLowerCase();

          if (shouldAttemptAreaFallback) {
            try {
              const areaPreviewLocation = await geocodeLocation(
                {
                  address: fallbackAddressCandidate,
                  provinceCode,
                  wardCode,
                },
                session.access_token
              );
              if (cancelled) {
                return;
              }

              const nextFallbackLocation = {
                ...areaPreviewLocation,
                address,
                formattedAddress: locationSummary || areaPreviewLocation.formattedAddress,
                mapProvider: 'area-preview',
                providerDisplayName: areaPreviewLocation.providerDisplayName ?? areaPreviewLocation.formattedAddress,
              };

              setMapLocation(nextFallbackLocation);
              setSuggestedMapLocation(nextFallbackLocation);
              setResolvedLocationKey(currentLocationKey);
              setGeocodeError(
                'The exact address could not be resolved, so the map is centered on the selected area. Click the map to place the exact activity location.'
              );
              return;
            } catch {
              // Fall through to the original geocode error below.
            }
          }

          setMapLocation(null);
          setSuggestedMapLocation(null);
          setResolvedLocationKey('');
          setGeocodeError(
            geocodeLoadError instanceof Error
              ? geocodeLoadError.message
              : 'Map preview is unavailable for the selected address.'
          );
        } finally {
          if (!cancelled) {
            setGeocoding(false);
          }
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    currentLocationKey,
    loadingActivity,
    locationSummary,
    provinceCode,
    resolvedLocationKey,
    selectedProvince?.name,
    selectedWard?.name,
    session?.access_token,
    streetAddress,
    wardCode,
  ]);

  const handleManualMapSelection = ({ lat, lng }: { lat: number; lng: number }) => {
    const address = streetAddress.trim();
    const provinceName = selectedProvince?.name ?? resolvedMapLocation?.province ?? '';
    const wardName = selectedWard?.name ?? resolvedMapLocation?.ward ?? '';
    const formattedAddress = locationSummary || [address, wardName, provinceName].filter(Boolean).join(', ') || address;

    const nextManualLocation = {
      address,
      city: provinceName || resolvedMapLocation?.city || null,
      province: provinceName || resolvedMapLocation?.province || null,
      ward: wardName || resolvedMapLocation?.ward || null,
      formattedAddress,
      provinceCode: provinceCode || resolvedMapLocation?.provinceCode || null,
      wardCode: wardCode || resolvedMapLocation?.wardCode || null,
      mapProvider: 'manual-adjusted',
      geocodedAt: new Date().toISOString(),
      geocodeConfidence: null,
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      providerDisplayName: formattedAddress,
    };

    setMapLocation(nextManualLocation);
    setResolvedLocationKey(currentLocationKey);
    setGeocodeError(null);

    if (!session?.access_token) {
      return;
    }

    const requestId = reverseGeocodeRequestId.current + 1;
    reverseGeocodeRequestId.current = requestId;
    setReverseGeocoding(true);

    void reverseGeocodeLocation(
      {
        lat: nextManualLocation.lat,
        lng: nextManualLocation.lng,
      },
      session.access_token
    )
      .then((reversedLocation) => {
        if (reverseGeocodeRequestId.current !== requestId) {
          return;
        }

        setMapLocation((current) => {
          if (!current || Math.abs(current.lat - nextManualLocation.lat) > 0.0000001 || Math.abs(current.lng - nextManualLocation.lng) > 0.0000001) {
            return current;
          }

          const reversedFormattedAddress =
            reversedLocation.formattedAddress ||
            reversedLocation.providerDisplayName ||
            current.formattedAddress;

          return {
            ...current,
            city: reversedLocation.city ?? current.city,
            province: reversedLocation.province ?? current.province,
            ward: reversedLocation.ward ?? current.ward,
            formattedAddress: reversedFormattedAddress,
            geocodedAt: reversedLocation.geocodedAt ?? current.geocodedAt,
            providerDisplayName: reversedLocation.providerDisplayName ?? reversedFormattedAddress,
          };
        });
      })
      .catch(() => {
        if (reverseGeocodeRequestId.current !== requestId) {
          return;
        }
      })
      .finally(() => {
        if (reverseGeocodeRequestId.current === requestId) {
          setReverseGeocoding(false);
        }
      });
  };

  const handleManualMapPreview = ({ lat, lng }: { lat: number; lng: number }) => {
    setMapLocation((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
      };
    });
    setResolvedLocationKey(currentLocationKey);
  };

  const restoreSuggestedPin = () => {
    if (!suggestedMapLocation) {
      return;
    }

    setMapLocation(suggestedMapLocation);
    setResolvedLocationKey(currentLocationKey);
    setGeocodeError(null);
  };

  const addSkill = () => {
    const nextSkill = skillDraft.trim();
    if (!nextSkill) {
      return;
    }

    if (!requiredSkills.some((skill) => skill.toLowerCase() === nextSkill.toLowerCase())) {
      setRequiredSkills((current) => [...current, nextSkill]);
    }
    setSkillDraft('');
  };

  const handleCoverImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (!acceptedCoverImageMimeTypes.has(file.type)) {
        throw new Error('Cover image must be PNG, JPG, WEBP, GIF, or BMP.');
      }

      if (file.size > maxCoverImageBytes) {
        throw new Error('Cover image must be 10MB or less.');
      }

      const encodedImage = await normalizeCoverImage(file);
      setCoverImageUrl(encodedImage);
      setError(null);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Failed to process cover image.');
    } finally {
      event.target.value = '';
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setRequiredSkills((current) => current.filter((skill) => skill !== skillToRemove));
  };

  const handleAddQuickMilestone = () => {
    const nextDraft = createQuickMilestoneDraft();
    setQuickMilestones((current) => [...current, nextDraft]);
    setActiveTimelineDraftId(nextDraft.id ?? null);
    setIsTimelineModalOpen(true);
    setQuickTimelineError(null);
    setQuickTimelineWarning(null);
  };

  const handleUpdateQuickMilestone = (
    draftId: string,
    field: keyof TimelineMilestoneDraft,
    value: string | TimelineMilestoneType
  ) => {
    setQuickMilestones((current) =>
      current.map((item) =>
        item.id === draftId
          ? {
              ...item,
              [field]: field === 'startTime' || field === 'endTime' ? toIsoFromDateTimeLocal(String(value)) : value,
            }
          : item
      )
    );
  };

  const handleRemoveQuickMilestone = (draftId: string) => {
    setQuickMilestones((current) => current.filter((item) => item.id !== draftId));
  };

  const handleSkipQuickTimeline = () => {
    setQuickMilestones([]);
    setActiveTimelineDraftId(null);
    setIsTimelineModalOpen(false);
    setQuickTimelineError(null);
    setQuickTimelineWarning(null);
  };

  const handleOpenTimelineModal = () => {
    if (quickMilestones.length === 0) {
      const nextDraft = createQuickMilestoneDraft();
      setQuickMilestones([nextDraft]);
      setActiveTimelineDraftId(nextDraft.id ?? null);
    }
    setIsTimelineModalOpen(true);
    setQuickTimelineError(null);
    setQuickTimelineWarning(null);
  };

  const validateQuickTimeline = () => {
    if (quickMilestones.length === 0) {
      setQuickTimelineError(null);
      setQuickTimelineWarning(null);
      return [];
    }

    let activityStartValue: string | null = null;
    let activityEndValue: string | null = null;
    if (beginDate && startTime && endDate && endTime) {
      try {
        activityStartValue = combineDateAndTime(beginDate, startTime);
        activityEndValue = combineDateAndTime(endDate, endTime);
      } catch {
        activityStartValue = null;
        activityEndValue = null;
      }
    }

    const sortedMilestones = sortTimelineByTime(
      quickMilestones.map((item, index) => ({
        ...item,
        orderIndex: index,
      }))
    );
    const issues = validateTimelineDrafts(sortedMilestones, {
      activityStartTime: activityStartValue,
      activityEndTime: activityEndValue,
      enforceActivityWindow: true,
    });

    const errorMessages = Array.from(
      new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.message))
    );
    const warningMessages = Array.from(
      new Set(issues.filter((issue) => issue.level === 'warning').map((issue) => issue.message))
    );

    setQuickTimelineError(errorMessages.length > 0 ? errorMessages[0] : null);
    setQuickTimelineWarning(warningMessages.length > 0 ? warningMessages[0] : null);

    if (hasTimelineValidationErrors(issues)) {
      return null;
    }

    return sortedMilestones.map((item, index) => ({
      ...item,
      orderIndex: index,
      status: 'upcoming' as const,
    }));
  };

  const handleOpenTimelineManagement = () => {
    if (!createdActivityId) {
      return;
    }
    navigate(`/organizer/activities?activityId=${encodeURIComponent(createdActivityId)}&tab=timeline`);
  };

  const handleSave = async (status: ActivityStatus, options?: { openTimelineAfterSave?: boolean }) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    if (!canManageActivities) {
      setError('Only organizers/admins can create activities.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!title.trim()) {
        throw new Error('Activity title is required.');
      }

      if (!streetAddress.trim()) {
        throw new Error('Street address is required.');
      }

      if (!provinceCode) {
        throw new Error('Please select a city/province.');
      }

      if (!wardCode) {
        throw new Error('Please select a ward/commune.');
      }

      if (!beginDate || !startTime || !endDate || !endTime) {
        throw new Error('Begin date, start time, end date, and end time are required.');
      }

      const startIso = combineDateAndTime(beginDate, startTime);
      const endIso = combineDateAndTime(endDate, endTime);
      if (new Date(endIso) <= new Date(startIso)) {
        throw new Error('End time must be later than start time.');
      }

      const validatedQuickTimeline = validateQuickTimeline();
      if (validatedQuickTimeline === null) {
        throw new Error('Please fix timeline milestone errors before saving this activity.');
      }

      const capacityValue = Number(capacity);
      if (!Number.isInteger(capacityValue) || capacityValue <= 0) {
        throw new Error('Volunteer capacity must be a positive integer.');
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        coverImageUrl: coverImageUrl ?? null,
        location: {
          address: streetAddress.trim(),
          city: resolvedMapLocation?.city ?? selectedProvince?.name ?? '',
          province: resolvedMapLocation?.province ?? selectedProvince?.name ?? '',
          ward: resolvedMapLocation?.ward ?? selectedWard?.name ?? '',
          formattedAddress: resolvedMapLocation?.formattedAddress ?? locationSummary ?? streetAddress.trim(),
          mapProvider: resolvedMapLocation?.mapProvider ?? null,
          geocodedAt: resolvedMapLocation?.geocodedAt ?? null,
          geocodeConfidence: resolvedMapLocation?.geocodeConfidence ?? null,
          lat: resolvedMapLocation?.lat ?? null,
          lng: resolvedMapLocation?.lng ?? null,
        },
        provinceCode,
        wardCode,
        startTime: startIso,
        endTime: endIso,
        capacity: capacityValue,
        skillRequirements: requiredSkills.map((skill) => ({ skill, priority: 'normal' as const })),
        requiredSkills,
        status,
      };

      const savedActivity = isEditing && activityId
        ? await updateActivity(activityId, payload, session.access_token)
        : await createActivity(payload, session.access_token);

      if (!isEditing && validatedQuickTimeline.length > 0) {
        const timelineResult = await replaceActivityTimeline(savedActivity.id, validatedQuickTimeline, session.access_token);
        setQuickMilestones(
          timelineResult.milestones.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            startTime: item.startTime,
            endTime: item.endTime,
            orderIndex: item.orderIndex,
            type: item.type,
            status: item.status,
          }))
        );
      }

      setCreatedActivityId(savedActivity.id);

      setSuccess(
        isEditing
          ? `Activity "${savedActivity.title}" updated successfully.`
          : `Activity "${savedActivity.title}" saved as ${savedActivity.status}.`
      );

      if (!isEditing && role === 'organizer' && options?.openTimelineAfterSave) {
        navigate(`/organizer/activities?activityId=${encodeURIComponent(savedActivity.id)}&tab=timeline`);
        return;
      }

      if (isEditing || status === 'published') {
        navigate(organizerHomePath);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OrganizerShell
      activeNav="activities"
      headerActions={
        <Button onClick={() => navigate(organizerHomePath)} type="button" variant="secondary">
          Back to Activities
        </Button>
      }
      pageSubtitle={
        isEditing
          ? 'Update the activity details, schedule, and selected location.'
          : 'Fill in the details below to launch a volunteering opportunity.'
      }
      pageTitle={isEditing ? 'Edit Activity' : 'Create New Activity'}
    >
      <section className="create-activity-page">
        <div className="create-activity-content">
          <div className="create-activity-breadcrumbs">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span>Activities</span>
            <span aria-hidden="true">/</span>
            <strong>{isEditing ? 'Edit' : 'Create'}</strong>
          </div>

          {!canManageActivities && <p className="form-error">Only organizer/admin accounts can manage activities.</p>}
          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}
          {!isEditing && success && role === 'organizer' && createdActivityId ? (
            <div className="activity-success-actions">
              <Button onClick={handleOpenTimelineManagement} type="button">
                Manage Timeline
              </Button>
              <Button
                onClick={() => navigate(`/organizer/activities?activityId=${encodeURIComponent(createdActivityId)}`)}
                type="button"
                variant="secondary"
              >
                Open Activity Management
              </Button>
            </div>
          ) : null}

          <form className="create-activity-form" onSubmit={(event) => event.preventDefault()}>
            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-blue" aria-hidden="true">
                  <Sparkles size={16} />
                </span>
                <h2>Basic Information</h2>
              </div>

              <label className="activity-field">
                <span>Activity Title</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g., Weekend Beach Cleanup"
                  type="text"
                  value={title}
                />
              </label>

              <label className="activity-field">
                <span>Description</span>
                <textarea
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the activity, goals, and what volunteers can expect..."
                  rows={4}
                  value={description}
                />
              </label>

              <div className="activity-field">
                <span>Cover Image</span>
                {coverImageUrl ? (
                  <div className="activity-cover-preview">
                    <img alt="Selected activity cover" src={coverImageUrl} />
                    <div className="activity-cover-preview__actions">
                      <label className="action-btn is-secondary activity-cover-upload-btn">
                        <input
                          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                          hidden
                          onChange={(event) => void handleCoverImageSelection(event)}
                          type="file"
                        />
                        Change image
                      </label>
                      <button className="action-btn is-ghost" onClick={() => setCoverImageUrl(null)} type="button">
                        <X size={16} />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="activity-upload" htmlFor="cover-image-upload">
                    <div className="activity-upload__icon">
                      <ImagePlus />
                    </div>
                    <strong>Upload a file</strong>
                    <p>or drag and drop (click to browse)</p>
                    <small>PNG, JPG, GIF up to 10MB</small>
                    <input
                      accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                      hidden
                      id="cover-image-upload"
                      onChange={(event) => void handleCoverImageSelection(event)}
                      type="file"
                    />
                  </label>
                )}
              </div>
            </Card>

            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-purple" aria-hidden="true">
                  <ClipboardList size={16} />
                </span>
                <h2>Requirements</h2>
              </div>

              <div className="activity-grid two-cols">
                <div className="activity-field">
                  <span>Required Skills</span>
                  <div className="activity-tag-input">
                    {requiredSkills.map((skill) => (
                      <button
                        key={skill}
                        className="activity-tag"
                        onClick={() => removeSkill(skill)}
                        type="button"
                      >
                        {skill} <span aria-hidden="true">x</span>
                      </button>
                    ))}
                    <input
                      onChange={(event) => setSkillDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="Add skill and press Enter"
                      type="text"
                      value={skillDraft}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-orange" aria-hidden="true">
                  <MapPin size={16} />
                </span>
                <h2>Logistics</h2>
              </div>

              <div className="activity-grid logistics-grid">
                <label className="activity-field">
                  <span>Date</span>
                  <input onChange={(event) => setBeginDate(event.target.value)} type="date" value={beginDate} />
                </label>
                <label className="activity-field">
                  <span>Start Time</span>
                  <input onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} />
                </label>
                <label className="activity-field">
                  <span>End Date</span>
                  <input
                    min={beginDate || currentDateTime.date}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      if (!endTimeManuallyChanged) {
                        setEndTime('23:59');
                      }
                    }}
                    type="date"
                    value={endDate}
                  />
                </label>
                <label className="activity-field">
                  <span>End Time</span>
                  <input
                    onChange={(event) => {
                      setEndTime(event.target.value);
                      setEndTimeManuallyChanged(true);
                    }}
                    type="time"
                    value={endTime}
                  />
                </label>
              </div>

              <div className="activity-grid three-cols location-grid">
                <label className="activity-field location-grid__wide">
                  <span>Street / House Number</span>
                  <input
                    onChange={(event) => setStreetAddress(event.target.value)}
                    placeholder="e.g., 123 Nguyen Hue Street"
                    type="text"
                    value={streetAddress}
                  />
                </label>

                <label className="activity-field">
                  <span>City / Province</span>
                  <select
                    disabled={loadingProvinces}
                    onChange={(event) => {
                      setProvinceCode(event.target.value);
                      setWardCode('');
                    }}
                    value={provinceCode}
                  >
                    <option value="">{loadingProvinces ? 'Loading provinces...' : 'Select city / province'}</option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code}>
                        {province.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="activity-field">
                  <span>Ward / Commune</span>
                  <select
                    disabled={!provinceCode || loadingWards}
                    onChange={(event) => setWardCode(event.target.value)}
                    value={wardCode}
                  >
                    <option value="">
                      {!provinceCode
                        ? 'Select province first'
                        : loadingWards
                          ? 'Loading wards...'
                          : 'Select ward / commune'}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.code} value={ward.code}>
                        {ward.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="activity-grid two-cols is-wide-first">
                <label className="activity-field">
                  <span>Selected location summary</span>
                  <div className="activity-location-summary" role="status">
                    {locationSummary || 'Select province, ward, and street address.'}
                  </div>
                </label>

                <label className="activity-field">
                  <span>Volunteer Capacity</span>
                  <input
                    min={1}
                    onChange={(event) => setCapacity(event.target.value)}
                    type="number"
                    value={capacity}
                  />
                </label>
              </div>

              <div className="activity-map-preview-card">
                <div className="activity-map-preview-card__head">
                  <div>
                    <strong>Map Preview</strong>
                    <p>
                      {resolvedMapLocation
                        ? hasManualPinAdjustment
                          ? 'The pin has been adjusted manually. Drag the marker again to refine it further.'
                          : resolvedMapLocation.mapProvider === 'area-preview'
                            ? 'The exact address was not found. The map is centered on the selected ward/province so you can drag the marker to the exact location.'
                          : 'The preview is synced from the geocoded activity address. Drag the marker if you need to refine the exact location.'
                        : 'Complete the address fields to load a live map preview.'}
                    </p>
                  </div>
                  <div className="activity-map-preview-card__actions">
                    {geocoding ? <span className="activity-map-preview-card__status">Locating...</span> : null}
                    {!geocoding && reverseGeocoding ? (
                      <span className="activity-map-preview-card__status">Updating address...</span>
                    ) : null}
                    {hasManualPinAdjustment ? (
                      <Button disabled={!suggestedMapLocation || geocoding} onClick={restoreSuggestedPin} type="button" variant="secondary">
                        Use geocoded pin
                      </Button>
                    ) : null}
                    <Button
                      disabled={!openMapUrl}
                      onClick={() => {
                        if (openMapUrl) {
                          window.open(openMapUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      type="button"
                      variant="secondary"
                    >
                      <ExternalLink size={16} />
                      Open in Maps
                    </Button>
                  </div>
                </div>
                <ActivityLocationMap
                  address={locationSummary || streetAddress.trim() || 'Select address, province, and ward'}
                  className="activity-map-preview-card__map"
                  compact
                  coordinates={
                    resolvedMapLocation
                      ? {
                          lat: resolvedMapLocation.lat,
                          lng: resolvedMapLocation.lng,
                        }
                      : null
                  }
                  emptyMessage="Enter a valid street address, province, and ward to load the live map preview."
                  emptyTitle="Live map preview is waiting for a complete address"
                  error={geocodeError}
                  editable={Boolean(resolvedMapLocation && !geocoding)}
                  editInstruction="Drag the marker to the exact event location. The nearest formatted address updates after you release it."
                  interactive
                  loading={geocoding}
                  onCoordinatesChange={handleManualMapSelection}
                  onCoordinatesPreviewChange={handleManualMapPreview}
                  title={title.trim() || 'Activity location preview'}
                />
                <div className="activity-map-preview-card__summary">
                  <strong>{resolvedMapLocation?.formattedAddress ?? locationSummary ?? 'No formatted address yet'}</strong>
                  <p>
                    {resolvedMapLocation
                      ? hasManualPinAdjustment
                        ? `Lat ${resolvedMapLocation.lat.toFixed(6)}, Lng ${resolvedMapLocation.lng.toFixed(6)} with a manual pin adjustment.${reverseGeocoding ? ' Reverse geocoding is updating the nearest formatted address.' : ' The typed address stays the same, only the exact map point changes.'}`
                        : resolvedMapLocation.mapProvider === 'area-preview'
                          ? `Lat ${resolvedMapLocation.lat.toFixed(6)}, Lng ${resolvedMapLocation.lng.toFixed(6)} from an area-level preview. Move the pin on the map if the village or hamlet does not have a precise geocoded point.`
                        : `Lat ${resolvedMapLocation.lat.toFixed(6)}, Lng ${resolvedMapLocation.lng.toFixed(6)} via ${resolvedMapLocation.mapProvider ?? 'geocoding provider'}.`
                      : geocodeError
                        ? 'Publishing still works, but the map preview is unavailable until the address resolves successfully.'
                        : 'The form will automatically geocode the selected address and keep those coordinates when you save or reopen this activity.'}
                  </p>
                </div>
              </div>
            </Card>

            {!isEditing && (
              <Card as="section" className="activity-card">
                <div className="activity-card__head">
                  <span className="activity-card__badge is-blue" aria-hidden="true">
                    <CalendarDays size={16} />
                  </span>
                  <h2>Event Timeline</h2>
                </div>

                <p className="muted">
                  Add timeline milestones in a dedicated modal to create, edit, and reorder detailed event flow before
                  publishing.
                </p>

                {quickTimelineError ? <p className="form-error">{quickTimelineError}</p> : null}
                {quickTimelineWarning ? <p className="activity-timeline-warning">{quickTimelineWarning}</p> : null}

                <div className="activity-timeline-actions">
                  <Button onClick={handleOpenTimelineModal} type="button" variant="secondary">
                    Open Timeline Builder
                  </Button>
                  <Button disabled={quickMilestones.length === 0} onClick={handleSkipQuickTimeline} type="button" variant="secondary">
                    Skip for now
                  </Button>
                </div>

                {quickMilestones.length === 0 ? (
                  <div className="activity-timeline-empty">
                    <p>No milestone added yet.</p>
                    <small>Open the modal to add milestones like check-in, opening, session, break, and closing.</small>
                  </div>
                ) : (
                  <div className="activity-timeline-list">
                    {sortedTimelineDrafts.map((milestone, milestoneIndex) => (
                      <article className="activity-timeline-item" key={milestone.id ?? `draft-${milestoneIndex}`}>
                        <div className="activity-timeline-item-head">
                          <strong>{safeText(milestone.title, '').trim() || `Milestone ${milestoneIndex + 1}`}</strong>
                          <TimelineStatusBadge status="upcoming" />
                        </div>
                        <small>{formatRange(toDateTimeLocalValue(milestone.startTime), toDateTimeLocalValue(milestone.endTime))}</small>
                      </article>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {!isEditing && isTimelineModalOpen ? (
              <div className="activity-timeline-modal-backdrop" onClick={() => setIsTimelineModalOpen(false)} role="presentation">
                <div className="activity-timeline-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
                  <div className="activity-timeline-modal-head">
                    <div>
                      <h3>Timeline Builder</h3>
                      <p>Create and edit detailed timeline milestones.</p>
                    </div>
                    <Button onClick={() => setIsTimelineModalOpen(false)} type="button" variant="secondary">
                      Close
                    </Button>
                  </div>

                  <div className="activity-timeline-modal-layout">
                    <aside className="activity-timeline-modal-list">
                      <Button onClick={handleAddQuickMilestone} type="button" variant="secondary">
                        + Add Event
                      </Button>
                      {sortedTimelineDrafts.map((milestone, milestoneIndex) => (
                        <button
                          className={activeTimelineDraftId === milestone.id ? 'activity-timeline-modal-item is-active' : 'activity-timeline-modal-item'}
                          key={milestone.id ?? `modal-${milestoneIndex}`}
                          onClick={() => setActiveTimelineDraftId(milestone.id ?? null)}
                          type="button"
                        >
                          <strong>{safeText(milestone.title, '').trim() || `Milestone ${milestoneIndex + 1}`}</strong>
                          <small>{formatTimelineTypeLabel(milestone.type)}</small>
                        </button>
                      ))}
                    </aside>

                    <section className="activity-timeline-modal-editor">
                      {activeTimelineDraft ? (
                        <>
                          <div className="activity-grid two-cols">
                            <label className="activity-field">
                              <span>Title</span>
                              <input
                                onChange={(event) =>
                                  handleUpdateQuickMilestone(String(activeTimelineDraft.id), 'title', event.target.value)
                                }
                                placeholder="e.g., Welcome & Opening"
                                type="text"
                                value={activeTimelineDraft.title}
                              />
                            </label>

                            <label className="activity-field">
                              <span>Type</span>
                              <select
                                onChange={(event) =>
                                  handleUpdateQuickMilestone(
                                    String(activeTimelineDraft.id),
                                    'type',
                                    event.target.value as TimelineMilestoneType
                                  )
                                }
                                value={activeTimelineDraft.type}
                              >
                                {quickTimelineTypeOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {formatTimelineTypeLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="activity-grid two-cols">
                            <label className="activity-field">
                              <span>Start time</span>
                              <input
                                onChange={(event) =>
                                  handleUpdateQuickMilestone(String(activeTimelineDraft.id), 'startTime', event.target.value)
                                }
                                type="datetime-local"
                                value={toDateTimeLocalValue(activeTimelineDraft.startTime)}
                              />
                            </label>

                            <label className="activity-field">
                              <span>End time</span>
                              <input
                                onChange={(event) =>
                                  handleUpdateQuickMilestone(String(activeTimelineDraft.id), 'endTime', event.target.value)
                                }
                                type="datetime-local"
                                value={toDateTimeLocalValue(activeTimelineDraft.endTime)}
                              />
                            </label>
                          </div>

                          <label className="activity-field">
                            <span>Description</span>
                            <textarea
                              onChange={(event) =>
                                handleUpdateQuickMilestone(String(activeTimelineDraft.id), 'description', event.target.value)
                              }
                              placeholder="Add organizer notes or instructions."
                              rows={4}
                              value={activeTimelineDraft.description}
                            />
                          </label>

                          <div className="activity-timeline-modal-editor-actions">
                            <Button onClick={() => handleRemoveQuickMilestone(String(activeTimelineDraft.id))} type="button" variant="danger">
                              Remove Event
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="activity-timeline-empty">
                          <p>No event selected.</p>
                          <small>Select an event on the left or add a new one.</small>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="activity-action-bar">
              <button className="action-btn is-ghost" onClick={() => navigate(organizerHomePath)} type="button">
                Cancel
              </button>
              <div className="activity-action-bar__right">
                {!isEditing && role === 'organizer' && (
                  <button
                    className="action-btn is-secondary"
                    disabled={saving || !canManageActivities || loadingActivity}
                    onClick={() => void handleSave('draft', { openTimelineAfterSave: true })}
                    type="button"
                  >
                    {saving ? 'Saving...' : 'Save & Manage Timeline'}
                  </button>
                )}
                <button
                  className="action-btn is-secondary"
                  disabled={saving || !canManageActivities || loadingActivity}
                  onClick={() => void handleSave('draft')}
                  type="button"
                >
                  {saving ? 'Saving...' : isEditing ? 'Save Draft Changes' : 'Save Draft'}
                </button>
                <button
                  className="action-btn is-primary"
                  disabled={saving || !canManageActivities || loadingActivity}
                  onClick={() => void handleSave('published')}
                  type="button"
                >
                  {saving ? 'Saving...' : isEditing ? 'Save & Publish Updates' : 'Save & Publish'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </OrganizerShell>
  );
}
