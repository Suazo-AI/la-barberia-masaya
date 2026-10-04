export type SqlValue = string | number | null | Uint8Array;
export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}
export interface SqlResult {
  changes: number;
  lastInsertRowid?: number;
  /** SELECT/RETURNING rows, or [] for statements without a result set. Required in batch. */
  rows: Record<string, SqlValue>[];
}
export interface SqlStore {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<SqlResult>;
  /** Entire batch must commit or roll back. Never emulate this with independent runs. */
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}
export type AgendaMode = 'unconfigured' | 'fixture' | 'production';
export type WeeklyHours = Array<Array<[number, number]>>;
export interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceMinorUnits: number;
  professionalIds: string[];
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}
export interface ProfessionalConfig {
  id: string;
  name: string;
  weeklyHours: WeeklyHours;
  photoUrl?: string;
}
export interface AgendaConfig {
  mode: AgendaMode;
  businessId: string;
  businessName: string;
  timeZone: 'America/Managua';
  currency: 'NIO';
  verified: boolean;
  verifiedAt?: string;
  version: number;
  services: ServiceConfig[];
  professionals: ProfessionalConfig[];
  slotStepMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  cancellationLeadMinutes: number;
}
export type Actor =
  { kind: 'public' } | { kind: 'admin'; id: string } | { kind: 'customer'; reservationId: string };
export interface MutationContext {
  idempotencyKey: string;
  actor: Actor;
  /** Version reviewed by the client; a changed catalog requires a new review. */
  configVersion: number;
}
export interface AgendaDependencies {
  now: () => Date;
  newId: () => string;
}
export interface Catalog {
  mode: 'fixture' | 'production';
  configVersion: number;
  businessName: string;
  timeZone: 'America/Managua';
  currency: 'NIO';
  services: ServiceConfig[];
  professionals: ProfessionalConfig[];
  dateRange: { min: string; max: string };
  slotStepMinutes: number;
  cancellationLeadMinutes: number;
  notifications: 'disabled';
  customerManagement: 'token' | 'admin-only';
}
export interface AvailabilityQuery {
  serviceId: string;
  professionalId?: string;
  date: string;
}
export interface AvailableSlot {
  startMinute: number;
  endMinute: number;
  professionalIds: string[];
}
export interface Availability {
  date: string;
  timeZone: 'America/Managua';
  mode: 'fixture' | 'production';
  slots: AvailableSlot[];
  reason: 'available' | 'closed' | 'full' | 'past';
}
export interface CreateBookingInput {
  serviceId: string;
  professionalId?: string;
  date: string;
  startMinute: number;
  customer?: { displayName?: string; email?: string };
  /** Server-computed SHA-256 digest of the client-held random booking capability. Never the token. */
  managementHash?: string;
}
export interface Booking {
  id: string;
  kind: 'booking' | 'walk-in';
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  priceMinorUnits: number;
  currency: 'NIO';
  status: 'confirmed' | 'cancelled';
  version: number;
  customerDisplayName?: string;
}
export interface BookingReceipt {
  booking: Booking;
  mode: 'fixture' | 'production';
  notification: 'disabled';
  customerManagement: 'token' | 'admin-only';
}
export interface RescheduleInput {
  date: string;
  startMinute: number;
  professionalId: string;
}
export interface ListQuery {
  date: string;
  professionalId?: string;
  includeCancelled?: boolean;
}
export interface CreateBlockInput {
  professionalId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  label: string;
}
export interface ScheduleBlock extends CreateBlockInput {
  id: string;
  status: 'active' | 'cancelled';
  version: number;
}
export interface BackupTable {
  name: string;
  rows: Record<string, SqlValue>[];
}
export interface AgendaBackup {
  format: 'portable-agenda';
  version: 1;
  exportedAt: string;
  config: AgendaConfig;
  tables: BackupTable[];
}
export interface AgendaService {
  catalog(): Promise<Catalog>;
  availability(query: AvailabilityQuery): Promise<Availability>;
  createBooking(input: CreateBookingInput, context: MutationContext): Promise<BookingReceipt>;
  authorizeCustomer(id: string, managementHash: string): Promise<boolean>;
  getBooking(id: string, actor: Actor): Promise<BookingReceipt>;
  listBookings(query: ListQuery): Promise<Booking[]>;
  cancelBooking(
    id: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<BookingReceipt>;
  rescheduleBooking(
    id: string,
    input: RescheduleInput,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<BookingReceipt>;
  createWalkIn(input: CreateBookingInput, context: MutationContext): Promise<BookingReceipt>;
  createBlock(input: CreateBlockInput, context: MutationContext): Promise<ScheduleBlock>;
  listBlocks(query: ListQuery): Promise<ScheduleBlock[]>;
  cancelBlock(
    id: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<ScheduleBlock>;
  exportData(): Promise<AgendaBackup>;
}
export class AgendaError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'AgendaError';
    this.code = code;
    this.status = status;
  }
}
