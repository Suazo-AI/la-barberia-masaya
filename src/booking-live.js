import {
  readCatalog,
  readAvailability,
  newBookingRequest,
  createBooking,
  managementUrl,
  validDate,
  addDays,
  formatDate,
  formatTime,
  formatPrice,
  errorMessage,
} from './booking-client.js';

const dialog = document.querySelector('#booking-dialog');
const $ = (selector) => dialog.querySelector(selector);
const services = $('#booking-services');
const barbers = $('#booking-barbers');
const dateInput = $('#booking-date');
const dates = $('#booking-dates');
const slots = $('#booking-slots');
const advance = $('#booking-continue');
const progress = $('.booking-progress');
const originalTitle = document.title;
let state;
let opener;
let portfolioOpener;
let controller;
let generation = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function message(text, retry = false) {
  const visible = $('#booking-message');
  $('#booking-status').textContent = visible ? '' : text;
  if (visible) {
    visible.textContent = text;
    visible.hidden = !text;
  }
  const button = $('#booking-retry');
  if (button) button.hidden = !retry;
}

function focusVisible(node) {
  if (!node) return;
  node.focus({ preventScroll: true });
  const box = node.getBoundingClientRect();
  const bounds = dialog.getBoundingClientRect();
  if (box.top < bounds.top || box.bottom > bounds.bottom)
    node.scrollIntoView({ block: 'center', behavior: 'auto' });
}

function rowsForSelection() {
  const service = state.catalog?.services.find(({ id }) => id === state.serviceId);
  const professional = state.catalog?.professionals.find(({ id }) => id === state.professionalId);
  return [
    ['Servicio', service?.name || 'Por elegir', 1],
    [
      'Duración y precio',
      service
        ? `${service.durationMinutes} min · ${formatPrice(service.priceMinorUnits)}`
        : 'Por elegir',
      1,
    ],
    ['Profesional', professional?.name || 'Sin preferencia · se asigna al confirmar', 2],
    ['Fecha', state.date ? formatDate(state.date) : 'Por elegir', 2],
    [
      'Horario',
      state.slot
        ? `${formatTime(state.slot.startMinute)} - ${formatTime(state.slot.endMinute)}`
        : 'Por elegir',
      2,
    ],
  ];
}

function renderRows(target, rows, editable = false) {
  target.replaceChildren();
  for (const [label, value, step] of rows) {
    const row = element('div', editable ? 'booking-review-row' : '');
    const list = editable ? element('dl') : row;
    list.append(element('dt', '', label), element('dd', '', value));
    if (editable) {
      const button = element('button', 'booking-text-button', 'Editar');
      button.type = 'button';
      button.dataset.edit = step;
      button.setAttribute('aria-label', `Editar ${label.toLowerCase()}`);
      button.disabled = state.submitting || state.uncertain;
      row.append(list, button);
    }
    target.append(row);
  }
}

function renderControls() {
  const locked = state.submitting || state.uncertain;
  for (const button of progress.querySelectorAll('[data-step]')) {
    const step = Number(button.dataset.step);
    button.disabled = locked || step > state.visited;
    if (step === state.step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  progress.hidden = state.step === 4 || Boolean(state.portfolioId) || !state.catalog;
  $('.booking-summary').hidden = state.step >= 3 || Boolean(state.portfolioId) || !state.catalog;
  $('.booking-footer').hidden = Boolean(state.portfolioId);
  $('.booking-body').classList.toggle(
    'booking-body-review',
    state.step >= 3 || Boolean(state.portfolioId) || !state.catalog,
  );
  $('#booking-back').hidden = state.step === 1 || state.step === 4 || !state.catalog;
  $('#booking-back').disabled = locked;
  $('#booking-reset').hidden = !state.catalog || state.step === 4;
  $('#booking-reset').disabled = locked;
  $('#booking-reset').textContent = 'Volver a empezar';
  advance.hidden = !state.catalog || state.uncertain;
  advance.textContent = state.submitting
    ? 'Verificando reserva…'
    : state.step === 3
      ? 'Confirmar reserva'
      : state.step === 4
        ? 'Nueva reserva'
        : 'Continuar';
  advance.disabled =
    locked ||
    (state.step === 1 ? !state.serviceId : state.step === 2 ? !state.slot || state.loading : false);
  $('[data-booking-close]').disabled = state.submitting;
  for (const input of dialog.querySelectorAll('input'))
    input.disabled =
      locked || (state.catalog?.mode === 'fixture' && input.id.startsWith('booking-customer-'));
  for (const button of dialog.querySelectorAll('[data-portfolio-open], [data-date], [data-edit]'))
    button.disabled = locked;
  $('#booking-next-date').disabled = locked || state.loading;
  if ($('#booking-retry')) $('#booking-retry').disabled = state.submitting;
  dialog.setAttribute('aria-busy', String(Boolean(state.loading || state.submitting)));
}

function renderSummary() {
  const rows = rowsForSelection();
  renderRows($('#booking-summary'), rows);
  renderRows($('#booking-review'), rows, true);
}

function showStep(step) {
  state.portfolioId = '';
  $('#booking-portfolio-works').replaceChildren();
  state.step = step;
  for (const panel of dialog.querySelectorAll('[data-panel]'))
    panel.hidden = Number(panel.dataset.panel) !== step;
  renderSummary();
  renderControls();
  document.title = `${step === 4 ? 'Reserva registrada' : `Paso ${step} de 3 · Reserva`} · ${originalTitle}`;
  dialog.scrollTop = 0;
  focusVisible($(`[data-panel="${step}"] h3`));
  if (step === 2 && !state.availability && !state.loading && state.serviceId) void loadTimes();
}

function option(name, value, title, detail) {
  const label = element('label', 'booking-option');
  const input = element('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  const copy = element('span', 'booking-option-copy');
  copy.append(element('strong', '', title));
  if (detail) copy.append(element('span', '', detail));
  const check = element('span', 'booking-option-check');
  check.setAttribute('aria-hidden', 'true');
  label.append(input, copy, check);
  return label;
}

function renderProfessionals() {
  barbers.replaceChildren(
    option(
      'agenda-professional',
      'any',
      'Sin preferencia',
      'Cualquier profesional disponible para este servicio',
    ),
  );
  const eligible = state.catalog.services.find(({ id }) => id === state.serviceId)?.professionalIds;
  for (const professional of state.catalog.professionals) {
    if (eligible && !eligible.includes(professional.id)) continue;
    const card = element('div', 'booking-profile');
    const photo = element('div', 'booking-profile-photo');
    photo.setAttribute('aria-hidden', 'true');
    if (professional.photoUrl) {
      const image = element('img');
      image.src = professional.photoUrl;
      image.alt = '';
      image.width = 64;
      image.height = 64;
      image.loading = 'lazy';
      photo.append(image);
    } else {
      photo.innerHTML =
        '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="32" cy="21" r="10" /><path d="M12 56v-7a20 20 0 0 1 40 0v7" /></svg>';
      photo.append(element('span', '', 'Foto pendiente'));
    }
    const button = element('button', 'booking-text-button', 'Ver sus trabajos ↗');
    button.type = 'button';
    button.dataset.portfolioOpen = professional.id;
    button.setAttribute('aria-label', `Ver sus trabajos de ${professional.name}`);
    card.append(
      photo,
      option(
        'agenda-professional',
        professional.id,
        professional.name,
        state.catalog.mode === 'fixture' ? 'Perfil de prueba · datos ficticios' : '',
      ),
      button,
    );
    barbers.append(card);
  }
  for (const input of barbers.querySelectorAll('input'))
    input.checked = input.value === state.professionalId;
}

function renderDates() {
  dateInput.min = state.catalog.dateRange.min;
  dateInput.max = state.catalog.dateRange.max;
  dateInput.value = state.date;
  dates.replaceChildren();
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(state.date, i);
    if (date > dateInput.max) break;
    const button = element('button', 'booking-date');
    button.append(
      element('span', '', formatDate(date, { weekday: 'short' })),
      element('strong', '', Number(date.slice(-2))),
    );
    button.type = 'button';
    button.dataset.date = date;
    button.setAttribute('aria-label', formatDate(date));
    button.setAttribute('aria-pressed', String(date === state.date));
    dates.append(button);
  }
  $('#booking-date-help').textContent =
    `${formatDate(dateInput.min)} a ${formatDate(dateInput.max)} · Hora de Nicaragua (America/Managua).`;
}

function renderTimes() {
  slots.replaceChildren();
  const available = state.availability?.slots || [];
  for (const slot of available) {
    const label = option('agenda-slot', String(slot.startMinute), formatTime(slot.startMinute));
    label.classList.add('booking-slot');
    label.querySelector('input').checked = slot.startMinute === state.slot?.startMinute;
    slots.append(label);
  }
  $('#booking-empty').hidden = state.loading || Boolean(available.length);
  $('#booking-empty-message').textContent =
    state.availability?.reason === 'closed'
      ? 'No hay atención configurada para este servicio y profesional en esta fecha.'
      : 'No hay horarios disponibles en esta fecha. Podés elegir otra fecha o profesional.';
  $('#booking-next-date').hidden = state.date >= state.catalog.dateRange.max;
  $('#booking-next-date').textContent = 'Ver día siguiente';
  $('#booking-slot-help').textContent = state.loading
    ? 'Consultando horarios…'
    : available.length
      ? `${available.length} horarios disponibles. El turno se asegura al confirmar la reserva.`
      : '';
  renderSummary();
  renderControls();
}

function invalidateSlot() {
  state.slot = null;
  state.pending = null;
  state.uncertain = false;
  state.visited = Math.min(state.visited, 2);
}

async function loadTimes() {
  controller?.abort();
  controller = new AbortController();
  const requestGeneration = ++generation;
  state.loading = true;
  state.availability = null;
  renderTimes();
  try {
    const result = await readAvailability(
      { serviceId: state.serviceId, professionalId: state.professionalId, date: state.date },
      controller.signal,
    );
    if (!dialog.open || requestGeneration !== generation) return;
    state.availability = result;
    state.loading = false;
    if (
      state.slot &&
      !result.slots.some(({ startMinute }) => startMinute === state.slot.startMinute)
    )
      invalidateSlot();
    renderTimes();
    message(
      result.slots.length
        ? 'Elegí uno de los horarios disponibles.'
        : 'No hay horarios disponibles para esta selección.',
    );
  } catch (error) {
    if (!dialog.open || requestGeneration !== generation || controller.signal.aborted) return;
    state.loading = false;
    invalidateSlot();
    renderTimes();
    message(errorMessage(error), true);
  }
}

function configureLabels() {
  const fixture = state.catalog.mode === 'fixture';
  $('.booking-header .section-label').textContent = fixture ? 'AGENDA DE PRUEBA' : 'RESERVA';
  $('#service-heading').textContent = 'Elegí tu servicio';
  $('#booking-disclaimer').textContent = fixture
    ? 'Prueba local con datos ficticios. Las reservas se guardan en la base de prueba; no son citas del negocio.'
    : 'La reserva se confirma cuando la agenda la registra. Guardá tu enlace privado para gestionarla. No hay pagos en línea.';
  document.querySelector('#booking-load-status').textContent = fixture
    ? 'Agenda local de prueba · servicios, precios y profesionales ficticios.'
    : 'Elegí tu servicio y consultá los horarios disponibles.';
  $('[data-panel="1"] legend').textContent = 'Servicio';
  $('[data-panel="1"] .booking-help:last-child').textContent = fixture
    ? 'Duraciones y precios ficticios en córdobas (NIO).'
    : 'Duración y precio en córdobas (NIO), según el servicio.';
  $('[data-panel="2"] legend').textContent = '¿Con quién?';
  $('.booking-time-options legend').textContent = 'Horarios disponibles';
  $('[data-panel="3"] .booking-help').textContent = 'Podés editar tu selección antes de confirmar.';
  $('.booking-review-note').textContent = fixture
    ? 'No ingresés datos personales en esta prueba. No se envían correos ni se realizan pagos.'
    : 'Nombre y correo son opcionales. Los correos de confirmación están desactivados. Guardá tu enlace privado de gestión. No se realiza ningún pago.';
  $('.booking-summary-note').textContent = fixture
    ? 'Datos ficticios de prueba. Sin correos ni pagos.'
    : 'Disponibilidad sujeta a confirmación. Sin pagos en línea.';
  progress.setAttribute('aria-label', 'Pasos de la reserva');
  $('[data-booking-close]').setAttribute('aria-label', 'Cerrar reservas');
}

async function loadCatalog(reason = '') {
  controller?.abort();
  controller = new AbortController();
  const requestGeneration = ++generation;
  state.loading = true;
  services.replaceChildren();
  barbers.replaceChildren();
  showStep(1);
  message('Cargando servicios de la agenda…');
  try {
    const catalog = await readCatalog(controller.signal);
    if (!dialog.open || requestGeneration !== generation) return;
    state.catalog = catalog;
    state.date = catalog.dateRange.min;
    state.loading = false;
    configureLabels();
    for (const service of catalog.services) {
      const label = option('agenda-service', service.id, service.name, service.description);
      label
        .querySelector('.booking-option-copy')
        .append(
          element(
            'span',
            'booking-service-meta',
            `${service.durationMinutes} min · ${formatPrice(service.priceMinorUnits)}${catalog.mode === 'fixture' ? ' · precio ficticio' : ''}`,
          ),
        );
      services.append(label);
    }
    renderProfessionals();
    renderDates();
    renderSummary();
    renderControls();
    message(reason || 'Elegí el servicio que querés reservar.');
  } catch (error) {
    if (!dialog.open || requestGeneration !== generation || controller.signal.aborted) return;
    state.loading = false;
    $('#service-heading').textContent =
      error.status === 503 || error.code === 'CONFIGURATION_REQUIRED'
        ? 'Agenda pendiente de configuración'
        : 'Agenda no disponible';
    $('#booking-disclaimer').textContent =
      'No se ha creado ninguna reserva. La agenda requiere conexión y configuración verificada.';
    document.querySelector('#booking-load-status').textContent = errorMessage(error);
    renderControls();
    message(errorMessage(error), true);
    focusVisible($('#service-heading'));
  }
}

function reset(reason = '') {
  if (state?.submitting || state?.uncertain) return;
  state = {
    step: 1,
    visited: 1,
    catalog: null,
    serviceId: '',
    professionalId: 'any',
    date: '',
    slot: null,
    portfolioId: '',
    availability: null,
    pending: null,
    receipt: null,
    loading: false,
    submitting: false,
    uncertain: false,
  };
  for (const input of dialog.querySelectorAll('input')) {
    input.checked = false;
    if (input.id.startsWith('booking-customer-')) input.value = '';
  }
  if ($('#booking-manage-link')) $('#booking-manage-link').hidden = true;
  if ($('#booking-copy-link')) $('#booking-copy-link').hidden = true;
  void loadCatalog(typeof reason === 'string' ? reason : '');
}

function setDate(date) {
  if (!state.catalog || state.submitting || state.uncertain) return;
  if (
    !validDate(date) ||
    date < state.catalog.dateRange.min ||
    date > state.catalog.dateRange.max
  ) {
    dateInput.value = state.date;
    message('Elegí una fecha dentro del rango disponible.');
    return;
  }
  state.date = date;
  invalidateSlot();
  renderDates();
  void loadTimes();
}

function selectProfessional(id) {
  if (state.professionalId === id || state.submitting || state.uncertain) return;
  state.professionalId = id;
  for (const input of barbers.querySelectorAll('input')) input.checked = input.value === id;
  invalidateSlot();
  void loadTimes();
}

function openPortfolio(id, trigger) {
  const professional = state.catalog.professionals.find((item) => item.id === id);
  if (!professional || state.step !== 2) return;
  state.portfolioId = id;
  portfolioOpener = trigger;
  for (const panel of dialog.querySelectorAll('[data-panel]'))
    panel.hidden = panel.dataset.panel !== 'portfolio';
  $('#portfolio-heading').textContent = `Trabajos de ${professional.name}`;
  $('[data-panel="portfolio"] .booking-step-label').textContent =
    state.catalog.mode === 'fixture' ? 'PERFIL DE PRUEBA' : 'PORTAFOLIO';
  $('[data-panel="portfolio"] .booking-help').textContent =
    state.catalog.mode === 'fixture'
      ? 'Perfil ficticio de prueba. Fotos y trabajos reales pendientes de confirmación.'
      : 'Solo se muestran trabajos verificados y atribuibles a este profesional.';
  const works = $('#booking-portfolio-works');
  works.replaceChildren();
  for (const work of (Array.isArray(professional.portfolio) ? professional.portfolio : []).filter(
    (item) => item.verified === true,
  )) {
    if (!/^(?:https:\/\/|\/(?!\/))/.test(work.src)) continue;
    const figure = element('figure');
    const image = element('img');
    image.src = work.src;
    image.alt = work.alt || 'Trabajo verificado del profesional';
    image.loading = 'lazy';
    if (Number.isInteger(work.width) && Number.isInteger(work.height)) {
      image.width = work.width;
      image.height = work.height;
    }
    figure.append(image);
    if (work.caption) figure.append(element('figcaption', '', work.caption));
    works.append(figure);
  }
  $('#booking-portfolio-empty').hidden = Boolean(works.children.length);
  renderControls();
  dialog.scrollTop = 0;
  focusVisible($('#portfolio-heading'));
}

function closePortfolio() {
  showStep(2);
  focusVisible(portfolioOpener);
  portfolioOpener = null;
}

async function finishBooking() {
  if (state.submitting) return;
  if (!state.pending) {
    if (!state.slot) return;
    const name = $('#booking-customer-name');
    const email = $('#booking-customer-email');
    for (const input of [name, email])
      if (input && !input.disabled && !input.reportValidity()) return;
    const customerName = name?.value.trim() || '';
    const customerEmail = email?.value.trim() || '';
    const customer =
      state.catalog.mode === 'production' && (customerName || customerEmail)
        ? {
            ...(customerName ? { displayName: customerName } : {}),
            ...(customerEmail ? { email: customerEmail } : {}),
          }
        : undefined;
    try {
      state.pending = newBookingRequest({
        configVersion: state.catalog.configVersion,
        serviceId: state.serviceId,
        ...(state.professionalId === 'any' ? {} : { professionalId: state.professionalId }),
        date: state.date,
        startMinute: state.slot.startMinute,
        ...(customer ? { customer } : {}),
      });
    } catch {
      message(
        'El navegador no permite crear un enlace privado seguro. Abrí el sitio mediante HTTPS.',
      );
      return;
    }
  }
  state.submitting = true;
  renderControls();
  message('Verificando y guardando la reserva…');
  try {
    const receipt = await createBooking(state.pending);
    state.receipt = receipt;
    state.submitting = false;
    state.uncertain = false;
    const booking = receipt.booking;
    $('#complete-heading').textContent =
      receipt.mode === 'fixture' ? 'Reserva de prueba registrada.' : 'Reserva confirmada.';
    $('[data-panel="4"] .booking-step-label').textContent =
      receipt.mode === 'fixture' ? 'BASE DE PRUEBA' : 'RESERVA REGISTRADA';
    $('.booking-complete-message').textContent =
      receipt.mode === 'fixture'
        ? 'Se guardó en la agenda local de prueba. No es una cita del negocio.'
        : `Tu reserva quedó registrada con el código ${booking.id}.`;
    $('[data-panel="4"] .booking-help').textContent =
      'No se ha enviado ningún correo. Guardá el enlace privado; permite cancelar o reprogramar esta reserva.';
    if ($('#booking-receipt'))
      renderRows($('#booking-receipt'), [
        ['Servicio', booking.serviceName],
        ['Profesional', booking.professionalName],
        ['Fecha', formatDate(booking.date)],
        ['Horario', `${formatTime(booking.startMinute)} - ${formatTime(booking.endMinute)}`],
        ['Precio', formatPrice(booking.priceMinorUnits)],
      ]);
    const link = $('#booking-manage-link');
    if (link && receipt.customerManagement === 'token') {
      link.href = managementUrl(booking.id, state.pending.token);
      link.hidden = false;
      link.referrerPolicy = 'no-referrer';
      if ($('#booking-copy-link')) $('#booking-copy-link').hidden = false;
    }
    showStep(4);
    message('Reserva registrada. Conservá tu enlace privado.');
  } catch (error) {
    state.submitting = false;
    if (error.uncertain) {
      state.uncertain = true;
      message(
        'No se pudo verificar si la reserva quedó guardada. Reintentá para recuperar el resultado de la misma solicitud; evitá crear otra reserva.',
        true,
      );
      renderControls();
      return;
    }
    state.pending = null;
    state.uncertain = false;
    if (error.code === 'CONFIGURATION_CHANGED') {
      reset(errorMessage(error));
    } else if (error.status === 409) {
      invalidateSlot();
      showStep(2);
      void loadTimes();
    } else renderControls();
    message(errorMessage(error), error.status !== 409);
  }
}

services.addEventListener('change', (event) => {
  if (state.submitting || state.uncertain) return;
  controller?.abort();
  generation += 1;
  state.loading = false;
  slots.replaceChildren();
  state.serviceId = event.target.value;
  invalidateSlot();
  state.availability = null;
  const service = state.catalog.services.find(({ id }) => id === state.serviceId);
  if (!service.professionalIds.includes(state.professionalId)) state.professionalId = 'any';
  renderProfessionals();
  renderSummary();
  renderControls();
  message('Servicio actualizado. Elegí un nuevo horario.');
});
barbers.addEventListener('change', (event) => selectProfessional(event.target.value));
barbers.addEventListener('click', (event) => {
  const button = event.target.closest('[data-portfolio-open]');
  if (button) openPortfolio(button.dataset.portfolioOpen, button);
});
$('#booking-portfolio-back').addEventListener('click', closePortfolio);
$('#booking-portfolio-select').addEventListener('click', () => {
  selectProfessional(state.portfolioId);
  closePortfolio();
});
dateInput.addEventListener('change', () => setDate(dateInput.value));
dates.addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (button) {
    setDate(button.dataset.date);
    focusVisible(dates.querySelector(`[data-date="${button.dataset.date}"]`));
  }
});
$('#booking-next-date').addEventListener('click', () => {
  setDate(addDays(state.date, 1));
  focusVisible(dateInput);
});
slots.addEventListener('change', (event) => {
  if (!state || state.submitting || state.uncertain) return;
  state.slot =
    state.availability?.slots.find(
      ({ startMinute }) => startMinute === Number(event.target.value),
    ) || null;
  state.pending = null;
  renderSummary();
  renderControls();
  message('Horario seleccionado. Revisá tu reserva antes de confirmar.');
});
progress.addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (button && !button.disabled) showStep(Number(button.dataset.step));
});
$('#booking-review').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit]');
  if (button && !button.disabled) showStep(Number(button.dataset.edit));
});
$('#booking-back').addEventListener('click', () => showStep(state.step - 1));
$('#booking-reset').addEventListener('click', reset);
for (const input of dialog.querySelectorAll('[id^="booking-customer-"]'))
  input.addEventListener('input', () => {
    if (state && !state.uncertain) state.pending = null;
  });
advance.addEventListener('click', () => {
  if (state.step === 4) return reset();
  if (state.step === 1 && state.serviceId) {
    state.visited = Math.max(state.visited, 2);
    showStep(2);
  } else if (state.step === 2 && state.slot) {
    state.visited = 3;
    showStep(3);
    message('Revisá tu selección antes de confirmar.');
  } else if (state.step === 3) void finishBooking();
});
$('#booking-retry')?.addEventListener('click', () => {
  if (state.pending) void finishBooking();
  else if (!state.catalog) void loadCatalog();
  else void loadTimes();
});
$('#booking-copy-link')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#booking-manage-link').href);
    message('Enlace privado copiado. No lo compartás: permite gestionar tu reserva.');
  } catch {
    message('No se pudo copiar. Abrí el enlace de gestión y guardalo de forma privada.');
  }
});
$('[data-booking-close]').addEventListener('click', () => {
  if (!state.submitting) dialog.close();
});
dialog.addEventListener('cancel', (event) => {
  if (state.submitting || state.portfolioId) {
    event.preventDefault();
    if (state.portfolioId) closePortfolio();
    else message('Esperá mientras se verifica la reserva.');
  }
});
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button, input, [href], [tabindex]')].filter(
    (node) => {
      if (node.disabled || node.tabIndex < 0 || !node.getClientRects().length) return false;
      if (node.type !== 'radio') return true;
      const group = [...dialog.querySelectorAll(`input[name="${node.name}"]`)];
      return node === (group.find((input) => input.checked) || group[0]);
    },
  );
  if (
    event.shiftKey &&
    (document.activeElement === controls[0] || !controls.includes(document.activeElement))
  ) {
    event.preventDefault();
    controls.at(-1)?.focus();
  } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
    event.preventDefault();
    controls[0]?.focus();
  }
});
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  controller?.abort();
  generation += 1;
  portfolioOpener = null;
  $('#booking-portfolio-works').replaceChildren();
  if (!state?.uncertain && !state?.receipt) state = null;
  document.body.classList.remove('booking-open');
  document.title = originalTitle;
  opener?.focus({ preventScroll: true });
});

export function openBooking(trigger) {
  if (dialog.open) return;
  opener = trigger;
  document.body.classList.add('booking-open');
  dialog.showModal();
  if (state?.receipt || state?.uncertain) {
    showStep(state.receipt ? 4 : 3);
    if (state.uncertain)
      message('Resultado pendiente de verificar. Reintentá la misma solicitud.', true);
  } else reset();
}
