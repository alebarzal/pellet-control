import { useEffect, useMemo } from 'react';
import { calendarAvailable, syncCalendar, useCalendarPrefs } from '../../data/calendar';
import { calendarPlan } from '../../domain/calendar';
import { todayIso } from '../../domain/dates';
import { useStore } from '../../store/store';

/** Recoloca los eventos del calendario cada vez que cambian los datos o la preferencia. */
export function CalendarBridge() {
  const { data } = useStore();
  const prefs = useCalendarPrefs();
  const today = todayIso();
  const plan = useMemo(() => calendarPlan(data, prefs.leadDays, today), [data, prefs.leadDays, today]);
  const key = JSON.stringify(plan);

  useEffect(() => {
    if (!calendarAvailable() || !prefs.enabled || !prefs.calendarId) return;
    const id = prefs.calendarId;
    const t = setTimeout(() => void syncCalendar(id, plan).catch(() => {}), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, prefs.enabled, prefs.calendarId]);

  return null;
}
