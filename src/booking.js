import {
  SERVICES,
  BARBERS,
  dateRange,
  addDays,
  isDateKey,
  openingHours,
  availableSlots,
  nextAvailableDate,
  formatDate,
  formatTime,
} from './booking-model.js';

const dialog = document.querySelector('#booking-dialog');
const services = dialog.querySelector('#booking-services');
const barbers = dialog.querySelector('#booking-barbers');
const dateInput = dialog.querySelector('#booking-date');
const dates = dialog.querySelector('#booking-dates');
const slots = dialog.querySelector('#booking-slots');
const empty = dialog.querySelector('#booking-empty');
const nextDate = dialog.querySelector('#booking-next-date');
const status = dialog.querySelector('#booking-status');
const advance = dialog.querySelector('#booking-continue');
const back = dialog.querySelector('#booking-back');
const progress = dialog.querySelector('.booking-progress');
const originalTitle = document.title;
let opener;
let state;

function newState() {
  return { step: 1, visited: 1, serviceId: '', barberId: 'any', date: dateRange().min, slot: null };
}

function invalidateSlot() {
  state.slot = null;
  state.visited = Math.min(state.visited, 2);
}

function selectedService() {
  return SERVICES.find(({ id }) => id === state.serviceId);
}

function currentSlots() {
  return availableSlots(state);
}

function validSlot() {
  return state.slot && currentSlots().find(({ start }) => start === state.slot.start);
}

function radio(name, value, title, detail = '') {
  return `<label class="booking-option"><input type="radio" name="${name}" value="${value}" />
    <span class="booking-option-copy"><strong>${title}</strong>${detail ? `<span>${detail}</span>` : ''}</span>
    <span class="booking-option-check" aria-hidden="true"></span></label>`;
}

services.innerHTML = SERVICES.map((service) =>
  radio(
    'demo-service',
    service.id,
    service.name,
    `${service.description}<span class="booking-service-meta">${service.duration} min · C$ ${service.price} <small>precio ficticio</small></span>`,
  ),
).join('');
barbers.innerHTML =
  radio('demo-barber', 'any', 'Sin preferencia', 'Cualquier profesional de la demo') +
  BARBERS.map(({ id, name }) => radio('demo-barber', id, name, 'De demostración')).join('');

function selectionRows() {
  const service = selectedService();
  const professional = BARBERS.find(
    ({ id }) => id === (state.slot?.barberIds[0] || state.barberId),
  );
  return [
    ['Servicio', service?.name || 'Por elegir', 1],
    [
      'Duración y precio de ejemplo',
      service ? `${service.duration} min · C$ ${service.price} NIO` : 'Por elegir',
      1,
    ],
    [
      'Profesional ficticio',
      professional
        ? `${professional.label}${state.barberId === 'any' ? ' · sin preferencia' : ''}`
        : 'Sin preferencia',
      2,
    ],
    ['Fecha', state.date ? formatDate(state.date) : 'Por elegir', 2],
    [
      'Horario ficticio',
      state.slot ? `${formatTime(state.slot.start)} – ${formatTime(state.slot.end)}` : 'Por elegir',
      2,
    ],
  ];
}

function renderSummary() {
  const rows = selectionRows();
  dialog.querySelector('#booking-summary').innerHTML = rows
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('');
  dialog.querySelector('#booking-review').innerHTML = rows
    .map(
      ([label, value, step]) =>
        `<div class="booking-review-row"><dl><dt>${label}</dt><dd>${value}</dd></dl>
    <button class="booking-text-button" type="button" data-edit="${step}" aria-label="Editar ${label.toLowerCase()}">Editar</button></div>`,
    )
    .join('');
}

function renderControls() {
  for (const button of progress.querySelectorAll('[data-step]')) {
    const step = Number(button.dataset.step);
    button.disabled = step > state.visited;
    if (step === state.step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  progress.hidden = state.step === 4;
  dialog.querySelector('.booking-summary').hidden = state.step === 3;
  dialog.querySelector('.booking-body').classList.toggle('booking-body-review', state.step === 3);
  back.hidden = state.step === 1 || state.step === 4;
  dialog.querySelector('#booking-reset').hidden = state.step === 4;
  advance.textContent =
    state.step === 3 ? 'Completar simulación' : state.step === 4 ? 'Nueva simulación' : 'Continuar';
  advance.disabled = state.step === 1 ? !state.serviceId : state.step === 2 ? !state.slot : false;
}

function announce(message) {
  status.textContent = message;
}

function showStep(step) {
  state.step = step;
  for (const panel of dialog.querySelectorAll('[data-panel]'))
    panel.hidden = Number(panel.dataset.panel) !== step;
  renderSummary();
  renderControls();
  const heading = dialog.querySelector(`[data-panel="${step}"] h3`);
  document.title =
    step === 4
      ? `Demo finalizada · ${originalTitle}`
      : `Paso ${step} de 3 · Demo de reserva · ${originalTitle}`;
  dialog.scrollTop = 0;
  heading.focus({ preventScroll: true });
}

function renderDates() {
  const range = dateRange();
  dateInput.min = range.min;
  dateInput.max = range.max;
  dateInput.value = state.date;
  dates.innerHTML = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(range.min, offset);
    const closed = !openingHours(date);
    return `<button class="booking-date" type="button" data-date="${date}" aria-pressed="${state.date === date}"
      aria-label="${formatDate(date)}${closed ? ', cerrado' : ''}">
      <span>${formatDate(date, { weekday: 'short' })}</span><strong>${Number(date.slice(-2))}</strong>
      <span>${closed ? 'Cerrado' : formatDate(date, { month: 'short' })}</span></button>`;
  }).join('');
}

function renderTimes() {
  const available = currentSlots();
  slots.innerHTML = available
    .map(({ start }) => radio('demo-slot', start, formatTime(start)))
    .join('');
  if (state.slot) {
    const input = slots.querySelector(`input[value="${state.slot.start}"]`);
    if (input) input.checked = true;
    else invalidateSlot();
  }
  const service = selectedService();
  const hours = state.date && openingHours(state.date);
  dialog.querySelector('#booking-slot-help').textContent = available.length
    ? `${available.length} turnos ficticios para ${service.duration} min. Hora de Nicaragua.`
    : 'Disponibilidad simulada, sin conexión con la agenda del negocio.';
  empty.hidden = available.length > 0;
  dialog.querySelector('.booking-time-options').hidden = available.length === 0;
  const range = dateRange();
  const validDate = isDateKey(state.date) && state.date >= range.min && state.date <= range.max;
  dateInput.setAttribute('aria-invalid', String(!validDate));
  dialog.querySelector('#booking-empty-message').textContent = !validDate
    ? 'Elegí una fecha dentro de los próximos 21 días.'
    : !hours
      ? 'El martes está cerrado según el horario base. Elegí otro día para probar la demo.'
      : 'No quedan horarios de ejemplo para esta selección. Probá otra fecha o profesional.';
  nextDate.hidden = !validDate;
  if (validDate) {
    const next = nextAvailableDate(state);
    nextDate.disabled = !next;
    nextDate.textContent = next
      ? `Ver turnos demo: ${formatDate(next, { weekday: 'short', day: 'numeric', month: 'short' })}`
      : 'No hay más turnos demo en estos 21 días';
  }
  renderSummary();
  renderControls();
  return available;
}

function setDate(date) {
  const range = dateRange();
  state.date = isDateKey(date) && date >= range.min && date <= range.max ? date : '';
  invalidateSlot();
  renderDates();
  const available = renderTimes();
  announce(
    state.date
      ? `${formatDate(state.date)}. ${available.length} horarios ficticios. Seleccioná un nuevo horario.`
      : 'La fecha no es válida. Elegí una fecha dentro de los próximos 21 días.',
  );
}

function reset() {
  state = newState();
  for (const input of services.querySelectorAll('input')) input.checked = false;
  for (const input of barbers.querySelectorAll('input')) input.checked = input.value === 'any';
  renderDates();
  renderTimes();
  announce('Demo reiniciada. Elegí un servicio de ejemplo.');
  showStep(1);
}

services.addEventListener('change', (event) => {
  state.serviceId = event.target.value;
  invalidateSlot();
  renderTimes();
  const service = selectedService();
  announce(
    `${service.name}, ${service.duration} minutos, precio ficticio C$ ${service.price}. El horario anterior se descartó.`,
  );
});
barbers.addEventListener('change', (event) => {
  state.barberId = event.target.value;
  invalidateSlot();
  const available = renderTimes();
  announce(`${available.length} horarios ficticios. Seleccioná un nuevo horario.`);
});
dateInput.addEventListener('change', () => setDate(dateInput.value));
dates.addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (!button) return;
  setDate(button.dataset.date);
  dates.querySelector(`[data-date="${button.dataset.date}"]`).focus({ preventScroll: true });
});
slots.addEventListener('change', (event) => {
  state.slot = currentSlots().find(({ start }) => start === Number(event.target.value)) || null;
  renderSummary();
  renderControls();
  if (state.slot)
    announce(`Horario ficticio: ${formatTime(state.slot.start)} a ${formatTime(state.slot.end)}.`);
});
nextDate.addEventListener('click', () => {
  const next = nextAvailableDate(state);
  if (!next) return;
  setDate(next);
  dateInput.focus({ preventScroll: true });
});
progress.addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (button && !button.disabled) showStep(Number(button.dataset.step));
});
dialog.querySelector('#booking-review').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit]');
  if (button) showStep(Number(button.dataset.edit));
});
back.addEventListener('click', () => showStep(state.step - 1));
dialog.querySelector('#booking-reset').addEventListener('click', reset);
advance.addEventListener('click', () => {
  if (state.step === 4) return reset();
  if (state.step === 1) {
    if (!selectedService()) return;
    renderTimes();
    state.visited = Math.max(state.visited, 2);
    showStep(2);
    return;
  }
  const slot = validSlot();
  if (!slot) {
    invalidateSlot();
    renderTimes();
    showStep(2);
    announce('Ese horario de ejemplo ya pasó o cambió. Seleccioná otro horario para continuar.');
    return;
  }
  state.slot = slot;
  if (state.step === 2) {
    state.visited = 3;
    showStep(3);
  } else if (state.step === 3) showStep(4);
});
dialog.querySelector('[data-booking-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button, input, [href], [tabindex]')].filter(
    (el) => {
      if (el.disabled || el.tabIndex < 0 || !el.getClientRects().length) return false;
      if (el.type !== 'radio') return true;
      const group = [...dialog.querySelectorAll(`input[name="${el.name}"]`)];
      return el === (group.find((radio) => radio.checked) || group[0]);
    },
  );
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !controls.includes(active))) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
});
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  state = null;
  document.body.classList.remove('booking-open');
  document.title = originalTitle;
  opener?.focus({ preventScroll: true });
});

export function openBooking(trigger) {
  if (dialog.open) return;
  opener = trigger;
  document.body.classList.add('booking-open');
  dialog.showModal();
  reset();
}
