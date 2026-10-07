import {
  consumeManagementLink,
  readBooking,
  readCatalog,
  readRescheduleAvailability,
  mutateBooking,
  newIdempotencyKey,
  managementUrl,
  validDate,
  formatDate,
  formatTime,
  formatPrice,
  errorMessage,
  AgendaClientError,
  mutationReloadGuard,
  reloadRecoveryMessage,
  reloadStorageMessage,
} from './booking-client.js';

const $ = (selector) => document.querySelector(selector);
let capability = consumeManagementLink();
const confirmation = $('#manage-confirm-dialog');
let receipt;
let catalog;
let slot;
let availability;
let pending;
let busy = false;
let uncertain = false;
let retryAction = 'load';
let controller;
let generation = 0;
const reloadGuard = mutationReloadGuard('manage');
const recoveryBlocked = reloadGuard.status() !== 'clear';
const recoveryMessage =
  reloadGuard.status() === 'unavailable' ? reloadStorageMessage : reloadRecoveryMessage;

function message(text, retry = false) {
  $('#manage-message').textContent = text;
  $('#manage-retry').hidden = !retry;
}

function focusVisible(node) {
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function setControls() {
  for (const control of document.querySelectorAll('button, input, select'))
    control.disabled = busy || uncertain || recoveryBlocked;
  $('#manage-retry').disabled = busy;
  $('#manage-copy').disabled = busy;
  $('#manage-confirm-move').disabled = busy || uncertain || recoveryBlocked || !slot;
  document.querySelector('main').setAttribute('aria-busy', String(busy));
}

function renderReceipt() {
  const booking = receipt.booking;
  const target = $('#manage-receipt');
  target.replaceChildren();
  const rows = [
    ['Código', booking.id],
    ['Estado', booking.status === 'cancelled' ? 'Cancelada' : 'Confirmada'],
    ['Servicio', booking.serviceName],
    ['Profesional', booking.professionalName],
    ['Fecha', formatDate(booking.date)],
    ['Horario', `${formatTime(booking.startMinute)} - ${formatTime(booking.endMinute)}`],
    ['Precio', formatPrice(booking.priceMinorUnits)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    row.append(term, detail);
    target.append(row);
  }
  $('#manage-booking').hidden = false;
  $('#manage-actions').hidden = booking.status !== 'confirmed' || !catalog;
  $('#manage-mode').textContent =
    receipt.mode === 'fixture'
      ? 'Agenda local de prueba · datos ficticios. Esta reserva no es una cita del negocio.'
      : 'Reserva registrada en la agenda del negocio.';
  $('#manage-policy').textContent = catalog
    ? `Cambios sujetos a la política configurada: al menos ${catalog.cancellationLeadMinutes} minutos antes de la cita. Hora de Nicaragua (America/Managua).`
    : 'La configuración actual de la agenda no permite gestionar cambios.';
  $('#manage-heading').textContent =
    booking.status === 'cancelled' ? 'Reserva cancelada' : 'Mi reserva';
  setControls();
}

async function load() {
  if (!capability) {
    message(
      recoveryBlocked
        ? recoveryMessage
        : 'Este enlace no permite acceder a una reserva. Abrí el enlace privado que guardaste al confirmar.',
    );
    return;
  }
  busy = true;
  setControls();
  message('Verificando la reserva…');
  try {
    receipt = await readBooking(capability.id, capability.token);
    try {
      catalog = await readCatalog();
    } catch {
      catalog = null;
    }
    busy = false;
    renderReceipt();
    message(
      recoveryBlocked
        ? recoveryMessage
        : catalog
          ? 'Reserva verificada. Podés consultar su estado y gestionar cambios.'
          : 'La agenda necesita configuración antes de permitir cambios.',
      !catalog || recoveryBlocked,
    );
    retryAction = 'load';
  } catch (error) {
    busy = false;
    setControls();
    message(errorMessage(error), ![401, 403, 404].includes(error.status));
    retryAction = 'load';
  }
}

function prepareReschedule() {
  if (recoveryBlocked || uncertain || busy || !catalog || receipt.booking.status !== 'confirmed')
    return;
  const service = catalog.services.find(({ id }) => id === receipt.booking.serviceId);
  if (!service) {
    message(
      'El servicio original cambió. La reserva se conserva; la agenda necesita revisión antes de moverla.',
    );
    return;
  }
  const select = $('#manage-professional');
  select.replaceChildren();
  for (const professional of catalog.professionals.filter(({ id }) =>
    service.professionalIds.includes(id),
  )) {
    const option = document.createElement('option');
    option.value = professional.id;
    option.textContent = professional.name;
    select.append(option);
  }
  select.value = service.professionalIds.includes(receipt.booking.professionalId)
    ? receipt.booking.professionalId
    : service.professionalIds[0];
  const date = $('#manage-date');
  date.min = catalog.dateRange.min;
  date.max = catalog.dateRange.max;
  date.value =
    receipt.booking.date >= date.min && receipt.booking.date <= date.max
      ? receipt.booking.date
      : date.min;
  $('#manage-reschedule').hidden = false;
  $('#manage-actions').hidden = true;
  slot = null;
  pending = null;
  void loadSlots();
  focusVisible($('#manage-reschedule-heading'));
}

async function loadSlots() {
  controller?.abort();
  controller = new AbortController();
  const requestGeneration = ++generation;
  const date = $('#manage-date').value;
  slot = null;
  availability = null;
  pending = null;
  $('#manage-slots').replaceChildren();
  setControls();
  if (!validDate(date) || date < catalog.dateRange.min || date > catalog.dateRange.max) {
    $('#manage-slot-message').textContent = 'Elegí una fecha dentro del rango disponible.';
    return;
  }
  $('#manage-slot-message').textContent = 'Consultando horarios…';
  try {
    const result = await readRescheduleAvailability(
      capability.id,
      {
        professionalId: $('#manage-professional').value,
        date,
      },
      capability.token,
      controller.signal,
    );
    if (requestGeneration !== generation || $('#manage-reschedule').hidden) return;
    availability = result;
    for (const candidate of availability.slots) {
      const label = document.createElement('label');
      label.className = 'booking-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'manage-slot';
      input.value = candidate.startMinute;
      const copy = document.createElement('span');
      copy.className = 'booking-option-copy';
      const title = document.createElement('strong');
      title.textContent = formatTime(candidate.startMinute);
      copy.append(title);
      const check = document.createElement('span');
      check.className = 'booking-option-check';
      check.setAttribute('aria-hidden', 'true');
      label.append(input, copy, check);
      $('#manage-slots').append(label);
    }
    $('#manage-slot-message').textContent = availability.slots.length
      ? 'Elegí un horario y confirmá el cambio. La reserva actual se conserva hasta entonces.'
      : 'No hay horarios disponibles. Elegí otra fecha o profesional.';
    message('Consultá los horarios; el cambio todavía no se ha realizado.');
  } catch (error) {
    if (requestGeneration !== generation || controller.signal.aborted) return;
    $('#manage-slot-message').textContent = 'No se pudieron consultar los horarios.';
    message(errorMessage(error), true);
    retryAction = 'slots';
  }
}

async function commit(action) {
  if (busy || recoveryBlocked || !catalog || !receipt) return;
  if (!pending && reloadGuard.status() !== 'clear') {
    message(reloadRecoveryMessage);
    return;
  }
  if (!pending) {
    if (action === 'reschedule' && !slot) return;
    pending = {
      action,
      key: newIdempotencyKey(),
      body: {
        expectedVersion: receipt.booking.version,
        configVersion: catalog.configVersion,
        ...(action === 'reschedule'
          ? {
              date: $('#manage-date').value,
              professionalId: $('#manage-professional').value,
              startMinute: slot.startMinute,
            }
          : {}),
      },
    };
  }
  if (!reloadGuard.arm()) {
    if (!uncertain) pending = null;
    confirmation.close();
    message(reloadStorageMessage, uncertain);
    return;
  }
  busy = true;
  setControls();
  message('Verificando y guardando el cambio…');
  try {
    const result = await mutateBooking(
      capability.id,
      pending.action,
      pending.body,
      capability.token,
      pending.key,
    );
    if (
      (pending.action === 'cancel' && result.booking.status !== 'cancelled') ||
      (pending.action === 'reschedule' &&
        (result.booking.status !== 'confirmed' ||
          result.booking.date !== pending.body.date ||
          result.booking.startMinute !== pending.body.startMinute ||
          result.booking.professionalId !== pending.body.professionalId))
    )
      throw new AgendaClientError('INVALID_RESPONSE', 0, 'No se pudo verificar el cambio.', true);
    reloadGuard.clear();
    receipt = result;
    busy = false;
    uncertain = false;
    pending = null;
    confirmation.close();
    $('#manage-reschedule').hidden = true;
    renderReceipt();
    message(
      result.booking.status === 'cancelled'
        ? 'Cancelación registrada. El turno quedó liberado.'
        : 'Cambio registrado. Este es tu nuevo horario.',
    );
    focusVisible($('#manage-heading'));
  } catch (error) {
    busy = false;
    confirmation.close();
    // Preserve the original request until its earlier uncertain result is known.
    if (uncertain || error.uncertain) {
      uncertain = true;
      retryAction = 'mutation';
      setControls();
      message(
        'No se pudo verificar el resultado. Reintentá para recuperar la misma solicitud; evitá realizar otro cambio.',
        true,
      );
      return;
    }
    reloadGuard.clear();
    pending = null;
    uncertain = false;
    setControls();
    if (error.status === 409) {
      slot = null;
      $('#manage-reschedule').hidden = true;
      await load();
      message(errorMessage(error));
      focusVisible($('#manage-heading'));
    } else {
      message(errorMessage(error), error.status === 429);
      retryAction = 'load';
    }
  }
}

$('#manage-move').addEventListener('click', prepareReschedule);
$('#manage-cancel').addEventListener('click', () => {
  if (recoveryBlocked || uncertain || busy) return;
  confirmation.showModal();
  focusVisible($('#manage-confirm-heading'));
});
$('#manage-keep').addEventListener('click', () => confirmation.close());
$('#manage-confirm-cancel').addEventListener('click', () => void commit('cancel'));
$('#manage-confirm-move').addEventListener('click', () => void commit('reschedule'));
$('#manage-professional').addEventListener('change', () => void loadSlots());
$('#manage-date').addEventListener('change', () => void loadSlots());
$('#manage-slots').addEventListener('change', (event) => {
  slot = availability?.slots.find(({ startMinute }) => startMinute === Number(event.target.value));
  pending = null;
  setControls();
});
$('#manage-back').addEventListener('click', () => {
  controller?.abort();
  generation += 1;
  $('#manage-reschedule').hidden = true;
  slot = null;
  renderReceipt();
  focusVisible($('#manage-move'));
  message('La reserva conserva su horario actual.');
});
$('#manage-retry').addEventListener('click', () => {
  if (retryAction === 'mutation' && pending) void commit(pending.action);
  else if (retryAction === 'slots') void loadSlots();
  else void load();
});
$('#manage-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(managementUrl(capability.id, capability.token));
    message('Enlace privado copiado. No lo compartás: permite gestionar esta reserva.');
  } catch {
    message(
      'El navegador no permitió copiar el enlace. Conservá el enlace original que recibiste al reservar.',
    );
  }
});
confirmation.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
// Pasting the retained private link into this same page may only change its
// fragment, without loading a new document. Consume and scrub it here too.
window.addEventListener('hashchange', () => {
  if (!new URLSearchParams(location.hash.slice(1)).has('token')) return;
  const next = consumeManagementLink();
  if (busy || pending || uncertain) return;
  capability = next;
  receipt = null;
  catalog = null;
  slot = null;
  controller?.abort();
  generation += 1;
  $('#manage-booking').hidden = true;
  $('#manage-reschedule').hidden = true;
  void load();
});
void load();
