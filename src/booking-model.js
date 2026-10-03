// Every service, professional and occupied interval here is fictional demo data.
// The weekly opening bounds come from the dated schedule already shown on the site.
export const TIME_ZONE = 'America/Managua';
export const SERVICES = [
  {
    id: 'cut',
    name: 'Corte clásico',
    description: 'Un corte a tu estilo.',
    duration: 30,
    price: 200,
  },
  {
    id: 'beard',
    name: 'Barba',
    description: 'Forma y contorno para tu barba.',
    duration: 20,
    price: 150,
  },
  {
    id: 'combo',
    name: 'Corte + barba',
    description: 'Los dos en una misma visita.',
    duration: 50,
    price: 300,
  },
];
export const BARBERS = [
  { id: 'a', name: 'Profesional A', label: 'Profesional A · demo' },
  { id: 'b', name: 'Profesional B', label: 'Profesional B · demo' },
];
export const WEEKLY_HOURS = [
  [600, 1020],
  [780, 1140],
  null,
  [780, 1140],
  [780, 1140],
  [600, 1140],
  [600, 1140],
];
export const HORIZON = 21;

export function businessNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function isDateKey(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}

export function addDays(date, amount) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

export function dateRange(now = new Date()) {
  const today = businessNow(now).date;
  return { min: today, max: addDays(today, HORIZON - 1) };
}

export function openingHours(date) {
  return isDateKey(date) ? WEEKLY_HOURS[new Date(`${date}T12:00:00Z`).getUTCDay()] : null;
}

export function mockOccupations(date, barberId) {
  // A fully occupied Thursday gives the demo a reproducible no-slots state.
  // This does not describe the business's actual appointments or staff.
  const hours = openingHours(date);
  if (!hours) return [];
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 4) return [hours];
  return barberId === 'a'
    ? [
        [660, 720],
        [840, 900],
        [990, 1020],
      ]
    : [
        [630, 690],
        [810, 870],
        [1020, 1090],
      ];
}

export function availableSlots({ date, serviceId, barberId = 'any', now = new Date() }) {
  const service = SERVICES.find(({ id }) => id === serviceId);
  const range = dateRange(now);
  const hours = openingHours(date);
  if (!service || !hours || date < range.min || date > range.max) return [];
  const professionals = barberId === 'any' ? BARBERS : BARBERS.filter(({ id }) => id === barberId);
  const localNow = businessNow(now);
  const slots = [];
  for (let start = hours[0]; start + service.duration <= hours[1]; start += 15) {
    if (date === localNow.date && start <= localNow.minute) continue;
    const end = start + service.duration;
    const free = professionals.filter(({ id }) =>
      mockOccupations(date, id).every(
        ([busyStart, busyEnd]) => end <= busyStart || start >= busyEnd,
      ),
    );
    if (free.length) slots.push({ start, end, barberIds: free.map(({ id }) => id) });
  }
  return slots;
}

export function nextAvailableDate({ date, serviceId, barberId, now = new Date() }) {
  const range = dateRange(now);
  for (
    let candidate = addDays(date, 1);
    candidate <= range.max;
    candidate = addDays(candidate, 1)
  ) {
    if (availableSlots({ date: candidate, serviceId, barberId, now }).length) return candidate;
  }
  return null;
}

export function formatTime(minute) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

export function formatDate(date, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('es-NI', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
