import { getStorage, setStorage } from './storageService.js';
import { broadcastToExtension } from './notificationService.js';

// Default Native Calendar Initializer
const DEFAULT_CALENDAR = {
  id: 'cal_native',
  name: 'My Schedule',
  color: '#6366f1', // Tailwind Indigo
  provider: 'native',
  isWritable: true,
  isVisible: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_CALENDARS':
      return { calendars: await getCalendars() };

    case 'CREATE_CALENDAR':
      return createCalendar(message);

    case 'UPDATE_CALENDAR':
      return updateCalendar(message);

    case 'DELETE_CALENDAR':
      return deleteCalendar(message);

    case 'GET_CALENDAR_EVENTS':
      return { events: await getCalendarEvents(message) };

    case 'CREATE_CALENDAR_EVENT':
      return createCalendarEvent(message);

    case 'UPDATE_CALENDAR_EVENT':
      return updateCalendarEvent(message);

    case 'DELETE_CALENDAR_EVENT':
      return deleteCalendarEvent(message);

    default:
      return undefined;
  }
}

// --- Calendar CRUD Operations ---

async function getCalendars() {
  const { calendars } = await getStorage('calendars');
  if (!calendars || !Array.isArray(calendars) || calendars.length === 0) {
    // Bootstrap with default calendar if none exists
    const initialCalendars = [DEFAULT_CALENDAR];
    await setStorage({ calendars: initialCalendars });
    return initialCalendars;
  }
  return calendars;
}

async function createCalendar(message) {
  const calendars = await getCalendars();
  const id = `cal_${Date.now()}`;
  const newCalendar = {
    id,
    name: message.name || 'New Calendar',
    color: message.color || '#6366f1',
    provider: message.provider || 'native',
    providerCalendarId: message.providerCalendarId || null,
    isWritable: message.isWritable !== false,
    isVisible: message.isVisible !== false,
    syncToken: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  calendars.push(newCalendar);
  await setStorage({ calendars });
  broadcastCalendarsUpdated(calendars);
  return { success: true, calendar: newCalendar };
}

async function updateCalendar(message) {
  const calendars = await getCalendars();
  const idx = calendars.findIndex(c => c.id === message.calendarId);
  if (idx < 0) return { error: 'Calendar not found' };

  calendars[idx] = {
    ...calendars[idx],
    ...message.updates,
    updatedAt: new Date().toISOString()
  };

  await setStorage({ calendars });
  broadcastCalendarsUpdated(calendars);
  return { success: true, calendar: calendars[idx] };
}

async function deleteCalendar(message) {
  const calendars = await getCalendars();
  const filteredCalendars = calendars.filter(c => c.id !== message.calendarId);

  // Also delete all events associated with this calendar
  const { calendarEvents } = await getStorage('calendarEvents');
  const filteredEvents = (calendarEvents || []).filter(e => e.calendarId !== message.calendarId);

  await setStorage({
    calendars: filteredCalendars,
    calendarEvents: filteredEvents
  });

  broadcastCalendarsUpdated(filteredCalendars);
  broadcastEventsUpdated(filteredEvents);
  return { success: true };
}

// --- Event CRUD Operations ---

async function getCalendarEvents(message = {}) {
  const { calendarEvents } = await getStorage('calendarEvents');
  const events = calendarEvents || [];

  // Parse filtering range parameters if supplied (e.g. range boundaries for the calendar views)
  const startLimit = message.start ? new Date(message.start).getTime() : null;
  const endLimit = message.end ? new Date(message.end).getTime() : null;

  const expandedEvents = [];

  for (const event of events) {
    if (!event.rrule) {
      // Non-recurring event
      const eventStart = new Date(event.startTime).getTime();
      const eventEnd = new Date(event.endTime).getTime();

      if (startLimit && endLimit) {
        if (eventEnd >= startLimit && eventStart <= endLimit) {
          expandedEvents.push(event);
        }
      } else {
        expandedEvents.push(event);
      }
    } else {
      // Recurring event: Expand occurrences within range limits (default to 6 months boundary if range not provided)
      const rangeStart = startLimit || Date.now() - 30 * 24 * 60 * 60 * 1000;
      const rangeEnd = endLimit || Date.now() + 180 * 24 * 60 * 60 * 1000;
      const occurrences = expandRecurrence(event, rangeStart, rangeEnd);
      expandedEvents.push(...occurrences);
    }
  }

  return expandedEvents;
}

async function createCalendarEvent(message) {
  const { calendarEvents } = await getStorage('calendarEvents');
  const events = calendarEvents || [];
  const id = `evt_${Date.now()}`;

  const newEvent = {
    id,
    calendarId: message.calendarId || 'cal_native',
    title: message.title || 'Untitled Event',
    description: message.description || '',
    startTime: message.startTime,
    endTime: message.endTime,
    isAllDay: !!message.isAllDay,
    colorOverride: message.colorOverride || null,
    location: message.location || '',
    rrule: message.rrule || null,
    exdate: message.exdate || '',
    associatedFocusId: message.associatedFocusId || null,
    associatedTaskId: message.associatedTaskId || null,
    providerEventId: message.providerEventId || null,
    etag: message.etag || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  events.push(newEvent);
  await setStorage({ calendarEvents: events });
  broadcastEventsUpdated(events);
  return { success: true, event: newEvent };
}

async function updateCalendarEvent(message) {
  const { calendarEvents } = await getStorage('calendarEvents');
  const events = calendarEvents || [];
  const idx = events.findIndex(e => e.id === message.eventId);

  if (idx < 0) return { error: 'Event not found' };

  events[idx] = {
    ...events[idx],
    ...message.updates,
    updatedAt: new Date().toISOString()
  };

  await setStorage({ calendarEvents: events });
  broadcastEventsUpdated(events);
  return { success: true, event: events[idx] };
}

async function deleteCalendarEvent(message) {
  const { calendarEvents } = await getStorage('calendarEvents');
  const events = calendarEvents || [];
  const filtered = events.filter(e => e.id !== message.eventId);

  await setStorage({ calendarEvents: filtered });
  broadcastEventsUpdated(filtered);
  return { success: true };
}

// --- Recurrence Rule Expansion Engine (RFC 5545 compatible helper) ---

function expandRecurrence(event, rangeStart, rangeEnd) {
  const occurrences = [];
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const duration = end.getTime() - start.getTime();

  // Parse RRule parts
  const rules = {};
  event.rrule.split(';').forEach(part => {
    const [key, val] = part.split('=');
    if (key && val) rules[key.toUpperCase()] = val;
  });

  const freq = rules.FREQ; // DAILY, WEEKLY, MONTHLY
  const interval = parseInt(rules.INTERVAL || '1', 10);
  const count = rules.COUNT ? parseInt(rules.COUNT, 10) : null;
  const until = rules.UNTIL ? parseRRuleDate(rules.UNTIL) : null;
  const byday = rules.BYDAY ? rules.BYDAY.split(',') : null; // MO,TU,WE...

  // Parse exdates
  const exdates = new Set(
    (event.exdate || '').split(',')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => new Date(d).getTime())
  );

  let current = new Date(start.getTime());
  let iteration = 0;
  let matchesCount = 0;

  const weekdaysMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  // Loop through safety maximum occurrences or until parameters met
  while (current.getTime() <= rangeEnd) {
    iteration++;
    if (iteration > 1000) break; // Infinite loop safety guard

    if (until && current.getTime() > until.getTime()) break;
    if (count !== null && matchesCount >= count) break;

    // Check weekday filter if specified for WEEKLY rule
    let weekdayMatches = true;
    if (freq === 'WEEKLY' && byday) {
      const currentDay = current.getDay();
      weekdayMatches = byday.some(d => weekdaysMap[d.toUpperCase()] === currentDay);
    }

    if (weekdayMatches) {
      const occurrenceStart = new Date(current.getTime());
      const occurrenceEnd = new Date(current.getTime() + duration);

      // Check if it fits in range and is not excluded
      if (occurrenceEnd.getTime() >= rangeStart && !exdates.has(occurrenceStart.getTime())) {
        occurrences.push({
          ...event,
          id: `${event.id}_occ_${occurrenceStart.toISOString()}`,
          originalEventId: event.id,
          startTime: occurrenceStart.toISOString(),
          endTime: occurrenceEnd.toISOString(),
          isOccurrence: true
        });
      }
      matchesCount++;
    }

    // Increment current pointer based on frequency
    if (freq === 'DAILY') {
      current.setDate(current.getDate() + interval);
    } else if (freq === 'WEEKLY') {
      current.setDate(current.getDate() + 1); // Weekly steps day-by-day to check weekday filters, interval handled below
      if (byday) {
        // weekly check increments day-by-day. If it loops to next Sunday (or Monday), we apply interval skip
        const isStartOfWeek = current.getDay() === 1; // Monday start
        if (isStartOfWeek && interval > 1) {
          current.setDate(current.getDate() + 7 * (interval - 1));
        }
      } else {
        current.setDate(current.getDate() + 7 * interval - 1); // default standard weekly increment
      }
    } else if (freq === 'MONTHLY') {
      current.setMonth(current.getMonth() + interval);
    } else {
      break; // unsupported freq
    }
  }

  return occurrences;
}

// Parse RRule UNTIL string format: "YYYYMMDDTHHMMSSZ"
function parseRRuleDate(str) {
  if (str.length >= 8) {
    const y = str.substring(0, 4);
    const m = str.substring(4, 6);
    const d = str.substring(6, 8);
    if (str.includes('T')) {
      const h = str.substring(9, 11);
      const min = str.substring(11, 13);
      const s = str.substring(13, 15);
      return new Date(Date.UTC(y, m - 1, d, h, min, s));
    }
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

// --- Broadcast Notification Helpers ---

function broadcastCalendarsUpdated(calendars) {
  broadcastToExtension({ type: 'CALENDARS_UPDATED', calendars });
}

function broadcastEventsUpdated(events) {
  broadcastToExtension({ type: 'CALENDAR_EVENTS_UPDATED', events });
}
