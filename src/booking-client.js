const API = '/api/agenda/v1';

export class AgendaClientError extends Error {
  constructor(code, status, message, uncertain = false) {
    super(message);
    this.name = 'AgendaClientError';
    this.code = code;
    this.status = status;
    this.uncertain = uncertain;
  }
}

async function request(path, { method = 'GET', body, signal, key, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AgendaClientError(
      'NETWORK_ERROR',
      0,
      'No se pudo conectar con la agenda.',
      method !== 'GET',
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AgendaClientError(
      'INVALID_RESPONSE',
      response.status,
      'La agenda no devolvió una respuesta válida.',
      method !== 'GET',
    );
  }
  if (!response.ok) {
    throw new AgendaClientError(
      data?.error?.code || data?.code || 'REQUEST_FAILED',
      response.status,
      'La agenda no pudo completar esta solicitud.',
      method !== 'GET' && response.status >= 500 && data?.error?.code !== 'CONFIGURATION_REQUIRED',
    );
  }
  if (method !== 'GET' && ![200, 201].includes(response.status)) {
    throw new AgendaClientError(
      'INVALID_RESPONSE',
      response.status,
      'No se pudo verificar el resultado.',
      true,
    );
  }
  return data;
}

function verifiedReceipt(receipt) {
  const booking = receipt?.booking;
  if (
    !['fixture', 'production'].includes(receipt?.mode) ||
    !booking ||
    typeof booking.id !== 'string' ||
    !['confirmed', 'cancelled'].includes(booking.status) ||
    !Number.isInteger(booking.version) ||
    booking.version < 1 ||
    !validDate(booking.date) ||
    !Number.isInteger(booking.startMinute) ||
    !Number.isInteger(booking.endMinute) ||
    !Number.isInteger(booking.priceMinorUnits) ||
    booking.priceMinorUnits < 0 ||
    booking.startMinute < 0 ||
    booking.endMinute > 1440 ||
    booking.endMinute <= booking.startMinute ||
    typeof booking.serviceName !== 'string' ||
    typeof booking.professionalName !== 'string' ||
    booking.currency !== 'NIO' ||
    receipt.notification !== 'disabled'
  ) {
    throw new AgendaClientError('INVALID_RESPONSE', 0, 'No se pudo verificar el resultado.', true);
  }
  return receipt;
}

export async function readCatalog(signal) {
  const catalog = await request('/catalog', { signal });
  if (
    !['fixture', 'production'].includes(catalog?.mode) ||
    !Array.isArray(catalog.services) ||
    !catalog.services.length ||
    !Array.isArray(catalog.professionals) ||
    !catalog.professionals.length ||
    !catalog.services.every(
      (service) =>
        typeof service.id === 'string' &&
        typeof service.name === 'string' &&
        typeof service.description === 'string' &&
        Number.isInteger(service.durationMinutes) &&
        Number.isInteger(service.priceMinorUnits) &&
        Array.isArray(service.professionalIds),
    ) ||
    !catalog.professionals.every(
      (professional) =>
        typeof professional.id === 'string' && typeof professional.name === 'string',
    ) ||
    !validDate(catalog.dateRange?.min) ||
    !validDate(catalog.dateRange?.max) ||
    catalog.timeZone !== 'America/Managua' ||
    catalog.currency !== 'NIO' ||
    !Number.isInteger(catalog.configVersion) ||
    catalog.configVersion < 1
  ) {
    throw new AgendaClientError(
      'INVALID_RESPONSE',
      0,
      'La agenda necesita configuración verificada.',
    );
  }
  return catalog;
}

export async function readAvailability(input, signal) {
  const query = new URLSearchParams({ serviceId: input.serviceId, date: input.date });
  if (input.professionalId && input.professionalId !== 'any')
    query.set('professionalId', input.professionalId);
  const availability = await request(`/availability?${query}`, { signal });
  if (
    availability?.date !== input.date ||
    availability.timeZone !== 'America/Managua' ||
    !Array.isArray(availability.slots) ||
    !availability.slots.every(
      (slot) =>
        Number.isInteger(slot.startMinute) &&
        Number.isInteger(slot.endMinute) &&
        slot.endMinute > slot.startMinute &&
        Array.isArray(slot.professionalIds) &&
        slot.professionalIds.length,
    )
  )
    throw new AgendaClientError('INVALID_RESPONSE', 0, 'No se pudieron verificar los horarios.');
  return availability;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function newBookingRequest(input) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return { key: newIdempotencyKey(), token, body: { ...input, managementToken: token } };
}

export async function createBooking(pending) {
  const receipt = verifiedReceipt(
    await request('/bookings', { method: 'POST', body: pending.body, key: pending.key }),
  );
  if (receipt.booking.status !== 'confirmed')
    throw new AgendaClientError('INVALID_RESPONSE', 0, 'No se pudo verificar la creación.', true);
  return receipt;
}

export async function readBooking(id, token, signal) {
  const receipt = verifiedReceipt(
    await request(`/bookings/${encodeURIComponent(id)}`, { token, signal }),
  );
  if (receipt.booking.id !== id)
    throw new AgendaClientError('INVALID_RESPONSE', 0, 'No se pudo verificar esta reserva.');
  return receipt;
}

export async function mutateBooking(id, action, body, token, key) {
  if (!['cancel', 'reschedule'].includes(action)) throw new TypeError('Invalid booking action.');
  return verifiedReceipt(
    await request(`/bookings/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body,
      token,
      key,
    }),
  );
}

export function managementUrl(id, token) {
  const url = new URL('manage.html', location.href);
  url.hash = new URLSearchParams({ id, token }).toString();
  return url.href;
}

export function consumeManagementLink() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const id = fragment.get('id');
  const token = fragment.get('token');
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id || '') &&
    /^[a-zA-Z0-9_-]{43}$/.test(token || '')
    ? { id, token }
    : null;
}

export function validDate(date) {
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function addDays(date, amount) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

export function formatDate(date, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('es-NI', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatTime(minute) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

export function formatPrice(minorUnits) {
  return `C$ ${(minorUnits / 100).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NIO`;
}

export function errorMessage(error) {
  if (error.code === 'CONFIGURATION_CHANGED')
    return 'Las condiciones de la agenda cambiaron. Volvé a revisar el servicio, precio y horario antes de confirmar.';
  if (error.code === 'CONFIGURATION_REQUIRED' || error.status === 503)
    return 'Agenda pendiente de configuración. Todavía no acepta reservas del negocio.';
  if (error.status === 401 || error.status === 403 || error.status === 404)
    return 'No se pudo acceder a esta reserva. Comprobá tu enlace de gestión.';
  if (error.status === 429)
    return 'Hay demasiados intentos. Esperá un momento antes de reintentar.';
  if (error.status === 409)
    return 'El horario o la reserva cambió. Revisá la información actualizada.';
  if (error.status === 400 || error.status === 422)
    return 'Revisá los datos y la fecha antes de continuar.';
  return 'No se pudo conectar con la agenda. Podés reintentar.';
}
