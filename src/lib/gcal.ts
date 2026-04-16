interface GCalParams {
  title: string;
  /** JST datetime string: 'YYYY-MM-DDTHH:mm:ss' */
  startJst: string;
  /** JST datetime string: 'YYYY-MM-DDTHH:mm:ss' */
  endJst: string;
  description?: string;
  location?: string;
  /** RRULE（繰り返し用）例: 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8' */
  recur?: string;
}

export function buildGoogleCalendarUrl(params: GCalParams): string {
  const toUtcCompact = (jst: string) => {
    // jst: '2026-04-20T10:00:00' (JST) → UTC: '20260420T010000Z'
    const d = new Date(jst + '+09:00');
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', params.title);
  url.searchParams.set('dates', `${toUtcCompact(params.startJst)}/${toUtcCompact(params.endJst)}`);
  if (params.description) url.searchParams.set('details', params.description);
  if (params.location) url.searchParams.set('location', params.location);
  if (params.recur) url.searchParams.set('recur', params.recur);
  return url.toString();
}

const DAY_OF_WEEK_TO_RRULE: Record<string, string> = {
  SUN: 'SU', MON: 'MO', TUE: 'TU', WED: 'WE', THU: 'TH', FRI: 'FR', SAT: 'SA',
};

export function buildWeeklyRecurRule(dayOfWeek: string, count: number): string {
  const byDay = DAY_OF_WEEK_TO_RRULE[dayOfWeek] || 'MO';
  return `RRULE:FREQ=WEEKLY;BYDAY=${byDay};COUNT=${Math.max(1, count)}`;
}
