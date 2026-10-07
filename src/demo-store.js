/**
 * Synthetic browser-only demo. This file has no production agenda dependency.
 * Versions catch stale demo edits; localStorage is not an authorization boundary
 * or a multi-user database. No personal input, accounts or notifications belong here.
 */
export const DEMO_STORAGE_KEY = 'labarberia:demo:v1';
export const DEMO_TIME_ZONE = 'America/Managua';
export const SERVICES = Object.freeze([
  Object.freeze({ id: 'corte', name: 'Corte', priceNio: 200, durationMinutes: 30 }),
  Object.freeze({ id: 'barba', name: 'Barba', priceNio: 150, durationMinutes: 15 }),
  Object.freeze({ id: 'combo', name: 'Corte + barba', priceNio: 300, durationMinutes: 45 }),
]);
export const PROFESSIONALS = Object.freeze([
  Object.freeze({ id: 'demo-diego', name: 'Diego · Demo' }),
  Object.freeze({ id: 'demo-luis', name: 'Luis · Demo' }),
  Object.freeze({ id: 'demo-carlos', name: 'Carlos · Demo' }),
]);
export const DEMO_POLICY = Object.freeze({
  slotMinutes: 5,
  cleanupMinutes: 5,
  noticeMinutes: 60,
  horizonDays: 14,
  customerCutoffMinutes: 60,
  maxAppointments: 250,
  maxBlocks: 100,
});
const WEEK = [[600, 1020], [780, 1140], null, [780, 1140], [780, 1140], [600, 1140], [600, 1140]];
const MAX_STORAGE_LENGTH = 120_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEMO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const serviceFor = (id) => SERVICES.find((item) => item.id === id);
const professionalExists = (id) => PROFESSIONALS.some((item) => item.id === id);
const actorValid = (actor) => actor === undefined || actor === 'customer' || actor === 'admin';
const objectKeys = (value, allowed, required = allowed) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key)) &&
  required.every((key) => Object.hasOwn(value, key));
const validNow = (now) => now instanceof Date && Number.isFinite(now.getTime());
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;
const failure = (code, message) => ({ ok: false, error: { code, message } });

export function isValidDate(date) {
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function businessNow(now = new Date()) {
  if (!validNow(now)) throw new RangeError('Fecha inválida para la demo.');
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function addDays(date, days) {
  if (!isValidDate(date) || !integer(days, -36600, 36600)) return '';
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function dateRange(now = new Date()) {
  const min = businessNow(now).date;
  return { min, max: addDays(min, DEMO_POLICY.horizonDays) };
}

export function openingHours(date) {
  if (!isValidDate(date)) return null;
  const hours = WEEK[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return hours ? [...hours] : null;
}

// Nicaragua uses UTC−06:00 throughout the supported contemporary demo dates.
const instant = (date, minute) => Date.parse(`${date}T00:00:00-06:00`) + minute * MINUTE_MS;
const inHorizon = (date, now) => {
  const { min, max } = dateRange(now);
  return date >= min && date <= max;
};
const intervalFits = (date, start, end) => {
  const hours = openingHours(date);
  return (
    hours !== null &&
    integer(start, 0, 1435) &&
    integer(end, 5, 1440) &&
    start % 5 === 0 &&
    end % 5 === 0 &&
    start < end &&
    start >= hours[0] &&
    end <= hours[1]
  );
};
const allocationEnd = (appointment) => appointment.endMinute + DEMO_POLICY.cleanupMinutes;
const hasConflict = (state, date, professionalId, start, end, excludeId) =>
  state.appointments.some(
    (item) =>
      item.id !== excludeId &&
      item.status === 'confirmed' &&
      item.date === date &&
      item.professionalId === professionalId &&
      overlaps(start, end, item.startMinute, allocationEnd(item)),
  ) ||
  state.blocks.some(
    (item) =>
      item.id !== excludeId &&
      item.date === date &&
      item.professionalId === professionalId &&
      overlaps(start, end, item.startMinute, item.endMinute),
  );

/** Rejects unknown fields as well as malformed data: storage never accepts a customer name. */
export function isDemoState(state) {
  if (
    !objectKeys(state, ['schemaVersion', 'revision', 'nextId', 'appointments', 'blocks']) ||
    state.schemaVersion !== 1 ||
    !integer(state.revision, 0, Number.MAX_SAFE_INTEGER - 1) ||
    !integer(state.nextId, 1, Number.MAX_SAFE_INTEGER - 1) ||
    !Array.isArray(state.appointments) ||
    !Array.isArray(state.blocks) ||
    state.appointments.length > DEMO_POLICY.maxAppointments ||
    state.blocks.length > DEMO_POLICY.maxBlocks
  )
    return false;
  const ids = new Set();
  const records = [...state.appointments, ...state.blocks];
  for (const item of records) {
    const isAppointment = state.appointments.includes(item);
    const keys = [
      'id',
      'version',
      'synthetic',
      'date',
      'startMinute',
      'endMinute',
      'professionalId',
      'label',
      ...(isAppointment ? ['serviceId', 'status', 'source'] : []),
    ];
    if (
      !objectKeys(item, keys) ||
      typeof item.id !== 'string' ||
      !new RegExp(`^demo-${isAppointment ? 'appointment' : 'block'}-[1-9]\\d{0,15}$`).test(
        item.id,
      ) ||
      Number(item.id.split('-').at(-1)) >= state.nextId ||
      ids.has(item.id) ||
      !integer(item.version, 1, Number.MAX_SAFE_INTEGER - 1) ||
      item.synthetic !== true ||
      !professionalExists(item.professionalId) ||
      typeof item.label !== 'string'
    )
      return false;
    ids.add(item.id);
    if (isAppointment) {
      const service = serviceFor(item.serviceId);
      if (
        !service ||
        !['confirmed', 'cancelled'].includes(item.status) ||
        !['seed', 'client', 'admin'].includes(item.source) ||
        !/^(Cliente demo|Cita de ejemplo) [1-9]\d{0,15}$/.test(item.label) ||
        item.endMinute !== item.startMinute + service.durationMinutes ||
        !intervalFits(item.date, item.startMinute, allocationEnd(item))
      )
        return false;
    } else if (
      item.label !== 'Bloqueo demo' ||
      !intervalFits(item.date, item.startMinute, item.endMinute)
    )
      return false;
  }
  return records.every((item) =>
    item.status === 'cancelled'
      ? true
      : !hasConflict(
          state,
          item.date,
          item.professionalId,
          item.startMinute,
          item.status ? allocationEnd(item) : item.endMinute,
          item.id,
        ),
  );
}

/** Pure availability. Only a matching confirmed appointment can be excluded for a move. */
export function availableSlots(state, query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return [];
  const { date, serviceId, professionalId = 'any', actor = 'customer', now = new Date() } = query;
  if (
    query.excludeId !== undefined &&
    query.excludeAppointmentId !== undefined &&
    query.excludeId !== query.excludeAppointmentId
  )
    return [];
  const excludeAppointmentId = query.excludeAppointmentId ?? query.excludeId;
  const service = serviceFor(serviceId);
  if (
    !isDemoState(state) ||
    !validNow(now) ||
    !service ||
    !actorValid(actor) ||
    !isValidDate(date) ||
    !inHorizon(date, now) ||
    (professionalId !== 'any' && !professionalExists(professionalId))
  )
    return [];
  if (excludeAppointmentId !== undefined) {
    const original = state.appointments.find((item) => item.id === excludeAppointmentId);
    if (
      !original ||
      original.status !== 'confirmed' ||
      original.serviceId !== serviceId ||
      (actor !== 'admin' &&
        instant(original.date, original.startMinute) - now.getTime() < 60 * MINUTE_MS)
    )
      return [];
  }
  const hours = openingHours(date);
  if (!hours) return [];
  const earliest = now.getTime() + (actor === 'admin' ? 0 : DEMO_POLICY.noticeMinutes * MINUTE_MS);
  const slots = [];
  for (
    let start = hours[0];
    start + service.durationMinutes + DEMO_POLICY.cleanupMinutes <= hours[1];
    start += 5
  ) {
    if (instant(date, start) < earliest) continue;
    const end = start + service.durationMinutes;
    const professionalIds = PROFESSIONALS.filter(
      ({ id }) =>
        (professionalId === 'any' || id === professionalId) &&
        !hasConflict(
          state,
          date,
          id,
          start,
          end + DEMO_POLICY.cleanupMinutes,
          excludeAppointmentId,
        ),
    ).map(({ id }) => id);
    if (professionalIds.length) slots.push({ startMinute: start, endMinute: end, professionalIds });
  }
  return slots;
}

export function createInitialState({ now = new Date(), seed = true } = {}) {
  if (!validNow(now)) throw new RangeError('Fecha inválida para la demo.');
  const state = { schemaVersion: 1, revision: 0, nextId: 1, appointments: [], blocks: [] };
  if (!seed) return state;
  const { min, max } = dateRange(now);
  for (let date = min; date <= max; date = addDays(date, 1)) {
    const first = availableSlots(state, { date, serviceId: 'corte', now })[0];
    if (!first) continue;
    for (const [index, serviceId] of ['corte', 'barba'].entries()) {
      const id = state.nextId++;
      state.appointments.push({
        id: `demo-appointment-${id}`,
        version: 1,
        synthetic: true,
        date,
        startMinute: first.startMinute,
        endMinute: first.startMinute + serviceFor(serviceId).durationMinutes,
        professionalId: PROFESSIONALS[index].id,
        serviceId,
        status: 'confirmed',
        source: 'seed',
        label: `Cita de ejemplo ${id}`,
      });
    }
    break;
  }
  return state;
}

function checkContext(state, input, options) {
  if (!isDemoState(state))
    return failure('INVALID_STATE', 'Los datos de la demo no son válidos. Reiniciá la demo.');
  if (!validNow(options.now)) return failure('INVALID_TIME', 'La fecha actual no es válida.');
  if (state.revision >= Number.MAX_SAFE_INTEGER - 2 || state.nextId >= Number.MAX_SAFE_INTEGER - 2)
    return failure('LIMIT_REACHED', 'La demo alcanzó su límite. Reiniciala para seguir probando.');
  if (options.expectedRevision !== undefined && options.expectedRevision !== state.revision)
    return failure('STALE_STATE', 'La demo cambió. Revisá la agenda y volvé a intentar.');
  if (!actorValid(input?.actor))
    return failure('INVALID_INPUT', 'El perfil de simulación no es válido.');
  return null;
}

function checkTarget(state, id, input, now) {
  const item = state.appointments.find((entry) => entry.id === id);
  if (!item) return failure('NOT_FOUND', 'No se encontró esa cita demo.');
  if (input.expectedVersion !== item.version)
    return failure('STALE_VERSION', 'Esta cita demo cambió. Revisala antes de continuar.');
  if (item.version >= Number.MAX_SAFE_INTEGER - 2)
    return failure('LIMIT_REACHED', 'Esta cita demo alcanzó su límite de cambios.');
  if (item.status !== 'confirmed') return failure('CANCELLED', 'Esta cita demo ya está cancelada.');
  if (
    input.actor !== 'admin' &&
    instant(item.date, item.startMinute) - now.getTime() <
      DEMO_POLICY.customerCutoffMinutes * MINUTE_MS
  )
    return failure(
      'CUTOFF',
      'Los cambios de cliente requieren al menos 60 minutos de anticipación.',
    );
  if (input.actor === 'admin' && !inHorizon(item.date, now))
    return failure(
      'OUTSIDE_HORIZON',
      'La administración demo solo gestiona fechas dentro de los próximos 14 días.',
    );
  return null;
}

export function createAppointment(state, input, options = {}) {
  const context = { now: new Date(), ...options };
  const error = checkContext(state, input, context);
  if (error) return error;
  if (
    !objectKeys(
      input,
      ['date', 'startMinute', 'serviceId', 'professionalId', 'actor'],
      ['date', 'startMinute', 'serviceId', 'professionalId'],
    ) ||
    !professionalExists(input.professionalId)
  )
    return failure('INVALID_INPUT', 'Elegí servicio, profesional y horario demo válidos.');
  if (state.appointments.length >= DEMO_POLICY.maxAppointments)
    return failure('LIMIT_REACHED', 'La demo alcanzó su límite. Reiniciala para seguir probando.');
  const slot = availableSlots(state, { ...input, now: context.now }).find(
    (item) => item.startMinute === input.startMinute,
  );
  if (!slot)
    return failure(
      'UNAVAILABLE',
      'Ese horario demo ya no está disponible o está fuera de las reglas.',
    );
  const next = clone(state);
  const id = next.nextId++;
  const appointment = {
    id: `demo-appointment-${id}`,
    version: 1,
    synthetic: true,
    date: input.date,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    serviceId: input.serviceId,
    professionalId: input.professionalId,
    status: 'confirmed',
    source: input.actor === 'admin' ? 'admin' : 'client',
    label: `Cliente demo ${id}`,
  };
  next.appointments.push(appointment);
  next.revision++;
  return { ok: true, state: next, appointment: clone(appointment) };
}

export function rescheduleAppointment(state, id, input, options = {}) {
  const context = { now: new Date(), ...options };
  const error = checkContext(state, input, context);
  if (error) return error;
  if (
    !objectKeys(
      input,
      ['date', 'startMinute', 'professionalId', 'actor', 'expectedVersion'],
      ['date', 'startMinute', 'expectedVersion'],
    )
  )
    return failure('INVALID_INPUT', 'Elegí una nueva fecha y hora demo válidas.');
  const targetError = checkTarget(state, id, input, context.now);
  if (targetError) return targetError;
  const original = state.appointments.find((item) => item.id === id);
  const professionalId = input.professionalId ?? original.professionalId;
  if (!professionalExists(professionalId))
    return failure('INVALID_INPUT', 'Elegí un profesional demo válido.');
  const slot = availableSlots(state, {
    date: input.date,
    serviceId: original.serviceId,
    professionalId,
    actor: input.actor,
    excludeAppointmentId: id,
    now: context.now,
  }).find((item) => item.startMinute === input.startMinute);
  if (!slot)
    return failure(
      'UNAVAILABLE',
      'Ese nuevo horario demo ya no está disponible o está fuera de las reglas.',
    );
  const next = clone(state);
  const appointment = next.appointments.find((item) => item.id === id);
  Object.assign(appointment, {
    date: input.date,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    professionalId,
    version: appointment.version + 1,
  });
  next.revision++;
  return { ok: true, state: next, appointment: clone(appointment) };
}

export function cancelAppointment(state, id, input, options = {}) {
  const context = { now: new Date(), ...options };
  const error = checkContext(state, input, context);
  if (error) return error;
  if (!objectKeys(input, ['actor', 'expectedVersion'], ['expectedVersion']))
    return failure('INVALID_INPUT', 'La versión de la cita demo es obligatoria.');
  const targetError = checkTarget(state, id, input, context.now);
  if (targetError) return targetError;
  const next = clone(state);
  const appointment = next.appointments.find((item) => item.id === id);
  appointment.status = 'cancelled';
  appointment.version++;
  next.revision++;
  return { ok: true, state: next, appointment: clone(appointment) };
}

export function createBlock(state, input, options = {}) {
  const context = { now: new Date(), ...options };
  const error = checkContext(state, input, context);
  if (error) return error;
  if (
    !objectKeys(input, ['date', 'startMinute', 'endMinute', 'professionalId', 'actor']) ||
    input.actor !== 'admin' ||
    !professionalExists(input.professionalId)
  )
    return failure('INVALID_INPUT', 'Los bloqueos solo se prueban desde la administración demo.');
  if (
    !intervalFits(input.date, input.startMinute, input.endMinute) ||
    !inHorizon(input.date, context.now) ||
    instant(input.date, input.startMinute) < context.now.getTime()
  )
    return failure(
      'UNAVAILABLE',
      'El bloqueo demo debe estar dentro del horario y horizonte disponibles.',
    );
  if (hasConflict(state, input.date, input.professionalId, input.startMinute, input.endMinute))
    return failure('CONFLICT', 'El bloqueo se superpone con otra cita o bloqueo demo.');
  if (state.blocks.length >= DEMO_POLICY.maxBlocks)
    return failure('LIMIT_REACHED', 'La demo alcanzó su límite de bloqueos.');
  const next = clone(state);
  const block = {
    id: `demo-block-${next.nextId++}`,
    version: 1,
    synthetic: true,
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    professionalId: input.professionalId,
    label: 'Bloqueo demo',
  };
  next.blocks.push(block);
  next.revision++;
  return { ok: true, state: next, block: clone(block) };
}

export function removeBlock(state, id, input, options = {}) {
  const context = { now: new Date(), ...options };
  const error = checkContext(state, input, context);
  if (error) return error;
  if (!objectKeys(input, ['actor', 'expectedVersion']) || input.actor !== 'admin')
    return failure('INVALID_INPUT', 'Los bloqueos solo se prueban desde la administración demo.');
  const block = state.blocks.find((item) => item.id === id);
  if (!block) return failure('NOT_FOUND', 'No se encontró ese bloqueo demo.');
  if (block.version !== input.expectedVersion)
    return failure('STALE_VERSION', 'El bloqueo demo cambió.');
  if (!inHorizon(block.date, context.now))
    return failure('OUTSIDE_HORIZON', 'Ese bloqueo está fuera del horizonte demo.');
  const next = clone(state);
  next.blocks = next.blocks.filter((item) => item.id !== id);
  next.revision++;
  return { ok: true, state: next, block: clone(block) };
}

function parseStorage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_STORAGE_LENGTH) return null;
  try {
    const parsed = JSON.parse(raw);
    return isDemoState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Small persistence adapter. Only the dedicated demo key is ever read or written. */
export function createDemoStore(options = {}) {
  const now = options.now ?? (() => new Date());
  let storage = null;
  let status = {
    mode: 'memory',
    recovered: false,
    message: 'Demo temporal: los cambios solo duran en esta pestaña.',
  };
  let state;
  let lastRaw = null;
  try {
    storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      lastRaw = storage.getItem(DEMO_STORAGE_KEY);
      state = parseStorage(lastRaw);
      status = {
        mode: 'local',
        recovered: lastRaw !== null && !state,
        message: 'Datos ficticios guardados solo en este navegador.',
      };
      if (status.recovered)
        status.message =
          'Se recuperó la demo con ejemplos nuevos porque sus datos locales no eran válidos.';
    } else storage = null;
  } catch {
    storage = null;
  }
  const useMemory = () => {
    storage = null;
    status = {
      ...status,
      mode: 'memory',
      message: 'El navegador no permite guardar la demo. Los cambios duran solo en esta pestaña.',
    };
  };
  const save = () => {
    if (!storage) return;
    try {
      lastRaw = JSON.stringify(state);
      storage.setItem(DEMO_STORAGE_KEY, lastRaw);
    } catch {
      useMemory();
    }
  };
  if (!state) {
    state = createInitialState({ now: now() });
    save();
  }
  const synchronize = () => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(DEMO_STORAGE_KEY);
      if (raw === lastRaw) return null;
      const loaded = parseStorage(raw);
      state = loaded ?? createInitialState({ now: now() });
      lastRaw = raw;
      if (!loaded) {
        status.recovered = raw !== null;
        status.message =
          'La demo local se reinició. Revisá los nuevos ejemplos antes de continuar.';
        save();
      }
      return failure(
        'STALE_STATE',
        'La demo cambió en otra pestaña. Revisá la agenda y volvé a intentar.',
      );
    } catch {
      useMemory();
      return null;
    }
  };
  const mutate = (operation, args) => {
    const error = synchronize();
    if (error) return error;
    const result = operation(state, ...args, { now: now(), expectedRevision: state.revision });
    if (result.ok) {
      state = result.state;
      save();
      return clone(result);
    }
    return result;
  };
  return {
    getState: () => clone(state),
    refresh: () => {
      synchronize();
      return clone(state);
    },
    getStatus: () => ({ ...status, persistence: status.mode }),
    availableSlots: (query) => availableSlots(state, { ...query, now: now() }),
    create: (input) => mutate(createAppointment, [input]),
    reschedule: (id, input) => mutate(rescheduleAppointment, [id, input]),
    cancel: (id, input) => mutate(cancelAppointment, [id, input]),
    block: (input) => mutate(createBlock, [input]),
    unblock: (id, input) => mutate(removeBlock, [id, input]),
    reset: () => {
      state = createInitialState({ now: now() });
      status.recovered = false;
      if (storage) status.message = 'Datos ficticios guardados solo en este navegador.';
      save();
      return { ok: true, state: clone(state) };
    },
  };
}
