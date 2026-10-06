import {
  mutationReloadGuard,
  reloadRecoveryMessage,
  reloadStorageMessage,
} from './booking-client.js';

const API = '/api/agenda/v1';
const byId = (id) => document.getElementById(id);
const dialog = byId('manage-dialog');
const reloadGuard = mutationReloadGuard('admin');
let recoveryBlocked = reloadGuard.status() !== 'clear';
const state = {
  catalog: null,
  session: null,
  absences: [],
  bookings: [],
  blocks: [],
  managed: null,
  opener: null,
  readController: null,
  catalogController: null,
  operation: null,
};

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const errorMessages = {
  SLOT_UNAVAILABLE: 'Ese horario está ocupado. Elegí otro horario; la cita anterior se conserva.',
  VERSION_CONFLICT:
    'Esta entrada cambió. Cerrá esta ventana y actualizá la agenda antes de editarla.',
  IDEMPOTENCY_CONFLICT:
    'El contenido de este intento cambió. Actualizá la agenda antes de continuar.',
  RECOVERY_UNAVAILABLE: reloadStorageMessage,
  CONFIGURATION_CHANGED: 'La configuración cambió. Actualizá la agenda antes de continuar.',
  RATE_LIMITED: 'Hay demasiados intentos. Esperá un momento antes de volver a intentar.',
  INVALID_INPUT: 'Revisá los campos y el horario de la acción.',
  VALIDATION_ERROR: 'Revisá los campos y el horario de la acción.',
  BOOKING_NOT_FOUND: 'Esta cita ya no está disponible. Actualizá la agenda.',
  BLOCK_NOT_FOUND: 'Este bloqueo ya no está disponible. Actualizá la agenda.',
  ABSENCE_NOT_FOUND: 'Esta ausencia ya no está disponible. Actualizá la agenda.',
  ABSENCE_CONFLICT: 'Ya hay una ausencia en ese período. Revisá las ausencias de la agenda.',
};

function canManageShop() {
  return state.session?.role === 'owner' && state.session.capabilities.manageShop === true;
}

function canReportAbsence() {
  return state.session?.capabilities.reportAbsence === true;
}

function canManageEntry(kind, entry) {
  return kind === 'absence'
    ? canReportAbsence() &&
        (canManageShop() || entry.professionalId === state.session?.professionalId)
    : canManageShop();
}

function safeMessage(error) {
  if (errorMessages[error.code]) return errorMessages[error.code];
  if (error.status === 429) return errorMessages.RATE_LIMITED;
  if (error.status === 400 || error.status === 422) return errorMessages.INVALID_INPUT;
  if (error.status === 409)
    return 'La agenda cambió o el horario está ocupado. Actualizá e intentá de nuevo.';
  if (error.status === 0)
    return 'No se pudo confirmar el resultado. La acción original se conserva; reintentá esa misma acción antes de hacer cambios.';
  return 'No se pudo completar la acción. Revisá tu conexión e intentá de nuevo.';
}

function announce(message) {
  byId('agenda-status').textContent = message;
}

function feedback(id, message) {
  const element = byId(id);
  element.textContent = message;
  element.hidden = !message;
}

function setLocked(error) {
  state.catalogController?.abort();
  state.readController?.abort();
  state.catalog = null;
  state.session = null;
  state.absences = [];
  state.bookings = [];
  state.blocks = [];
  state.managed = null;
  byId('booking-list').replaceChildren();
  byId('block-list').replaceChildren();
  byId('absence-list').replaceChildren();
  byId('absence-form').reset();
  byId('role-label').textContent = '';
  byId('role-title').textContent = '';
  byId('role-description').textContent = '';
  byId('walkin-form').reset();
  byId('block-form').reset();
  byId('reschedule-form').reset();
  byId('manage-summary').textContent = '';
  byId('manage-customer').textContent = '';
  byId('manage-mode').textContent = '';
  byId('admin-workspace').hidden = true;
  byId('mode-notice').hidden = true;
  byId('mode-notice').textContent = '';
  byId('access-panel').hidden = false;
  if (dialog.open) dialog.close();
  if (error?.status === 401 || error?.status === 403) {
    byId('access-title').textContent = 'Acceso administrativo pendiente o no autorizado';
    byId('access-description').textContent =
      'El servidor debe verificar tu identidad y el permiso del propietario. Este panel no concede acceso por abrirlo.';
    announce('No se muestran datos de clientes. El acceso administrativo no está autorizado.');
  } else if (error?.status === 503) {
    byId('access-title').textContent = 'Agenda pendiente de configuración';
    byId('access-description').textContent =
      'Falta una configuración verificada del negocio o del acceso administrativo. No se pueden registrar reservas.';
    announce('La agenda no está disponible. Las acciones están deshabilitadas.');
  } else {
    byId('access-title').textContent = 'No se pudo comprobar el acceso';
    byId('access-description').textContent =
      'Revisá tu conexión y usá Actualizar para volver a consultar la agenda.';
    announce('La agenda no está disponible en este momento.');
  }
  renderPendingOperation();
}

function locksWorkspace(error) {
  return error instanceof ApiError && [401, 403, 503].includes(error.status);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
      referrerPolicy: 'no-referrer',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status || 500, 'INVALID_RESPONSE');
  }
  if (!response.ok) throw new ApiError(response.status, payload?.error?.code || 'REQUEST_FAILED');
  return payload;
}

function pendingPanel(id, buttonId) {
  const panel = document.createElement('div');
  panel.id = id;
  panel.className = 'form-feedback';
  panel.hidden = true;
  const message = document.createElement('p');
  const button = document.createElement('button');
  button.id = buttonId;
  button.type = 'button';
  button.className = 'button button-secondary';
  button.textContent = 'Reintentar acción pendiente';
  button.addEventListener('click', () => {
    const operation = state.operation;
    if (state.catalog && operation && !operation.inFlight) void operation.retry();
  });
  panel.append(message, button);
  return panel;
}

document.querySelector('.status-row').after(pendingPanel('pending-operation', 'retry-operation'));
byId('manage-feedback').after(pendingPanel('manage-pending-operation', 'retry-manage-operation'));

function restorePendingFields(operation) {
  const body = JSON.parse(operation.serialized);
  const values =
    operation.formId === 'walkin-form'
      ? {
          'walkin-service': body.serviceId,
          'walkin-professional': body.professionalId,
          'walkin-date': body.date,
          'walkin-time': formatTime(body.startMinute),
          'walkin-name': body.customer?.displayName || '',
        }
      : operation.formId === 'block-form'
        ? {
            'block-professional': body.professionalId,
            'block-date': body.date,
            'block-start': formatTime(body.startMinute),
            'block-end': formatTime(body.endMinute),
            'block-label': body.label,
          }
        : operation.formId === 'absence-form'
          ? {
              'absence-professional': body.professionalId,
              'absence-start-date': body.startDate,
              'absence-start-time': formatTime(body.startMinute),
              'absence-end-date': body.endDate,
              'absence-end-time': formatTime(body.endMinute),
              'absence-reason': body.reason || '',
            }
          : operation.formId === 'reschedule-form' &&
              operation.path.includes(
                `/bookings/${encodeURIComponent(state.managed?.entry.id || '')}/`,
              )
            ? {
                'reschedule-professional': body.professionalId,
                'reschedule-date': body.date,
                'reschedule-time': formatTime(body.startMinute),
              }
            : {};
  for (const [id, value] of Object.entries(values)) byId(id).value = value;
}

function renderPendingOperation() {
  const operation = state.operation;
  const blocked = Boolean(operation) || recoveryBlocked;
  for (const id of ['walkin-form', 'block-form', 'reschedule-form', 'absence-form']) {
    for (const control of byId(id).querySelectorAll('input, select, button[type="submit"]'))
      control.disabled =
        blocked ||
        (id === 'absence-form'
          ? !canReportAbsence() || (control.id === 'absence-professional' && !canManageShop())
          : !canManageShop());
  }
  for (const id of ['request-cancel', 'confirm-cancel', 'refresh-manage'])
    byId(id).disabled =
      blocked || !state.managed || !canManageEntry(state.managed.kind, state.managed.entry);
  byId('export-agenda').disabled = blocked || !canManageShop();
  for (const id of ['pending-operation', 'manage-pending-operation']) {
    const panel = byId(id);
    panel.hidden = !blocked;
    panel.querySelector('p').textContent = recoveryBlocked
      ? reloadGuard.status() === 'unavailable'
        ? reloadStorageMessage
        : reloadRecoveryMessage
      : !operation
        ? ''
        : operation.inFlight
          ? 'Confirmando la acción original. Los formularios están bloqueados hasta conocer el resultado.'
          : 'Hay una acción pendiente de confirmar. Su horario, datos y clave se conservan. Reintentá esa misma acción antes de hacer cambios; cerrar el diálogo o actualizar la lista no la descarta. No recargués la página: se perderá el intento en memoria y las nuevas acciones quedarán bloqueadas.';
    const button = panel.querySelector('button');
    button.hidden = !state.catalog || recoveryBlocked;
    button.disabled = recoveryBlocked || !operation || operation.inFlight || !state.catalog;
  }
  if (operation && state.catalog && !byId('admin-workspace').hidden)
    restorePendingFields(operation);
}

function createOperation(path, body, formId = null) {
  if (state.operation || recoveryBlocked) throw new ApiError(409, 'OPERATION_PENDING');
  if (reloadGuard.status() !== 'clear') {
    recoveryBlocked = true;
    renderPendingOperation();
    return null;
  }
  const operation = {
    path,
    serialized: JSON.stringify(body),
    key: crypto.randomUUID(),
    mode: state.catalog.mode,
    formId,
    uncertain: false,
    inFlight: false,
    retry: null,
  };
  state.operation = operation;
  return operation;
}

function isConfirmedAbsence(operation, entry, body) {
  const revoked = operation.path.match(/^\/admin\/absences\/([^/]+)\/revoke$/);
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    !entry.id ||
    entry.status !== (revoked ? 'revoked' : 'active') ||
    !Number.isInteger(entry.version) ||
    entry.version !== (revoked ? body.expectedVersion + 1 : 1) ||
    (revoked && entry.id !== decodeURIComponent(revoked[1])) ||
    typeof entry.professionalId !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.endDate) ||
    !Number.isInteger(entry.startMinute) ||
    entry.startMinute < 0 ||
    entry.startMinute >= 1440 ||
    !Number.isInteger(entry.endMinute) ||
    entry.endMinute < 0 ||
    entry.endMinute > 1440 ||
    entry.endDate < entry.startDate ||
    (entry.endDate === entry.startDate && entry.endMinute <= entry.startMinute) ||
    entry.timeZone !== 'America/Managua' ||
    !Array.isArray(entry.affectedBookingIds) ||
    !entry.affectedBookingIds.every((id) => typeof id === 'string') ||
    !['none', 'requires-resolution'].includes(entry.resolution)
  )
    return false;
  return (
    Boolean(revoked) ||
    ['professionalId', 'startDate', 'startMinute', 'endDate', 'endMinute'].every(
      (key) => entry[key] === body[key],
    )
  );
}

function isConfirmedResult(operation, result) {
  const body = JSON.parse(operation.serialized);
  if (operation.path === '/admin/absences' || operation.path.startsWith('/admin/absences/'))
    return isConfirmedAbsence(operation, result, body);
  const block = operation.path === '/admin/blocks' || operation.path.startsWith('/admin/blocks/');
  const entry = block ? result : result?.booking;
  const action = operation.path.match(
    /\/admin\/(?:bookings|blocks)\/([^/]+)\/(cancel|reschedule)$/,
  );
  const status = action?.[2] === 'cancel' ? 'cancelled' : block ? 'active' : 'confirmed';
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    !entry.id ||
    entry.status !== status ||
    !Number.isInteger(entry.version) ||
    entry.version !== (action ? body.expectedVersion + 1 : 1) ||
    (action && entry.id !== decodeURIComponent(action[1])) ||
    typeof entry.professionalId !== 'string' ||
    typeof entry.date !== 'string' ||
    !Number.isInteger(entry.startMinute) ||
    !Number.isInteger(entry.endMinute) ||
    entry.startMinute < 0 ||
    entry.endMinute <= entry.startMinute ||
    entry.endMinute > 1440
  )
    return false;
  if (block) return typeof entry.label === 'string';
  return (
    result.mode === operation.mode &&
    result.notification === 'disabled' &&
    ['token', 'admin-only'].includes(result.customerManagement) &&
    ['booking', 'walk-in'].includes(entry.kind) &&
    typeof entry.serviceName === 'string' &&
    typeof entry.professionalName === 'string' &&
    entry.currency === 'NIO' &&
    Number.isInteger(entry.durationMinutes) &&
    entry.durationMinutes > 0 &&
    Number.isInteger(entry.priceMinorUnits) &&
    entry.priceMinorUnits >= 0
  );
}

async function mutation(operation) {
  if (state.operation !== operation || operation.inFlight)
    throw new ApiError(409, 'OPERATION_PENDING');
  if (!reloadGuard.arm()) {
    if (!operation.uncertain) state.operation = null;
    throw new ApiError(409, 'RECOVERY_UNAVAILABLE');
  }
  operation.inFlight = true;
  renderPendingOperation();
  try {
    const result = await request(operation.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operation.key },
      body: operation.serialized,
    });
    if (!isConfirmedResult(operation, result)) throw new ApiError(200, 'INVALID_RESPONSE');
    reloadGuard.clear();
    state.operation = null;
    return result;
  } catch (error) {
    // An absent/malformed/5xx response does not prove the transaction rolled back.
    // Once uncertain, only the exact successful replay resolves this operation.
    if (
      operation.uncertain ||
      error.status === 0 ||
      error.status >= 500 ||
      error.code === 'INVALID_RESPONSE'
    )
      operation.uncertain = true;
    else {
      reloadGuard.clear();
      state.operation = null;
    }
    throw error;
  } finally {
    operation.inFlight = false;
    renderPendingOperation();
  }
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function setProfessionalOptions(select, ids, selectedId = '') {
  const professionals = state.catalog.professionals.filter((professional) =>
    ids.includes(professional.id),
  );
  select.replaceChildren(
    ...professionals.map((professional) => option(professional.id, professional.name)),
  );
  if (professionals.some((professional) => professional.id === selectedId))
    select.value = selectedId;
}

function formatMoney(minorUnits) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    currencyDisplay: 'symbol',
  }).format(minorUnits / 100);
}

function formatTime(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})(?::00)?$/.exec(value);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : NaN;
}

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const find = (type) => parts.find((part) => part.type === type).value;
  return `${find('year')}-${find('month')}-${find('day')}`;
}

function validFormDate(date) {
  const { min, max } = state.catalog.dateRange;
  return date >= min && date <= max ? date : min;
}

function configureFormDates({ preserveValues = false } = {}) {
  const selectedDate = validFormDate(byId('schedule-date').value);
  for (const id of [
    'walkin-date',
    'block-date',
    'reschedule-date',
    'absence-start-date',
    'absence-end-date',
  ]) {
    const input = byId(id);
    input.min = state.catalog.dateRange.min;
    input.max = state.catalog.dateRange.max;
    input.value = preserveValues && input.value ? validFormDate(input.value) : selectedDate;
  }
  for (const id of [
    'walkin-time',
    'block-start',
    'block-end',
    'absence-start-time',
    'absence-end-time',
  ])
    byId(id).step = '60';
  byId('reschedule-time').step = String(state.catalog.slotStepMinutes * 60);
}

function updateWalkinService() {
  if (!state.catalog) return;
  const service = state.catalog.services.find((entry) => entry.id === byId('walkin-service').value);
  if (!service) return;
  setProfessionalOptions(
    byId('walkin-professional'),
    service.professionalIds,
    byId('walkin-professional').value,
  );
  byId('walkin-service-hint').textContent =
    `${service.durationMinutes} minutos · ${formatMoney(service.priceMinorUnits)}` +
    (state.catalog.mode === 'fixture' ? ' · Datos ficticios' : '');
  feedback('walkin-feedback', '');
}

function configureWorkspace() {
  const { catalog } = state;
  const owner = canManageShop();
  const professionals = owner
    ? catalog.professionals
    : catalog.professionals.filter(
        (professional) => professional.id === state.session.professionalId,
      );
  const professionalIds = professionals.map((professional) => professional.id);
  for (const panel of document.querySelectorAll('[data-owner-only]')) panel.hidden = !owner;
  byId('absence-panel').hidden = !canReportAbsence();
  byId('report-absence-link').hidden = !canReportAbsence();
  byId('role-label').textContent = owner ? 'Acceso de propietario' : 'Acceso de barbero';
  byId('role-title').textContent = owner
    ? 'Tu equipo y su agenda'
    : professionals[0]?.name || 'Mi agenda';
  byId('role-description').textContent = owner
    ? 'Gestioná todas las citas y las ausencias temporales del equipo.'
    : 'Ves únicamente tu agenda. Podés reportar y retirar tus ausencias; el propietario gestiona los cambios en las citas.';
  byId('schedule-title').textContent = owner ? 'El día en la barbería' : 'Mi agenda del día';
  const filter = byId('schedule-professional');
  const selectedId = filter.value;
  filter.replaceChildren(
    ...(owner ? [option('', 'Todos los profesionales')] : []),
    ...professionals.map((professional) => option(professional.id, professional.name)),
  );
  if (professionalIds.includes(selectedId)) filter.value = selectedId;
  filter.disabled = !owner;
  setProfessionalOptions(
    byId('absence-professional'),
    professionalIds,
    byId('absence-professional').value,
  );
  const serviceSelect = byId('walkin-service');
  const selectedService = serviceSelect.value;
  serviceSelect.replaceChildren(
    ...catalog.services.map((service) => option(service.id, service.name)),
  );
  if (catalog.services.some((service) => service.id === selectedService))
    serviceSelect.value = selectedService;
  setProfessionalOptions(
    byId('block-professional'),
    professionalIds,
    byId('block-professional').value,
  );
  byId('schedule-date').value ||= validFormDate(localDate());
  configureFormDates({ preserveValues: true });
  updateWalkinService();
  const notice = byId('mode-notice');
  notice.textContent =
    catalog.mode === 'fixture'
      ? 'PRUEBA LOCAL · Servicios, precios, profesionales y reservas ficticios. Se guardan solo en la agenda de prueba. No se envían correos ni mensajes.'
      : 'Agenda configurada · Las acciones se guardan en la agenda. El envío de correos y mensajes está desactivado.';
}

function paragraph(text, className = '') {
  const element = document.createElement('p');
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderBookings() {
  const elements = state.bookings
    .toSorted(
      (left, right) => left.startMinute - right.startMinute || left.id.localeCompare(right.id),
    )
    .map((booking) => {
      const item = document.createElement('li');
      const article = document.createElement('article');
      article.className = `entry${booking.status === 'cancelled' ? ' entry-cancelled' : ''}`;
      const title = document.createElement('h4');
      title.textContent = `${formatTime(booking.startMinute)} · ${booking.serviceName}`;
      article.append(
        title,
        paragraph(booking.professionalName),
        paragraph(
          `${formatTime(booking.startMinute)}–${formatTime(booking.endMinute)} · ${booking.durationMinutes} min · ${formatMoney(booking.priceMinorUnits)}`,
        ),
      );
      if (booking.customerDisplayName)
        article.append(paragraph(`Cliente: ${booking.customerDisplayName}`));
      const status = booking.status === 'cancelled' ? 'Cancelada' : 'Confirmada';
      article.append(
        paragraph(
          `${booking.kind === 'walk-in' ? 'Entrada sin reserva' : 'Cita'} · ${status}` +
            (state.catalog.mode === 'fixture' ? ' · Ficticia' : ''),
          'entry-status',
        ),
      );
      if (
        booking.status === 'confirmed' &&
        state.absences.some(
          (absence) =>
            absence.status === 'active' && absence.affectedBookingIds.includes(booking.id),
        )
      ) {
        article.append(
          paragraph(
            'Coincidía con una ausencia al reportarla. Revisá el horario actual; la cita sigue confirmada.',
            'resolution-notice',
          ),
        );
      }
      if (booking.status === 'confirmed' && canManageShop()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = 'Gestionar cita';
        button.setAttribute(
          'aria-label',
          `Gestionar cita de ${booking.serviceName}, ${formatTime(booking.startMinute)}, ${booking.professionalName}`,
        );
        button.addEventListener('click', () => openManager('booking', booking, button));
        article.append(button);
      }
      item.append(article);
      return item;
    });
  byId('booking-list').replaceChildren(...elements);
  byId('bookings-empty').hidden = elements.length !== 0;
}

function renderBlocks() {
  const elements = state.blocks
    .toSorted(
      (left, right) => left.startMinute - right.startMinute || left.id.localeCompare(right.id),
    )
    .map((block) => {
      const item = document.createElement('li');
      const article = document.createElement('article');
      article.className = `entry${block.status === 'cancelled' ? ' entry-cancelled' : ''}`;
      const title = document.createElement('h4');
      title.textContent = `${formatTime(block.startMinute)}–${formatTime(block.endMinute)} · ${block.label}`;
      const professional = state.catalog.professionals.find(
        (entry) => entry.id === block.professionalId,
      );
      article.append(
        title,
        paragraph(professional?.name || 'Profesional'),
        paragraph(
          block.status === 'active' ? 'Bloqueo activo' : 'Bloqueo retirado',
          'entry-status',
        ),
      );
      if (block.status === 'active' && canManageShop()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = 'Quitar bloqueo';
        button.setAttribute(
          'aria-label',
          `Quitar bloqueo ${block.label}, ${formatTime(block.startMinute)}`,
        );
        button.addEventListener('click', () => openManager('block', block, button));
        article.append(button);
      }
      item.append(article);
      return item;
    });
  byId('block-list').replaceChildren(...elements);
  byId('blocks-empty').hidden = elements.length !== 0;
}

function absenceRange(entry) {
  return `${entry.startDate} ${formatTime(entry.startMinute)} → ${entry.endDate} ${formatTime(entry.endMinute)} · America/Managua`;
}

function renderAbsences() {
  const elements = state.absences
    .toSorted(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) || left.startMinute - right.startMinute,
    )
    .map((absence) => {
      const item = document.createElement('li');
      const article = document.createElement('article');
      article.className = `entry${absence.status === 'revoked' ? ' entry-cancelled' : ''}`;
      const title = document.createElement('h4');
      const professional = state.catalog.professionals.find(
        (entry) => entry.id === absence.professionalId,
      );
      title.textContent = professional?.name || 'Profesional';
      article.append(
        title,
        paragraph(absenceRange(absence)),
        paragraph(
          absence.status === 'active'
            ? 'Ausencia activa · Sin nuevas citas en este período'
            : 'Ausencia retirada',
          'entry-status',
        ),
      );
      if (absence.reason) article.append(paragraph(`Motivo: ${absence.reason}`));
      if (absence.status === 'revoked')
        article.append(
          paragraph('Retirar la ausencia no cambia las citas existentes.', 'field-hint'),
        );
      if (absence.resolution === 'requires-resolution')
        article.append(
          paragraph(
            `${absence.affectedBookingIds.length} cita(s) coincidían al reportar y se señalaron para revisión del propietario. Revisá su estado actual; no se modificaron automáticamente.`,
            'resolution-notice',
          ),
        );
      if (absence.status === 'active' && canManageEntry('absence', absence)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = 'Retirar ausencia';
        button.setAttribute(
          'aria-label',
          `Retirar ausencia de ${professional?.name || 'profesional'}, ${absence.startDate}`,
        );
        button.addEventListener('click', () => openManager('absence', absence, button));
        article.append(button);
      }
      item.append(article);
      return item;
    });
  byId('absence-list').replaceChildren(...elements);
  byId('absences-empty').hidden = elements.length !== 0;
}

async function loadSchedule({ announceResult = true } = {}) {
  if (!state.catalog) return false;
  state.readController?.abort();
  const controller = new AbortController();
  state.readController = controller;
  const content = byId('schedule-content');
  content.setAttribute('aria-busy', 'true');
  content.hidden = true;
  const query = new URLSearchParams({
    date: byId('schedule-date').value,
    includeCancelled: 'true',
  });
  if (byId('schedule-professional').value)
    query.set('professionalId', byId('schedule-professional').value);
  try {
    const payload = await request(`/admin/schedule?${query}`, { signal: controller.signal });
    if (
      !Array.isArray(payload.bookings) ||
      !Array.isArray(payload.blocks) ||
      !Array.isArray(payload.absences)
    )
      throw new ApiError(500, 'INVALID_RESPONSE');
    if (controller.signal.aborted || !state.catalog) return false;
    state.bookings = payload.bookings;
    state.blocks = payload.blocks;
    state.absences = payload.absences;
    renderAbsences();
    renderBookings();
    renderBlocks();
    const active = state.bookings.filter((booking) => booking.status === 'confirmed').length;
    const blocks = state.blocks.filter((block) => block.status === 'active').length;
    const absences = state.absences.filter((absence) => absence.status === 'active').length;
    byId('schedule-summary').textContent =
      `${active} citas activas · ${blocks} bloqueos · ${absences} ausencias`;
    byId('access-panel').hidden = true;
    byId('admin-workspace').hidden = false;
    byId('mode-notice').hidden = false;
    content.hidden = false;
    renderPendingOperation();
    if (announceResult)
      announce(`Agenda del ${byId('schedule-date').value} actualizada. ${active} citas activas.`);
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    if (locksWorkspace(error) || byId('admin-workspace').hidden) setLocked(error);
    else
      announce('No se pudo actualizar la agenda. Volvé a consultar antes de realizar otra acción.');
    return false;
  } finally {
    if (state.readController === controller) content.setAttribute('aria-busy', 'false');
  }
}

async function bootstrap() {
  state.catalogController?.abort();
  state.readController?.abort();
  const controller = new AbortController();
  state.catalogController = controller;
  byId('reload-agenda').disabled = true;
  announce('Comprobando acceso y actualizando agenda…');
  try {
    const session = await request('/admin/session', { signal: controller.signal });
    if (
      !['owner', 'barber'].includes(session.role) ||
      typeof session.capabilities?.manageShop !== 'boolean' ||
      typeof session.capabilities?.reportAbsence !== 'boolean' ||
      (session.role === 'barber' && (!session.professionalId || session.capabilities.manageShop)) ||
      (session.role === 'owner' && !session.capabilities.manageShop)
    )
      throw new ApiError(403, 'INVALID_SESSION');
    const catalog = await request('/catalog', { signal: controller.signal });
    if (
      !['fixture', 'production'].includes(catalog.mode) ||
      !Array.isArray(catalog.services) ||
      !catalog.services.length ||
      !Array.isArray(catalog.professionals) ||
      !catalog.professionals.length ||
      !Number.isInteger(catalog.configVersion) ||
      catalog.configVersion < 1 ||
      !catalog.dateRange?.min ||
      !catalog.dateRange?.max
    )
      throw new ApiError(503, 'CONFIGURATION_REQUIRED');
    if (controller.signal.aborted) return;
    if (
      session.role === 'barber' &&
      !catalog.professionals.some((professional) => professional.id === session.professionalId)
    )
      throw new ApiError(403, 'INVALID_SESSION');
    state.session = session;
    state.catalog = catalog;
    configureWorkspace();
    await loadSchedule();
  } catch (error) {
    if (error.name !== 'AbortError') setLocked(error);
  } finally {
    if (state.catalogController === controller) byId('reload-agenda').disabled = false;
  }
}

function setFormBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  for (const button of form.querySelectorAll('button[type="submit"]')) button.disabled = busy;
}

async function formMutation(form, feedbackId, path, body, successMessage, onSuccess) {
  if (
    recoveryBlocked ||
    !state.catalog ||
    state.operation ||
    form.getAttribute('aria-busy') === 'true'
  )
    return;
  const managed = form.id === 'reschedule-form' ? state.managed : null;
  const operation = createOperation(path, body, form.id);
  if (!operation) return;
  operation.retry = async () => {
    if (!state.catalog || operation.inFlight) return;
    setFormBusy(form, true);
    feedback(feedbackId, '');
    try {
      const result = await mutation(operation);
      if (!state.catalog) return;
      onSuccess?.(result);
      announce(successMessage);
      const loaded = await loadSchedule({ announceResult: false });
      if (!loaded && state.catalog)
        announce(`${successMessage} No se pudo actualizar la lista; usá Actualizar.`);
      if (loaded && managed && !dialog.open) byId('schedule-title').focus({ preventScroll: false });
    } catch (error) {
      if (locksWorkspace(error)) setLocked(error);
      else if (managed && state.managed !== managed) announce(safeMessage(error));
      else {
        feedback(feedbackId, safeMessage(error));
        if (error.code === 'CONFIGURATION_CHANGED' && dialog.open && !state.operation)
          byId('refresh-manage').hidden = false;
      }
    } finally {
      setFormBusy(form, false);
      renderPendingOperation();
    }
  };
  await operation.retry();
}

function savedMessage(action) {
  return `${action}${state.catalog.mode === 'fixture' ? ' en la agenda ficticia de prueba' : ' en la agenda'}. No se envió ningún correo ni mensaje.`;
}

function openManager(kind, entry, opener) {
  if (!state.catalog || !canManageEntry(kind, entry)) return;
  state.managed = { kind, entry };
  state.opener = opener;
  feedback('manage-feedback', '');
  byId('refresh-manage').hidden = true;
  byId('cancel-confirmation').hidden = true;
  byId('request-cancel').hidden = false;
  byId('reschedule-form').hidden = kind !== 'booking';
  byId('manage-title').textContent =
    kind === 'absence'
      ? 'Retirar ausencia temporal'
      : kind === 'block'
        ? 'Quitar bloqueo'
        : 'Gestionar cita';
  byId('manage-mode').textContent =
    state.catalog.mode === 'fixture'
      ? 'PRUEBA LOCAL · Datos y reservas ficticios. No se envían correos ni mensajes.'
      : 'El envío de correos y mensajes está desactivado.';
  byId('manage-summary').textContent =
    kind === 'absence'
      ? absenceRange(entry)
      : `${entry.date} · ${formatTime(entry.startMinute)}–${formatTime(entry.endMinute)} · ` +
        (kind === 'booking'
          ? `${entry.professionalName} · ${entry.serviceName} · ${formatMoney(entry.priceMinorUnits)}`
          : entry.label);
  byId('manage-customer').textContent =
    kind === 'booking' && entry.customerDisplayName ? `Cliente: ${entry.customerDisplayName}` : '';
  byId('manage-customer').hidden = !byId('manage-customer').textContent;
  byId('request-cancel').textContent =
    kind === 'absence'
      ? 'Retirar esta ausencia'
      : kind === 'block'
        ? 'Quitar este bloqueo'
        : 'Cancelar cita';
  byId('cancel-question').textContent =
    kind === 'absence'
      ? '¿Querés retirar esta ausencia y volver a ofrecer el horario? Las citas existentes, tu cuenta y tu perfil se conservan.'
      : kind === 'block'
        ? '¿Querés retirar este bloqueo y liberar su horario?'
        : '¿Querés cancelar esta cita y liberar su horario?';
  byId('confirm-cancel').textContent =
    kind === 'absence'
      ? 'Confirmar retiro de ausencia'
      : kind === 'block'
        ? 'Confirmar retiro del bloqueo'
        : 'Confirmar cancelación';
  byId('keep-booking').textContent =
    kind === 'absence'
      ? 'Mantener ausencia'
      : kind === 'block'
        ? 'Mantener bloqueo'
        : 'Mantener cita';
  if (kind === 'booking') {
    const service = state.catalog.services.find((candidate) => candidate.id === entry.serviceId);
    setProfessionalOptions(
      byId('reschedule-professional'),
      service?.professionalIds || [entry.professionalId],
      entry.professionalId,
    );
    byId('reschedule-date').value = entry.date;
    byId('reschedule-time').value = formatTime(entry.startMinute);
  }
  dialog.showModal();
  renderPendingOperation();
  byId('manage-title').focus({ preventScroll: false });
}

byId('schedule-filter').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!byId('schedule-filter').reportValidity() || !state.catalog) return;
  configureFormDates();
  void loadSchedule();
});

byId('reload-agenda').addEventListener('click', () => void bootstrap());
byId('walkin-service').addEventListener('change', updateWalkinService);

byId('walkin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (
    recoveryBlocked ||
    state.operation ||
    !canManageShop() ||
    !form.reportValidity() ||
    !state.catalog
  )
    return;
  const startMinute = parseTime(byId('walkin-time').value);
  if (!Number.isInteger(startMinute))
    return feedback('walkin-feedback', 'Elegí una hora de inicio válida.');
  const name = byId('walkin-name').value.trim();
  const body = {
    configVersion: state.catalog.configVersion,
    serviceId: byId('walkin-service').value,
    professionalId: byId('walkin-professional').value,
    date: byId('walkin-date').value,
    startMinute,
    ...(name ? { customer: { displayName: name } } : {}),
  };
  void formMutation(
    form,
    'walkin-feedback',
    '/admin/walk-ins',
    body,
    savedMessage('Entrada registrada'),
    () => {
      byId('walkin-time').value = '';
      byId('walkin-name').value = '';
    },
  );
});

byId('block-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (
    recoveryBlocked ||
    state.operation ||
    !canManageShop() ||
    !form.reportValidity() ||
    !state.catalog
  )
    return;
  const startMinute = parseTime(byId('block-start').value);
  const endMinute = parseTime(byId('block-end').value);
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || endMinute <= startMinute) {
    return feedback('block-feedback', 'La hora final debe ser posterior a la hora de inicio.');
  }
  const body = {
    configVersion: state.catalog.configVersion,
    professionalId: byId('block-professional').value,
    date: byId('block-date').value,
    startMinute,
    endMinute,
    label: byId('block-label').value.trim(),
  };
  if (!body.label) return feedback('block-feedback', 'Escribí un motivo breve para el bloqueo.');
  void formMutation(
    form,
    'block-feedback',
    '/admin/blocks',
    body,
    savedMessage('Bloqueo creado'),
    () => {
      byId('block-start').value = '';
      byId('block-end').value = '';
      byId('block-label').value = '';
    },
  );
});

byId('absence-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (
    recoveryBlocked ||
    state.operation ||
    !state.catalog ||
    !canReportAbsence() ||
    !form.reportValidity()
  )
    return;
  const startMinute = parseTime(byId('absence-start-time').value);
  const endMinute = parseTime(byId('absence-end-time').value);
  const startDate = byId('absence-start-date').value;
  const endDate = byId('absence-end-date').value;
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    endDate < startDate ||
    (endDate === startDate && endMinute <= startMinute)
  )
    return feedback(
      'absence-feedback',
      'El fin de la ausencia debe ser posterior al inicio. Revisá ambas fechas y horas.',
    );
  const reason = byId('absence-reason').value.trim();
  const body = {
    configVersion: state.catalog.configVersion,
    professionalId: canManageShop()
      ? byId('absence-professional').value
      : state.session.professionalId,
    startDate,
    startMinute,
    endDate,
    endMinute,
    ...(reason ? { reason } : {}),
  };
  void formMutation(
    form,
    'absence-feedback',
    '/admin/absences',
    body,
    savedMessage('Ausencia guardada; las citas existentes se conservan'),
    (absence) => {
      // Show the start day so even a future or multi-day report remains visible.
      byId('schedule-date').value = absence.startDate;
      if (canManageShop()) byId('schedule-professional').value = absence.professionalId;
      for (const id of ['absence-start-time', 'absence-end-time', 'absence-reason'])
        byId(id).value = '';
      feedback(
        'absence-feedback',
        absence.resolution === 'requires-resolution'
          ? 'Ausencia guardada. Hay citas coincidentes pendientes de resolución por el propietario; siguen confirmadas.'
          : 'Ausencia guardada. No hay citas coincidentes; no se aceptarán nuevas citas en ese período.',
      );
    },
  );
});

byId('reschedule-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (
    recoveryBlocked ||
    state.operation ||
    !form.reportValidity() ||
    !state.catalog ||
    !canManageShop() ||
    state.managed?.kind !== 'booking'
  )
    return;
  const startMinute = parseTime(byId('reschedule-time').value);
  if (!Number.isInteger(startMinute))
    return feedback('manage-feedback', 'Elegí una hora de inicio válida.');
  const managed = state.managed;
  const { entry } = managed;
  const body = {
    configVersion: state.catalog.configVersion,
    expectedVersion: entry.version,
    date: byId('reschedule-date').value,
    startMinute,
    professionalId: byId('reschedule-professional').value,
  };
  void formMutation(
    form,
    'manage-feedback',
    `/admin/bookings/${encodeURIComponent(entry.id)}/reschedule`,
    body,
    savedMessage('Cita reprogramada'),
    () => {
      if (state.managed?.entry.id === entry.id && state.managed.kind === managed.kind)
        dialog.close();
    },
  );
});

byId('close-manage').addEventListener('click', () => dialog.close());
byId('refresh-manage').addEventListener('click', async () => {
  byId('refresh-manage').disabled = true;
  await bootstrap();
  byId('refresh-manage').disabled = false;
  if (!state.catalog || !dialog.open || !state.managed) return;
  const { kind, entry } = state.managed;
  if (kind === 'booking') {
    const service = state.catalog.services.find((candidate) => candidate.id === entry.serviceId);
    setProfessionalOptions(
      byId('reschedule-professional'),
      service?.professionalIds || [entry.professionalId],
      byId('reschedule-professional').value,
    );
  }
  byId('refresh-manage').hidden = true;
  feedback(
    'manage-feedback',
    'Configuración actualizada. Revisá el profesional, la fecha y la hora antes de guardar de nuevo.',
  );
});
dialog.addEventListener('close', () => {
  state.managed = null;
  const opener = state.opener;
  state.opener = null;
  if (opener?.isConnected && !byId('admin-workspace').hidden)
    opener.focus({ preventScroll: false });
  else if (!byId('admin-workspace').hidden) byId('schedule-title').focus({ preventScroll: false });
});
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = Array.from(
    dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === byId('manage-title'))
  ) {
    event.preventDefault();
    last.focus({ preventScroll: false });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: false });
  }
});

byId('request-cancel').addEventListener('click', () => {
  if (recoveryBlocked || state.operation) return;
  byId('request-cancel').hidden = true;
  byId('cancel-confirmation').hidden = false;
  byId('keep-booking').focus({ preventScroll: false });
});

byId('keep-booking').addEventListener('click', () => {
  byId('cancel-confirmation').hidden = true;
  byId('request-cancel').hidden = false;
  byId('request-cancel').focus({ preventScroll: false });
});

byId('confirm-cancel').addEventListener('click', async () => {
  if (
    recoveryBlocked ||
    !state.catalog ||
    !state.managed ||
    !canManageEntry(state.managed.kind, state.managed.entry) ||
    state.operation ||
    byId('confirm-cancel').disabled
  )
    return;
  const managed = state.managed;
  const { kind, entry } = managed;
  const message = savedMessage(
    kind === 'absence'
      ? 'Ausencia retirada; las citas existentes se conservan'
      : kind === 'block'
        ? 'Bloqueo retirado'
        : 'Cita cancelada',
  );
  const operation = createOperation(
    `/admin/${kind === 'absence' ? 'absences' : kind === 'block' ? 'blocks' : 'bookings'}/${encodeURIComponent(entry.id)}/${kind === 'absence' ? 'revoke' : 'cancel'}`,
    { configVersion: state.catalog.configVersion, expectedVersion: entry.version },
  );
  if (!operation) return;
  operation.retry = async () => {
    if (!state.catalog || operation.inFlight) return;
    feedback('manage-feedback', '');
    try {
      await mutation(operation);
      if (!state.catalog) return;
      if (state.managed?.entry.id === entry.id && state.managed.kind === kind) dialog.close();
      announce(message);
      const loaded = await loadSchedule({ announceResult: false });
      if (!loaded && state.catalog)
        announce(`${message} No se pudo actualizar la lista; usá Actualizar.`);
      if (loaded && !dialog.open) byId('schedule-title').focus({ preventScroll: false });
    } catch (error) {
      if (locksWorkspace(error)) setLocked(error);
      else if (state.managed !== managed) announce(safeMessage(error));
      else {
        feedback('manage-feedback', safeMessage(error));
        if (error.code === 'CONFIGURATION_CHANGED' && dialog.open && !state.operation)
          byId('refresh-manage').hidden = false;
      }
    } finally {
      renderPendingOperation();
    }
  };
  await operation.retry();
});

byId('export-agenda').addEventListener('click', async () => {
  if (!state.catalog || !canManageShop() || byId('export-agenda').disabled) return;
  byId('export-agenda').disabled = true;
  try {
    const backup = await request('/admin/export');
    if (
      backup.format !== 'portable-agenda' ||
      backup.version !== 2 ||
      !Array.isArray(backup.tables)
    ) {
      throw new ApiError(500, 'INVALID_BACKUP');
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `agenda-backup-v2-${localDate()}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    announce('Respaldo descargado. Contiene datos privados; guardalo en un lugar seguro.');
  } catch (error) {
    if (locksWorkspace(error)) setLocked(error);
    else announce(safeMessage(error));
  } finally {
    renderPendingOperation();
  }
});

void bootstrap();
