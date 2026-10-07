import {
  SERVICES,
  PROFESSIONALS,
  DEMO_STORAGE_KEY,
  createDemoStore,
  dateRange,
  addDays,
} from './demo-store.js';

const byId = (id) => document.getElementById(id);
const store = createDemoStore();
let clientMinute = null;
let editMinute = null;
let editing = null;
let pendingConfirmation = null;
let dialogOpener = null;
let busy = false;
const editDialog = byId('demo-edit-dialog');
const confirmDialog = byId('demo-confirm-dialog');
const formatPrice = (value) => `C$${value}`;
const serviceById = (id) => SERVICES.find((service) => service.id === id);
const professionalById = (id) => PROFESSIONALS.find((professional) => professional.id === id);
const time = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const readableTime = (minute) =>
  `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${minute < 720 ? 'a. m.' : 'p. m.'}`;
const readableDate = (value) =>
  new Intl.DateTimeFormat('es-NI', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
const minuteFromInput = (value) =>
  /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

function announce(message, error = false) {
  byId('demo-feedback').textContent = message;
  byId('demo-feedback').dataset.error = String(error);
}
function options(select, items, anyLabel) {
  select.replaceChildren();
  if (anyLabel) {
    const option = node('option', anyLabel);
    option.value = 'any';
    select.append(option);
  }
  for (const item of items) {
    const option = node('option', item.name);
    option.value = item.id;
    select.append(option);
  }
}
function applyDates() {
  const range = dateRange(new Date());
  for (const id of ['demo-date', 'demo-admin-date', 'demo-edit-date']) {
    byId(id).min = range.min;
    byId(id).max = range.max;
  }
  return range;
}
function suggestedDate() {
  const range = applyDates();
  for (let date = range.min; date <= range.max; date = addDays(date, 1)) {
    if (store.availableSlots({ date, serviceId: SERVICES[0].id, professionalId: 'any' }).length)
      return date;
  }
  return range.min;
}
function slotButtons(target, slots, selected, choose) {
  target.replaceChildren();
  if (!slots.length) {
    target.append(node('p', 'No hay horarios de prueba en esta fecha. Elegí otro día.'));
    return;
  }
  for (const slot of slots) {
    const button = node('button', readableTime(slot.startMinute));
    button.type = 'button';
    button.dataset.minute = String(slot.startMinute);
    button.setAttribute('aria-pressed', String(slot.startMinute === selected));
    button.addEventListener('click', () => choose(slot.startMinute));
    target.append(button);
  }
}
function renderClientSlots() {
  const service = serviceById(byId('demo-service').value);
  byId('demo-selection-note').textContent =
    `${service.name} · ${formatPrice(service.priceNio)} · ${service.durationMinutes} min + 5 min de preparación.`;
  const slots = store.availableSlots({
    serviceId: service.id,
    professionalId: byId('demo-professional').value,
    date: byId('demo-date').value,
  });
  if (!slots.some((slot) => slot.startMinute === clientMinute)) clientMinute = null;
  slotButtons(byId('demo-slots'), slots, clientMinute, (minute) => {
    clientMinute = minute;
    renderClientSlots();
    byId('demo-slots').querySelector(`[data-minute="${minute}"]`)?.focus({ preventScroll: true });
  });
  byId('demo-submit').disabled = busy || clientMinute === null;
}
function actionButton(label, action, id, actor) {
  const button = node('button', label);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = id;
  button.dataset.actor = actor;
  return button;
}
function appointmentCard(appointment, actor) {
  const card = node('article', undefined, 'demo-entry');
  card.dataset.appointmentId = appointment.id;
  const service = serviceById(appointment.serviceId);
  card.append(node('h3', `${appointment.label} · ${service.name}`));
  card.append(
    node(
      'p',
      `${readableDate(appointment.date)} · ${readableTime(appointment.startMinute)}–${readableTime(appointment.endMinute)}`,
    ),
  );
  card.append(
    node(
      'p',
      `${professionalById(appointment.professionalId).name} · ${formatPrice(service.priceNio)}`,
      'demo-muted',
    ),
  );
  card.append(
    node(
      'p',
      appointment.status === 'cancelled' ? 'Cancelada en la demo' : 'Programada en la demo',
    ),
  );
  const beforeCutoff =
    Date.parse(`${appointment.date}T00:00:00-06:00`) +
      appointment.startMinute * 60000 -
      Date.now() >=
    3600000;
  if (appointment.status === 'confirmed' && (actor === 'admin' || beforeCutoff)) {
    const actions = node('div', undefined, 'demo-entry-actions');
    actions.append(
      actionButton('Reprogramar', 'edit', appointment.id, actor),
      actionButton('Cancelar', 'cancel', appointment.id, actor),
    );
    card.append(actions);
  } else if (appointment.status === 'confirmed') {
    card.append(
      node(
        'p',
        'Ya pasó el plazo de 1 hora para cambios del cliente. Para seguir probando, creá una nueva cita demo.',
        'demo-muted',
      ),
    );
  }
  return card;
}
function renderEntries() {
  const state = store.getState();
  const client = byId('demo-client-entries');
  client.replaceChildren();
  const mine = state.appointments.filter((appointment) => appointment.source === 'client');
  if (!mine.length)
    client.append(
      node(
        'p',
        'Tu primera cita de prueba aparecerá aquí. Podrás gestionarla y verla también en Administración.',
        'demo-muted',
      ),
    );
  mine
    .slice()
    .reverse()
    .forEach((appointment) => client.append(appointmentCard(appointment, 'customer')));
  const admin = byId('demo-admin-entries');
  admin.replaceChildren();
  const date = byId('demo-admin-date').value;
  const professional = byId('demo-admin-professional').value;
  const matches = (entry) =>
    entry.date === date && (professional === 'any' || professional === entry.professionalId);
  const appointments = state.appointments
    .filter(matches)
    .sort((a, b) => a.startMinute - b.startMinute);
  const blocks = state.blocks.filter((entry) => matches(entry) && entry.status !== 'cancelled');
  appointments.forEach((appointment) => admin.append(appointmentCard(appointment, 'admin')));
  for (const block of blocks) {
    const card = node('article', undefined, 'demo-entry');
    card.dataset.blockId = block.id;
    card.append(
      node('h3', 'Horario bloqueado · demo'),
      node(
        'p',
        `${readableTime(block.startMinute)}–${readableTime(block.endMinute)} · ${professionalById(block.professionalId).name}`,
      ),
      actionButton('Quitar bloqueo', 'unblock', block.id, 'admin'),
    );
    admin.append(card);
  }
  if (!appointments.length && !blocks.length)
    admin.append(node('p', 'No hay citas ni bloqueos de prueba para este filtro.', 'demo-muted'));
  byId('demo-persona-note').textContent =
    `Vista simulada: ${byId('demo-persona').value === 'owner' ? 'Dueño' : 'Jonathan'}. Podés gestionar las citas de esta demo.`;
  const status = store.getStatus();
  byId('demo-storage-status').textContent =
    status.persistence === 'local'
      ? 'La demo conserva los cambios al recargar este navegador. Reiniciar borra solo estos datos de prueba.'
      : 'El navegador no permite guardar la demo. Podés probarla en esta pestaña; los cambios no se conservarán al recargar.';
  if (status.recovered)
    byId('demo-storage-status').textContent =
      `${status.message} ${byId('demo-storage-status').textContent}`;
}
function render() {
  applyDates();
  renderClientSlots();
  renderEntries();
}
function showView(admin, historyMode = 'push') {
  const hash = admin ? '#administracion' : '#reservar';
  if (historyMode === 'push' && location.hash !== hash) history.pushState(null, '', hash);
  byId('demo-client-pane').hidden = admin;
  byId('demo-admin-pane').hidden = !admin;
  byId('demo-client-tab').setAttribute('aria-pressed', String(!admin));
  byId('demo-admin-tab').setAttribute('aria-pressed', String(admin));
  if (admin) byId('demo-admin-date').value = byId('demo-date').value;
  renderEntries();
}
async function perform(operation, success, onSuccess) {
  if (busy) return;
  busy = true;
  try {
    const result = await operation();
    if (!result.ok) {
      announce(result.error.message, true);
      return result;
    }
    onSuccess?.(result);
    announce(success);
    return result;
  } catch {
    announce(
      'No se pudo completar la acción de prueba. Reiniciá la demo si el problema continúa.',
      true,
    );
  } finally {
    busy = false;
    render();
  }
}
function renderEditSlots() {
  if (!editing) return;
  const appointment = store.getState().appointments.find((entry) => entry.id === editing.id);
  if (!appointment || appointment.status !== 'confirmed') {
    editDialog.close();
    announce('La cita de prueba cambió. Revisá la agenda.', true);
    return;
  }
  const slots = store.availableSlots({
    date: byId('demo-edit-date').value,
    serviceId: appointment.serviceId,
    professionalId: byId('demo-edit-professional').value,
    actor: editing.actor,
    excludeId: appointment.id,
  });
  if (!slots.some((slot) => slot.startMinute === editMinute)) editMinute = null;
  slotButtons(byId('demo-edit-slots'), slots, editMinute, (minute) => {
    editMinute = minute;
    renderEditSlots();
    byId('demo-edit-slots')
      .querySelector(`[data-minute="${minute}"]`)
      ?.focus({ preventScroll: true });
  });
  byId('demo-edit-save').disabled = editMinute === null || busy;
}
function openEdit(appointment, actor, opener) {
  editing = { id: appointment.id, expectedVersion: appointment.version, actor };
  dialogOpener = opener;
  editMinute = appointment.startMinute;
  byId('demo-edit-date').value = appointment.date;
  byId('demo-edit-professional').value = appointment.professionalId;
  byId('demo-edit-description').textContent =
    `${appointment.label} · ${serviceById(appointment.serviceId).name}. Este cambio afecta solo a la demo.`;
  byId('demo-edit-error').textContent = '';
  renderEditSlots();
  editDialog.showModal();
}
function confirmation(copy, label, action, opener) {
  pendingConfirmation = action;
  dialogOpener = opener;
  byId('demo-confirm-copy').textContent = copy;
  byId('demo-confirm-action').textContent = label;
  confirmDialog.showModal();
}

for (const id of ['demo-service', 'demo-walkin-service']) options(byId(id), SERVICES);
for (const id of ['demo-professional', 'demo-admin-professional'])
  options(byId(id), PROFESSIONALS, id === 'demo-professional' ? 'Cualquiera · demo' : 'Todos');
for (const id of ['demo-walkin-professional', 'demo-block-professional', 'demo-edit-professional'])
  options(byId(id), PROFESSIONALS);
const firstDate = suggestedDate();
byId('demo-date').value = firstDate;
byId('demo-admin-date').value = firstDate;
const firstSlot = store.availableSlots({
  serviceId: SERVICES[0].id,
  date: firstDate,
  actor: 'admin',
})[0];
if (firstSlot) {
  byId('demo-walkin-professional').value = firstSlot.professionalIds[0];
  byId('demo-block-professional').value = firstSlot.professionalIds[0];
}
byId('demo-walkin-time').value = time(firstSlot?.startMinute ?? 780);
byId('demo-block-start').value = time(firstSlot?.startMinute ?? 780);
byId('demo-block-end').value = time((firstSlot?.startMinute ?? 780) + 30);
for (const id of ['demo-service', 'demo-professional', 'demo-date'])
  byId(id).addEventListener('change', () => {
    clientMinute = null;
    renderClientSlots();
  });
for (const id of ['demo-admin-date', 'demo-admin-professional', 'demo-persona'])
  byId(id).addEventListener('change', renderEntries);
for (const id of ['demo-edit-date', 'demo-edit-professional'])
  byId(id).addEventListener('change', () => {
    editMinute = null;
    renderEditSlots();
  });
byId('demo-client-tab').addEventListener('click', () => showView(false));
byId('demo-admin-tab').addEventListener('click', () => showView(true));
byId('demo-booking-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (clientMinute === null) return;
  const selected = store
    .availableSlots({
      date: byId('demo-date').value,
      serviceId: byId('demo-service').value,
      professionalId: byId('demo-professional').value,
    })
    .find((slot) => slot.startMinute === clientMinute);
  const professionalId =
    byId('demo-professional').value === 'any'
      ? selected?.professionalIds[0]
      : byId('demo-professional').value;
  void perform(
    () =>
      store.create({
        date: byId('demo-date').value,
        startMinute: clientMinute,
        serviceId: byId('demo-service').value,
        professionalId,
        actor: 'customer',
      }),
    'Cita de prueba creada. Podés reprogramarla, cancelarla o verla en Administración.',
    () => {
      clientMinute = null;
    },
  );
});
byId('demo-walkin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void perform(
    () =>
      store.create({
        date: byId('demo-admin-date').value,
        startMinute: minuteFromInput(byId('demo-walkin-time').value),
        serviceId: byId('demo-walkin-service').value,
        professionalId: byId('demo-walkin-professional').value,
        actor: 'admin',
      }),
    'Atención de prueba añadida a la agenda.',
  );
});
byId('demo-block-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void perform(
    () =>
      store.block({
        date: byId('demo-admin-date').value,
        startMinute: minuteFromInput(byId('demo-block-start').value),
        endMinute: minuteFromInput(byId('demo-block-end').value),
        professionalId: byId('demo-block-professional').value,
        actor: 'admin',
      }),
    'Horario bloqueado solo en la demo.',
  );
});
byId('demo-edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editing || editMinute === null) return;
  const result = await perform(
    () =>
      store.reschedule(editing.id, {
        actor: editing.actor,
        expectedVersion: editing.expectedVersion,
        date: byId('demo-edit-date').value,
        startMinute: editMinute,
        professionalId: byId('demo-edit-professional').value,
      }),
    'Cita de prueba reprogramada.',
  );
  if (result?.ok) editDialog.close();
  else if (result) {
    if (['STALE_STATE', 'STALE_VERSION', 'CANCELLED', 'NOT_FOUND'].includes(result.error.code))
      editDialog.close();
    else {
      renderEditSlots();
      byId('demo-edit-error').textContent = result.error.message;
    }
  }
});
document.querySelector('[data-close-edit]').addEventListener('click', () => editDialog.close());
for (const dialog of [editDialog, confirmDialog])
  dialog.addEventListener('close', () => {
    editing = null;
    pendingConfirmation = null;
    if (dialogOpener?.isConnected) dialogOpener.focus();
    else byId(byId('demo-admin-pane').hidden ? 'demo-client-tab' : 'demo-admin-tab').focus();
  });
byId('demo-confirm-back').addEventListener('click', () => confirmDialog.close());
byId('demo-confirm-action').addEventListener('click', async () => {
  if (!pendingConfirmation || busy) return;
  const action = pendingConfirmation;
  confirmDialog.close();
  await action();
});
byId('demo-reset').addEventListener('click', (event) =>
  confirmation(
    'Se borrarán las citas y bloqueos de esta demo y volverán los ejemplos iniciales. La agenda real no se modifica.',
    'Reiniciar datos de prueba',
    () =>
      perform(
        () => store.reset(),
        'Demo reiniciada.',
        () => {
          const date = suggestedDate();
          byId('demo-date').value = date;
          byId('demo-admin-date').value = date;
          clientMinute = null;
        },
      ),
    event.currentTarget,
  ),
);
for (const id of ['demo-client-entries', 'demo-admin-entries'])
  byId(id).addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;
    const { action, actor, id: entryId } = button.dataset;
    const state = store.getState();
    if (action === 'unblock') {
      const block = state.blocks.find((entry) => entry.id === entryId);
      if (block)
        void perform(
          () => store.unblock(entryId, { actor: 'admin', expectedVersion: block.version }),
          'Bloqueo de prueba retirado.',
        );
      return;
    }
    const appointment = state.appointments.find((entry) => entry.id === entryId);
    if (!appointment) return;
    if (action === 'edit') openEdit(appointment, actor, button);
    if (action === 'cancel')
      confirmation(
        `¿Cancelar ${appointment.label} en la demo? No se enviará ningún aviso.`,
        'Cancelar cita demo',
        () =>
          perform(
            () => store.cancel(entryId, { actor, expectedVersion: appointment.version }),
            'Cita de prueba cancelada.',
          ),
        button,
      );
  });
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== DEMO_STORAGE_KEY) return;
  editing = null;
  pendingConfirmation = null;
  if (editDialog.open) editDialog.close();
  if (confirmDialog.open) confirmDialog.close();
  store.refresh();
  render();
  announce('La demo cambió en otra pestaña. Revisá la agenda antes de continuar.');
});
function showRoute() {
  const admin = location.hash === '#administracion';
  const needsFocus = byId(admin ? 'demo-client-pane' : 'demo-admin-pane').contains(
    document.activeElement,
  );
  showView(admin, 'none');
  if (editDialog.open || confirmDialog.open) {
    editing = null;
    pendingConfirmation = null;
    dialogOpener = byId(admin ? 'demo-admin-tab' : 'demo-client-tab');
    if (editDialog.open) editDialog.close();
    if (confirmDialog.open) confirmDialog.close();
  } else if (needsFocus) byId(admin ? 'demo-admin-tab' : 'demo-client-tab').focus();
}
window.addEventListener('popstate', showRoute);
window.addEventListener('hashchange', showRoute);
render();
showRoute();
