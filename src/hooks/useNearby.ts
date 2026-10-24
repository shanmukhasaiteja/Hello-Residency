// Check-ins for the Nearby tab. Coordinates only ever go up to the server; what comes back
// for other people is a distance rounded to 50 m by the nearby() function.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import type { Checkin, NearbyPerson } from '../lib/types';
import type { Notify } from './useData';

const REFRESH_MS = 30_000;
export const CHECKIN_TTL_MS = 2 * 60 * 60 * 1000;

interface Options {
  notify: Notify;
  isPaused: () => boolean;
  /** Only poll while the Nearby tab is showing. */
  active: boolean;
}

export function isLive(checkin: Checkin | null, now = Date.now()): checkin is Checkin {
  return !!checkin && now - new Date(checkin.updated_at).getTime() < CHECKIN_TTL_MS;
}

/** Wraps the browser geolocation API, rounding to about 11 m before anything leaves the device. */
function locate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error("This browser can't share location. Type where you are instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Math.round(pos.coords.latitude * 1e4) / 1e4,
          lng: Math.round(pos.coords.longitude * 1e4) / 1e4,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED)
          reject(new Error('Location is blocked for this site. Allow it in your browser settings, or just type where you are.'));
        else if (err.code === err.TIMEOUT) reject(new Error("Finding your location took too long. Try again, or type where you are."));
        else reject(new Error("Couldn't find your location. Try again near a window, or type where you are."));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export function useNearby(userId: string, { notify, isPaused, active }: Options) {
  const [mine, setMine] = useState<Checkin | null>(null);
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;

  const refresh = useCallback(async () => {
    const own = await supabase.from('checkins').select('*').eq('user_id', userId).maybeSingle();
    if (own.error) {
      notifyRef.current(friendlyError(own.error), 'error');
      return;
    }
    setMine(own.data);
    if (!isLive(own.data)) {
      setPeople([]);
      setLoaded(true);
      return;
    }
    const res = await supabase.rpc('nearby');
    if (res.error) {
      notifyRef.current(friendlyError(res.error, "Couldn't load who's nearby. Try again in a moment."), 'error');
      return;
    }
    setPeople(res.data ?? []);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !pausedRef.current()) void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const checkIn = useCallback(
    async (spot: string, useLocation: boolean): Promise<boolean> => {
      const place = spot.trim() || null;
      setBusy(true);
      try {
        let coords: { lat: number | null; lng: number | null } = { lat: null, lng: null };
        if (useLocation) coords = await locate();
        if (coords.lat === null && !place) {
          notifyRef.current('Add where you are, or share your location, to check in.', 'error');
          return false;
        }
        const { error } = await supabase.from('checkins').upsert({ user_id: userId, spot: place, ...coords });
        if (error) {
          notifyRef.current(friendlyError(error), 'error');
          return false;
        }
        await refresh();
        return true;
      } catch (error) {
        notifyRef.current(friendlyError(error), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [userId, refresh],
  );

  const checkOut = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    const { error } = await supabase.from('checkins').delete().eq('user_id', userId);
    setBusy(false);
    if (error) {
      notifyRef.current(friendlyError(error), 'error');
      return false;
    }
    setMine(null);
    setPeople([]);
    return true;
  }, [userId]);

  return { mine, people, loaded, busy, refresh, checkIn, checkOut };
}

export type NearbyApi = ReturnType<typeof useNearby>;
