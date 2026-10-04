import { AgendaError } from './contracts.ts';
import type {
  Actor,
  AgendaBackup,
  AgendaConfig,
  AgendaDependencies,
  AgendaService,
  Availability,
  AvailabilityQuery,
  Booking,
  BookingReceipt,
  Catalog,
  CreateBlockInput,
  CreateBookingInput,
  ListQuery,
  MutationContext,
  ProfessionalConfig,
  RescheduleInput,
  ScheduleBlock,
  ServiceConfig,
  SqlStatement,
  SqlStore,
} from './contracts.ts';
import { assertConfigured } from './config.ts';
import { canonicalStringify, hashConfiguration, hashValue } from './hash.ts';
import { BACKUP_TABLES } from './schema.ts';
import {
  addDays,
  assertDate,
  fromUtcSeconds,
  isoInstant,
  localDate,
  toUtcSeconds,
  weekday,
} from './time.ts';
import {
  actorScope,
  assertAdmin,
  assertContext,
  assertId,
  assertManagement,
  assertMinute,
  assertObject,
  assertVersion,
  cleanText,
  digestPattern,
} from './validation.ts';

interface Entry {
  id: string;
  kind: 'booking' | 'walk-in' | 'block';
  professional_id: string;
  professional_name: string;
  service_id: string | null;
  service_name: string | null;
  start_utc: number;
  end_utc: number;
  allocated_start_utc: number;
  allocated_end_utc: number;
  duration_minutes: number | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_minor_units: number | null;
  currency: 'NIO';
  status: 'confirmed' | 'cancelled';
  version: number;
  customer_display_name: string | null;
  customer_email: string | null;
  management_hash: string | null;
  block_label: string | null;
  created_at: number;
  updated_at: number;
}
interface IdempotencyRecord {
  request_hash: string;
  response_json: string;
}
interface Allocation {
  professional: ProfessionalConfig;
  start: number;
  end: number;
  allocatedStart: number;
  allocatedEnd: number;
}
interface NormalBooking extends CreateBookingInput {
  customer?: { displayName?: string; email?: string };
}

const entryColumns = [
  'id',
  'kind',
  'professional_id',
  'professional_name',
  'service_id',
  'service_name',
  'start_utc',
  'end_utc',
  'allocated_start_utc',
  'allocated_end_utc',
  'duration_minutes',
  'buffer_before_minutes',
  'buffer_after_minutes',
  'price_minor_units',
  'currency',
  'status',
  'version',
  'customer_display_name',
  'customer_email',
  'management_hash',
  'block_label',
  'created_at',
  'updated_at',
] as const;
const writeAssertion: SqlStatement = {
  sql: 'INSERT INTO agenda_write_guard(id, affected) VALUES(1, changes()) ON CONFLICT(id) DO UPDATE SET affected = excluded.affected',
};
const backupOrder: Record<(typeof BACKUP_TABLES)[number], string> = {
  agenda_configuration: 'business_id',
  agenda_entries: 'id',
  agenda_idempotency: 'scope, key',
  agenda_audit: 'id',
  agenda_outbox: 'id',
  agenda_rate_limits: 'scope, bucket',
};

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function mapStorageError(error: unknown): AgendaError {
  if (error instanceof AgendaError) return error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('AGENDA_SLOT_CONFLICT'))
    return new AgendaError(
      'SLOT_UNAVAILABLE',
      409,
      'Ese horario ya no está disponible. Elegí otro.',
    );
  if (message.includes('agenda_active_configuration'))
    return new AgendaError(
      'CONFIGURATION_CHANGED',
      503,
      'La configuración de la agenda cambió. Intentá de nuevo más tarde.',
    );
  if (message.includes('agenda_one_change'))
    return new AgendaError(
      'VERSION_CONFLICT',
      409,
      'La reserva cambió. Actualizá la información antes de continuar.',
    );
  return new AgendaError('STORAGE_UNAVAILABLE', 503, 'La agenda no está disponible temporalmente.');
}

/** Portable single-business domain. Identity and transport live in host adapters. */
export class PersistentAgenda implements AgendaService {
  private store: SqlStore;
  private config: AgendaConfig;
  private deps: AgendaDependencies;
  private configHash?: Promise<string>;

  constructor(store: SqlStore, config: AgendaConfig, dependencies?: Partial<AgendaDependencies>) {
    this.store = store;
    this.config = freeze(structuredClone(config));
    this.deps = {
      now: dependencies?.now ?? (() => new Date()),
      newId: dependencies?.newId ?? (() => crypto.randomUUID()),
    };
  }

  get configurationMode(): AgendaConfig['mode'] {
    return this.config.mode;
  }

  private now(): number {
    const value = this.deps.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new AgendaError('CONFIGURATION_REQUIRED', 503, 'Reloj de agenda no disponible.');
    return Math.floor(value.getTime() / 1000);
  }

  private id(): string {
    const value = this.deps.newId();
    assertId(value);
    return value;
  }

  private mode(): 'fixture' | 'production' {
    assertConfigured(this.config);
    return this.config.mode;
  }

  private assertConfigVersion(context: MutationContext): void {
    if (context.configVersion !== this.config.version) {
      throw new AgendaError(
        'CONFIGURATION_CHANGED',
        409,
        'El catálogo cambió. Revisá los servicios y precios antes de continuar.',
      );
    }
  }

  private requestHash(payload: unknown, context: MutationContext): Promise<string> {
    return hashValue({ configVersion: context.configVersion, payload });
  }

  private async configurationGuard(): Promise<SqlStatement> {
    this.mode();
    this.configHash ??= hashConfiguration(this.config);
    return {
      sql: 'INSERT INTO agenda_configuration_guard(id, valid) SELECT 1, CASE WHEN count(*) = 1 AND (SELECT count(*) FROM agenda_configuration) = 1 THEN 1 ELSE 0 END FROM agenda_configuration WHERE business_id = ? AND version = ? AND config_hash = ? ON CONFLICT(id) DO UPDATE SET valid = excluded.valid',
      params: [this.config.businessId, this.config.version, await this.configHash],
    };
  }

  private async configured(): Promise<void> {
    const guard = await this.configurationGuard();
    const rows = await this.read<{ business_id: string; version: number; config_hash: string }>(
      'SELECT business_id, version, config_hash FROM agenda_configuration',
    );
    if (rows.length > 0) {
      const row = rows[0];
      if (
        rows.length !== 1 ||
        row.business_id !== this.config.businessId ||
        row.version !== this.config.version ||
        row.config_hash !== (await this.configHash!)
      ) {
        throw new AgendaError(
          'CONFIGURATION_CHANGED',
          503,
          'La configuración de la agenda cambió. Intentá de nuevo más tarde.',
        );
      }
      return;
    }
    try {
      await this.store.batch([
        {
          // Configuration cannot be reconstructed over orphaned private data.
          // Keep the ownership and empty-data checks in the same transaction;
          // rate buckets and ephemeral guards may legitimately precede setup.
          sql: 'INSERT INTO agenda_configuration(business_id, version, config_hash, config_json) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM agenda_configuration) AND NOT EXISTS (SELECT 1 FROM agenda_entries) AND NOT EXISTS (SELECT 1 FROM agenda_idempotency) AND NOT EXISTS (SELECT 1 FROM agenda_audit) AND NOT EXISTS (SELECT 1 FROM agenda_outbox)',
          params: [
            this.config.businessId,
            this.config.version,
            await this.configHash!,
            canonicalStringify(this.config),
          ],
        },
        guard,
      ]);
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  private async read<T>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    try {
      return await this.store.all<T>(sql, params);
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  private dateBounds(): { min: string; max: string } {
    const min = localDate(new Date(this.now() * 1000));
    return { min, max: addDays(min, this.config.maxAdvanceDays) };
  }

  private assertBookableDate(date: string): void {
    assertDate(date);
    const bounds = this.dateBounds();
    if (date < bounds.min || date > bounds.max)
      throw new AgendaError('INVALID_INPUT', 400, 'Fecha fuera del período de reservas.');
  }

  private service(id: string): ServiceConfig {
    assertId(id);
    const service = this.config.services.find((candidate) => candidate.id === id);
    if (!service) throw new AgendaError('INVALID_INPUT', 400, 'Servicio no disponible.');
    return service;
  }

  private professional(id: string): ProfessionalConfig {
    assertId(id);
    const professional = this.config.professionals.find((candidate) => candidate.id === id);
    if (!professional) throw new AgendaError('INVALID_INPUT', 400, 'Profesional no disponible.');
    return professional;
  }

  private professionals(service: ServiceConfig, id?: string): ProfessionalConfig[] {
    if (id !== undefined) {
      const professional = this.professional(id);
      if (!service.professionalIds.includes(id))
        throw new AgendaError(
          'INVALID_INPUT',
          400,
          'Este profesional no realiza el servicio seleccionado.',
        );
      return [professional];
    }
    return service.professionalIds.map((eligible) => this.professional(eligible));
  }

  private normalBooking(input: CreateBookingInput): NormalBooking {
    assertObject(input, [
      'serviceId',
      'professionalId',
      'date',
      'startMinute',
      'customer',
      'managementHash',
    ]);
    assertId(input.serviceId);
    if (input.professionalId !== undefined) assertId(input.professionalId);
    assertDate(input.date);
    assertMinute(input.startMinute);
    if (
      input.managementHash !== undefined &&
      (typeof input.managementHash !== 'string' || !digestPattern.test(input.managementHash))
    ) {
      throw new AgendaError('INVALID_INPUT', 400, 'Credencial de gestión inválida.');
    }
    let customer: NormalBooking['customer'];
    if (input.customer !== undefined) {
      assertObject(input.customer, ['displayName', 'email']);
      const displayName = cleanText(input.customer.displayName, 80, false);
      const email = cleanText(input.customer.email, 254, false);
      if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new AgendaError('INVALID_INPUT', 400, 'Correo inválido.');
      customer = {
        ...(displayName === undefined ? {} : { displayName }),
        ...(email === undefined ? {} : { email }),
      };
    }
    return {
      serviceId: input.serviceId,
      date: input.date,
      startMinute: input.startMinute,
      ...(input.professionalId === undefined ? {} : { professionalId: input.professionalId }),
      ...(input.managementHash === undefined ? {} : { managementHash: input.managementHash }),
      ...(customer === undefined ? {} : { customer }),
    };
  }

  private allocation(
    service: ServiceConfig,
    professional: ProfessionalConfig,
    date: string,
    startMinute: number,
    skipLead = false,
  ): Allocation | null {
    const endMinute = startMinute + service.durationMinutes;
    const allocatedMinute = startMinute - service.bufferBeforeMinutes;
    const allocatedEndMinute = endMinute + service.bufferAfterMinutes;
    if (
      !professional.weeklyHours[weekday(date)].some(
        ([open, close]) => allocatedMinute >= open && allocatedEndMinute <= close,
      )
    )
      return null;
    const start = toUtcSeconds(date, startMinute);
    const end = toUtcSeconds(date, endMinute);
    if (!skipLead && start < this.now() + this.config.minLeadMinutes * 60) return null;
    if (skipLead && end <= this.now()) return null;
    return {
      professional,
      start,
      end,
      allocatedStart: start - service.bufferBeforeMinutes * 60,
      allocatedEnd: end + service.bufferAfterMinutes * 60,
    };
  }

  private async occupied(date: string, ignoreId?: string): Promise<Entry[]> {
    return this.read<Entry>(
      "SELECT * FROM agenda_entries WHERE status = 'confirmed' AND allocated_start_utc < ? AND allocated_end_utc > ? AND (? IS NULL OR id != ?)",
      [toUtcSeconds(date, 1440), toUtcSeconds(date, 0), ignoreId ?? null, ignoreId ?? null],
    );
  }

  private conflict(allocation: Allocation, entries: Entry[]): boolean {
    return entries.some(
      (entry) =>
        entry.professional_id === allocation.professional.id &&
        entry.allocated_start_utc < allocation.allocatedEnd &&
        entry.allocated_end_utc > allocation.allocatedStart,
    );
  }

  async catalog(): Promise<Catalog> {
    await this.configured();
    return {
      mode: this.mode(),
      configVersion: this.config.version,
      businessName: this.config.businessName,
      timeZone: this.config.timeZone,
      currency: this.config.currency,
      services: structuredClone(this.config.services),
      professionals: structuredClone(this.config.professionals),
      dateRange: this.dateBounds(),
      slotStepMinutes: this.config.slotStepMinutes,
      cancellationLeadMinutes: this.config.cancellationLeadMinutes,
      notifications: 'disabled',
      customerManagement: 'token',
    };
  }

  async availability(query: AvailabilityQuery): Promise<Availability> {
    await this.configured();
    assertObject(query, ['serviceId', 'professionalId', 'date']);
    assertDate(query.date);
    const service = this.service(query.serviceId);
    const professionals = this.professionals(service, query.professionalId);
    const bounds = this.dateBounds();
    if (query.date > bounds.max)
      throw new AgendaError('INVALID_INPUT', 400, 'Fecha fuera del período de reservas.');
    const result: Availability = {
      date: query.date,
      timeZone: this.config.timeZone,
      mode: this.mode(),
      slots: [],
      reason: 'full',
    };
    if (query.date < bounds.min) return { ...result, reason: 'past' };
    const entries = await this.occupied(query.date);
    let hasHours = false;
    let hasFuture = false;
    for (let minute = 0; minute < 1440; minute += this.config.slotStepMinutes) {
      const professionalIds: string[] = [];
      for (const professional of professionals) {
        if (professional.weeklyHours[weekday(query.date)].length > 0) hasHours = true;
        const allocation = this.allocation(service, professional, query.date, minute);
        if (!allocation) continue;
        hasFuture = true;
        if (!this.conflict(allocation, entries)) professionalIds.push(professional.id);
      }
      if (professionalIds.length > 0)
        result.slots.push({
          startMinute: minute,
          endMinute: minute + service.durationMinutes,
          professionalIds,
        });
    }
    result.reason =
      result.slots.length > 0
        ? 'available'
        : !hasHours
          ? 'closed'
          : !hasFuture && query.date === bounds.min
            ? 'past'
            : 'full';
    return result;
  }

  private receipt(entry: Entry): BookingReceipt {
    if (entry.kind === 'block') throw new AgendaError('NOT_FOUND', 404, 'Reserva no encontrada.');
    const start = fromUtcSeconds(entry.start_utc);
    const end = fromUtcSeconds(entry.end_utc);
    const booking: Booking = {
      id: entry.id,
      kind: entry.kind,
      serviceId: entry.service_id!,
      serviceName: entry.service_name!,
      professionalId: entry.professional_id,
      professionalName: entry.professional_name,
      date: start.date,
      startMinute: start.minute,
      endMinute: end.date === start.date ? end.minute : 1440,
      startAt: isoInstant(entry.start_utc),
      endAt: isoInstant(entry.end_utc),
      durationMinutes: entry.duration_minutes!,
      priceMinorUnits: entry.price_minor_units!,
      currency: entry.currency,
      status: entry.status,
      version: entry.version,
      ...(entry.customer_display_name === null
        ? {}
        : { customerDisplayName: entry.customer_display_name }),
    };
    return {
      booking,
      mode: this.mode(),
      notification: 'disabled',
      customerManagement: entry.management_hash ? 'token' : 'admin-only',
    };
  }

  private block(entry: Entry): ScheduleBlock {
    if (entry.kind !== 'block') throw new AgendaError('NOT_FOUND', 404, 'Bloqueo no encontrado.');
    const start = fromUtcSeconds(entry.start_utc);
    const end = fromUtcSeconds(entry.end_utc);
    return {
      id: entry.id,
      professionalId: entry.professional_id,
      date: start.date,
      startMinute: start.minute,
      endMinute: end.date === start.date ? end.minute : 1440,
      label: entry.block_label!,
      status: entry.status === 'confirmed' ? 'active' : 'cancelled',
      version: entry.version,
    };
  }

  private async entry(id: string): Promise<Entry> {
    assertId(id);
    const rows = await this.read<Entry>('SELECT * FROM agenda_entries WHERE id = ?', [id]);
    if (!rows[0]) throw new AgendaError('NOT_FOUND', 404, 'Registro no encontrado.');
    return rows[0];
  }

  private async replay<T>(
    scope: string,
    context: MutationContext,
    hash: string,
  ): Promise<T | undefined> {
    const rows = await this.read<IdempotencyRecord>(
      'SELECT request_hash, response_json FROM agenda_idempotency WHERE scope = ? AND key = ?',
      [scope, context.idempotencyKey],
    );
    if (!rows[0]) return undefined;
    if (rows[0].request_hash !== hash)
      throw new AgendaError(
        'IDEMPOTENCY_CONFLICT',
        409,
        'La clave de idempotencia ya se usó para otra solicitud.',
      );
    try {
      return JSON.parse(rows[0].response_json) as T;
    } catch {
      throw new AgendaError(
        'STORAGE_UNAVAILABLE',
        503,
        'La agenda no está disponible temporalmente.',
      );
    }
  }

  private idem(
    scope: string,
    context: MutationContext,
    hash: string,
    response: unknown,
    now: number,
  ): SqlStatement {
    return {
      sql: 'INSERT INTO agenda_idempotency(scope, key, request_hash, response_json, created_at) VALUES(?, ?, ?, ?, ?)',
      params: [scope, context.idempotencyKey, hash, JSON.stringify(response), now],
    };
  }

  private audit(entry: Entry, action: string, context: MutationContext, now: number): SqlStatement {
    const actorId =
      context.actor.kind === 'admin'
        ? context.actor.id
        : context.actor.kind === 'customer'
          ? context.actor.reservationId
          : null;
    return {
      sql: 'INSERT INTO agenda_audit(id, entry_id, action, actor_kind, actor_id, entry_version, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
      params: [this.id(), entry.id, action, context.actor.kind, actorId, entry.version, now],
    };
  }

  private outbox(entry: Entry, event: string, now: number): SqlStatement {
    return {
      sql: "INSERT INTO agenda_outbox(id, entry_id, event_type, entry_version, recipient, payload_json, status, attempts, created_at) VALUES(?, ?, ?, ?, ?, ?, 'disabled', 0, ?)",
      params: [
        this.id(),
        entry.id,
        event,
        entry.version,
        entry.customer_email,
        JSON.stringify(this.receipt(entry)),
        now,
      ],
    };
  }

  private insert(entry: Entry): SqlStatement {
    return {
      sql: `INSERT INTO agenda_entries(${entryColumns.join(', ')}) VALUES(${entryColumns.map(() => '?').join(', ')})`,
      params: entryColumns.map((column) => entry[column]),
    };
  }

  private async mutation<T>(
    scope: string,
    context: MutationContext,
    hash: string,
    response: T,
    statements: SqlStatement[],
  ): Promise<T> {
    const guard = await this.configurationGuard();
    try {
      await this.store.batch([
        guard,
        this.idem(scope, context, hash, response, this.now()),
        ...statements,
      ]);
      return response;
    } catch (error) {
      // A racing identical key commits exactly once. A duplicate INSERT aborts
      // the complete batch before any secondary effects, then reads the winner.
      const replay = await this.replay<T>(scope, context, hash);
      if (replay !== undefined) return replay;
      throw mapStorageError(error);
    }
  }

  private async create(
    input: CreateBookingInput,
    context: MutationContext,
    kind: 'booking' | 'walk-in',
  ): Promise<BookingReceipt> {
    assertContext(context);
    if (kind === 'walk-in') assertAdmin(context.actor);
    else if (context.actor.kind === 'customer')
      throw new AgendaError('FORBIDDEN', 403, 'Acceso no autorizado.');
    await this.configured();
    const normal = this.normalBooking(input);
    const scope = `${kind}:create:${actorScope(context.actor)}`;
    const hash = await this.requestHash(normal, context);
    const replay = await this.replay<BookingReceipt>(scope, context, hash);
    if (replay !== undefined) return replay;
    this.assertConfigVersion(context);
    this.assertBookableDate(normal.date);
    if (kind === 'booking' && normal.startMinute % this.config.slotStepMinutes !== 0)
      throw new AgendaError(
        'INVALID_INPUT',
        400,
        'El horario debe coincidir con un turno disponible.',
      );
    const service = this.service(normal.serviceId);
    const professionals = this.professionals(service, normal.professionalId);
    const occupied = await this.occupied(normal.date);
    const candidates = professionals
      .map((professional) =>
        this.allocation(service, professional, normal.date, normal.startMinute, kind === 'walk-in'),
      )
      .filter(
        (allocation): allocation is Allocation =>
          allocation !== null && !this.conflict(allocation, occupied),
      );
    if (candidates.length === 0) {
      const winner = await this.replay<BookingReceipt>(scope, context, hash);
      if (winner !== undefined) return winner;
      throw new AgendaError(
        'SLOT_UNAVAILABLE',
        409,
        'Ese horario ya no está disponible. Elegí otro.',
      );
    }
    const now = this.now();
    const id = this.id();
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      const entry: Entry = {
        id,
        kind,
        professional_id: candidate.professional.id,
        professional_name: candidate.professional.name,
        service_id: service.id,
        service_name: service.name,
        start_utc: candidate.start,
        end_utc: candidate.end,
        allocated_start_utc: candidate.allocatedStart,
        allocated_end_utc: candidate.allocatedEnd,
        duration_minutes: service.durationMinutes,
        buffer_before_minutes: service.bufferBeforeMinutes,
        buffer_after_minutes: service.bufferAfterMinutes,
        price_minor_units: service.priceMinorUnits,
        currency: this.config.currency,
        status: 'confirmed',
        version: 1,
        customer_display_name: normal.customer?.displayName ?? null,
        customer_email: normal.customer?.email ?? null,
        management_hash: normal.managementHash ?? null,
        block_label: null,
        created_at: now,
        updated_at: now,
      };
      const response = this.receipt(entry);
      try {
        return await this.mutation(scope, context, hash, response, [
          this.insert(entry),
          this.audit(entry, 'created', context, now),
          this.outbox(entry, 'booking.confirmed', now),
        ]);
      } catch (error) {
        // Any-professional requests can attempt another eligible professional.
        // Every attempt still relies on the DB trigger, never advisory reads.
        if (
          !(error instanceof AgendaError) ||
          error.code !== 'SLOT_UNAVAILABLE' ||
          candidateIndex === candidates.length - 1
        )
          throw error;
      }
    }
    throw new AgendaError(
      'SLOT_UNAVAILABLE',
      409,
      'Ese horario ya no está disponible. Elegí otro.',
    );
  }

  createBooking(input: CreateBookingInput, context: MutationContext): Promise<BookingReceipt> {
    return this.create(input, context, 'booking');
  }
  createWalkIn(input: CreateBookingInput, context: MutationContext): Promise<BookingReceipt> {
    return this.create(input, context, 'walk-in');
  }

  async authorizeCustomer(id: string, managementHash: string): Promise<boolean> {
    if (
      typeof id !== 'string' ||
      typeof managementHash !== 'string' ||
      !digestPattern.test(managementHash)
    )
      return false;
    try {
      assertId(id);
    } catch {
      return false;
    }
    await this.configured();
    const rows = await this.read<{ id: string }>(
      "SELECT id FROM agenda_entries WHERE id = ? AND kind IN ('booking', 'walk-in') AND management_hash = ?",
      [id, managementHash],
    );
    return rows.length === 1;
  }

  async getBooking(id: string, actor: Actor): Promise<BookingReceipt> {
    assertId(id);
    assertManagement(id, actor);
    await this.configured();
    return this.receipt(await this.entry(id));
  }

  private listQuery(query: ListQuery): void {
    assertObject(query, ['date', 'professionalId', 'includeCancelled']);
    assertDate(query.date);
    if (query.professionalId !== undefined) this.professional(query.professionalId);
    if (query.includeCancelled !== undefined && typeof query.includeCancelled !== 'boolean')
      throw new AgendaError('INVALID_INPUT', 400, 'Filtro inválido.');
  }

  private async listEntries(query: ListQuery, blocks: boolean): Promise<Entry[]> {
    await this.configured();
    this.listQuery(query);
    return this.read<Entry>(
      `SELECT * FROM agenda_entries WHERE ${blocks ? "kind = 'block'" : "kind IN ('booking', 'walk-in')"} AND start_utc >= ? AND start_utc < ? AND (? IS NULL OR professional_id = ?) AND (? = 1 OR status = 'confirmed') ORDER BY start_utc, id`,
      [
        toUtcSeconds(query.date, 0),
        toUtcSeconds(query.date, 1440),
        query.professionalId ?? null,
        query.professionalId ?? null,
        query.includeCancelled ? 1 : 0,
      ],
    );
  }

  async listBookings(query: ListQuery): Promise<Booking[]> {
    return (await this.listEntries(query, false)).map((entry) => this.receipt(entry).booking);
  }
  async listBlocks(query: ListQuery): Promise<ScheduleBlock[]> {
    return (await this.listEntries(query, true)).map((entry) => this.block(entry));
  }

  private assertCurrent(entry: Entry, expectedVersion: number): void {
    if (entry.version !== expectedVersion || entry.status !== 'confirmed')
      throw new AgendaError(
        'VERSION_CONFLICT',
        409,
        'La reserva cambió. Actualizá la información antes de continuar.',
      );
  }

  private cancellationPolicy(entry: Entry, actor: Actor): void {
    if (
      actor.kind === 'customer' &&
      entry.start_utc < this.now() + this.config.cancellationLeadMinutes * 60
    ) {
      throw new AgendaError(
        'POLICY_RESTRICTION',
        409,
        'El horario requiere gestión directa de un administrador.',
      );
    }
  }

  async cancelBooking(
    id: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<BookingReceipt> {
    assertId(id);
    assertVersion(expectedVersion);
    assertContext(context);
    assertManagement(id, context.actor);
    await this.configured();
    const scope = `booking:cancel:${id}:${actorScope(context.actor)}`;
    const hash = await this.requestHash({ id, expectedVersion }, context);
    const replay = await this.replay<BookingReceipt>(scope, context, hash);
    if (replay !== undefined) return replay;
    this.assertConfigVersion(context);
    const original = await this.entry(id);
    if (original.kind === 'block')
      throw new AgendaError('NOT_FOUND', 404, 'Reserva no encontrada.');
    const winner = await this.replay<BookingReceipt>(scope, context, hash);
    if (winner !== undefined) return winner;
    this.assertCurrent(original, expectedVersion);
    this.cancellationPolicy(original, context.actor);
    const now = this.now();
    const updated: Entry = {
      ...original,
      status: 'cancelled',
      version: expectedVersion + 1,
      updated_at: now,
    };
    const response = this.receipt(updated);
    return this.mutation(scope, context, hash, response, [
      {
        sql: "UPDATE agenda_entries SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'confirmed' AND kind IN ('booking', 'walk-in')",
        params: [now, id, expectedVersion],
      },
      writeAssertion,
      this.audit(updated, 'cancelled', context, now),
      this.outbox(updated, 'booking.cancelled', now),
    ]);
  }

  async rescheduleBooking(
    id: string,
    input: RescheduleInput,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<BookingReceipt> {
    assertId(id);
    assertVersion(expectedVersion);
    assertContext(context);
    assertManagement(id, context.actor);
    await this.configured();
    assertObject(input, ['date', 'startMinute', 'professionalId']);
    assertDate(input.date);
    assertMinute(input.startMinute);
    assertId(input.professionalId);
    const scope = `booking:reschedule:${id}:${actorScope(context.actor)}`;
    const hash = await this.requestHash({ id, expectedVersion, input }, context);
    const replay = await this.replay<BookingReceipt>(scope, context, hash);
    if (replay !== undefined) return replay;
    this.assertConfigVersion(context);
    this.assertBookableDate(input.date);
    if (input.startMinute % this.config.slotStepMinutes !== 0)
      throw new AgendaError(
        'INVALID_INPUT',
        400,
        'El horario debe coincidir con un turno disponible.',
      );
    const original = await this.entry(id);
    if (original.kind === 'block')
      throw new AgendaError('NOT_FOUND', 404, 'Reserva no encontrada.');
    const winner = await this.replay<BookingReceipt>(scope, context, hash);
    if (winner !== undefined) return winner;
    this.assertCurrent(original, expectedVersion);
    this.cancellationPolicy(original, context.actor);
    const eligible = this.service(original.service_id!);
    const professional = this.professionals(eligible, input.professionalId)[0];
    // A confirmed service retains its agreed price/duration/buffers on a move.
    const service: ServiceConfig = {
      ...eligible,
      durationMinutes: original.duration_minutes!,
      bufferBeforeMinutes: original.buffer_before_minutes,
      bufferAfterMinutes: original.buffer_after_minutes,
    };
    const allocation = this.allocation(service, professional, input.date, input.startMinute);
    if (!allocation || this.conflict(allocation, await this.occupied(input.date, id)))
      throw new AgendaError(
        'SLOT_UNAVAILABLE',
        409,
        'Ese horario ya no está disponible. Elegí otro.',
      );
    const now = this.now();
    const updated: Entry = {
      ...original,
      professional_id: professional.id,
      professional_name: professional.name,
      start_utc: allocation.start,
      end_utc: allocation.end,
      allocated_start_utc: allocation.allocatedStart,
      allocated_end_utc: allocation.allocatedEnd,
      version: expectedVersion + 1,
      updated_at: now,
    };
    const response = this.receipt(updated);
    return this.mutation(scope, context, hash, response, [
      {
        sql: "UPDATE agenda_entries SET professional_id = ?, professional_name = ?, start_utc = ?, end_utc = ?, allocated_start_utc = ?, allocated_end_utc = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'confirmed' AND kind IN ('booking', 'walk-in')",
        params: [
          professional.id,
          professional.name,
          allocation.start,
          allocation.end,
          allocation.allocatedStart,
          allocation.allocatedEnd,
          now,
          id,
          expectedVersion,
        ],
      },
      writeAssertion,
      this.audit(updated, 'rescheduled', context, now),
      this.outbox(updated, 'booking.rescheduled', now),
    ]);
  }

  async createBlock(input: CreateBlockInput, context: MutationContext): Promise<ScheduleBlock> {
    assertContext(context);
    assertAdmin(context.actor);
    await this.configured();
    assertObject(input, ['professionalId', 'date', 'startMinute', 'endMinute', 'label']);
    assertDate(input.date);
    assertMinute(input.startMinute);
    assertMinute(input.endMinute, true);
    if (input.endMinute <= input.startMinute)
      throw new AgendaError('INVALID_INPUT', 400, 'Intervalo inválido.');
    const label = cleanText(input.label, 120)!;
    assertId(input.professionalId);
    const normal = { ...input, label };
    const scope = `block:create:${actorScope(context.actor)}`;
    const hash = await this.requestHash(normal, context);
    const replay = await this.replay<ScheduleBlock>(scope, context, hash);
    if (replay !== undefined) return replay;
    this.assertConfigVersion(context);
    const professional = this.professional(input.professionalId);
    this.assertBookableDate(input.date);
    const now = this.now();
    const start = toUtcSeconds(input.date, input.startMinute);
    const end = toUtcSeconds(input.date, input.endMinute);
    const entry: Entry = {
      id: this.id(),
      kind: 'block',
      professional_id: professional.id,
      professional_name: professional.name,
      service_id: null,
      service_name: null,
      start_utc: start,
      end_utc: end,
      allocated_start_utc: start,
      allocated_end_utc: end,
      duration_minutes: null,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      price_minor_units: null,
      currency: this.config.currency,
      status: 'confirmed',
      version: 1,
      customer_display_name: null,
      customer_email: null,
      management_hash: null,
      block_label: label,
      created_at: now,
      updated_at: now,
    };
    const response = this.block(entry);
    return this.mutation(scope, context, hash, response, [
      this.insert(entry),
      this.audit(entry, 'blocked', context, now),
    ]);
  }

  async cancelBlock(
    id: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<ScheduleBlock> {
    assertId(id);
    assertVersion(expectedVersion);
    assertContext(context);
    assertAdmin(context.actor);
    await this.configured();
    const scope = `block:cancel:${id}:${actorScope(context.actor)}`;
    const hash = await this.requestHash({ id, expectedVersion }, context);
    const replay = await this.replay<ScheduleBlock>(scope, context, hash);
    if (replay !== undefined) return replay;
    this.assertConfigVersion(context);
    const original = await this.entry(id);
    if (original.kind !== 'block')
      throw new AgendaError('NOT_FOUND', 404, 'Bloqueo no encontrado.');
    const winner = await this.replay<ScheduleBlock>(scope, context, hash);
    if (winner !== undefined) return winner;
    this.assertCurrent(original, expectedVersion);
    const now = this.now();
    const updated: Entry = {
      ...original,
      status: 'cancelled',
      version: expectedVersion + 1,
      updated_at: now,
    };
    const response = this.block(updated);
    return this.mutation(scope, context, hash, response, [
      {
        sql: "UPDATE agenda_entries SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'confirmed' AND kind = 'block'",
        params: [now, id, expectedVersion],
      },
      writeAssertion,
      this.audit(updated, 'unblocked', context, now),
    ]);
  }

  async exportData(): Promise<AgendaBackup> {
    await this.configured();
    try {
      // All private tables belong to one transaction/snapshot in both hosts.
      const results = await this.store.batch([
        await this.configurationGuard(),
        ...BACKUP_TABLES.map((table) => ({
          sql: `SELECT * FROM ${table} ORDER BY ${backupOrder[table]}`,
        })),
      ]);
      const tables = BACKUP_TABLES.map((name, index) => {
        const rows = results[index + 1]?.rows;
        if (!rows)
          throw new AgendaError(
            'STORAGE_UNAVAILABLE',
            503,
            'El adaptador no permite exportación consistente.',
          );
        return { name, rows };
      });
      const configRow = tables[0].rows[0];
      if (typeof configRow?.config_json !== 'string')
        throw new AgendaError(
          'STORAGE_UNAVAILABLE',
          503,
          'Configuración de respaldo no disponible.',
        );
      const config = JSON.parse(configRow.config_json) as AgendaConfig;
      return {
        format: 'portable-agenda',
        version: 1,
        exportedAt: isoInstant(this.now()),
        config,
        tables,
      };
    } catch (error) {
      throw mapStorageError(error);
    }
  }
}

export function createAgendaService(
  store: SqlStore,
  config: AgendaConfig,
  dependencies?: Partial<AgendaDependencies>,
): AgendaService {
  return new PersistentAgenda(store, config, dependencies);
}
