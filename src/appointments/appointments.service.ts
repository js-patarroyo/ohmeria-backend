import {
  AppointmentStatus,
  PaymentStatus,
  Role,
  ServiceCategory,
} from '@prisma/client';
import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AppointmentCategoryDto,
  AppointmentOverrideSourceDto,
  AppointmentPaymentStatusDto,
  AppointmentStatusDto,
  CreateAppointmentDto,
} from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}
  private readonly bogotaTimeZone = 'America/Bogota';
  private readonly nonBlockingStatuses = new Set<AppointmentStatus>([
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.FOLLOW_UP_COMPLETED,
    AppointmentStatus.RESCHEDULED,
  ]);

  private async createRandomPasswordHash() {
    return hash(randomBytes(24).toString('hex'), 10);
  }

  getStatuses() {
    return [
      'REQUEST_RECEIVED',
      'PENDING_CONFIRMATION',
      'REQUIRES_PRE_ASSESSMENT',
      'CONFIRMED',
      'IN_PREPARATION',
      'IN_PROGRESS',
      'COMPLETED',
      'RESCHEDULED',
      'CANCELLED',
      'NO_SHOW',
      'FOLLOW_UP_PENDING',
      'FOLLOW_UP_COMPLETED',
    ];
  }

  async listAppointments(user: AuthenticatedUser) {
    const appointments = await this.prisma.appointment.findMany({
      where:
        user.role === Role.CLIENT
          ? {
              clientProfile: {
                userId: user.sub,
              },
            }
          : undefined,
      include: {
        service: true,
        assignedStaff: {
          include: {
            user: true,
          },
        },
        clientProfile: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return appointments.map((appointment) => this.mapAppointment(appointment));
  }

  async getAppointmentById(user: AuthenticatedUser, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        ...(user.role === Role.CLIENT
          ? {
              clientProfile: {
                userId: user.sub,
              },
            }
          : {}),
      },
      include: {
        service: true,
        assignedStaff: {
          include: {
            user: true,
          },
        },
        clientProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('La cita solicitada no existe.');
    }

    return this.mapAppointment(appointment);
  }

  async createAppointment(
    user: AuthenticatedUser,
    createAppointmentDto: CreateAppointmentDto,
  ) {
    const scheduledAt = this.buildScheduledAt(
      createAppointmentDto.date,
      createAppointmentDto.time,
    );
    const clientProfileId = await this.resolveClientProfileId(createAppointmentDto);
    const serviceId = await this.resolveServiceId(createAppointmentDto);
    const assignedStaffId = await this.resolveAssignedStaffId(createAppointmentDto);
    const cabin = this.normalizeCabin(createAppointmentDto.cabin);

    const conflicts = await this.findSchedulingConflicts({
      scheduledAt,
      durationMinutes: createAppointmentDto.durationMinutes,
      clientProfileId,
      assignedStaffId,
      cabin,
    });

    this.assertOverrideAllowed({
      user,
      allowConflictOverride: createAppointmentDto.allowConflictOverride,
      overrideReason: createAppointmentDto.overrideReason,
      overrideSource: createAppointmentDto.overrideSource,
      conflicts,
    });

    const appointment = await this.prisma.appointment.create({
      data: {
        clientProfileId,
        serviceId,
        assignedStaffId,
        createdById: user.sub,
        scheduledAt,
        durationMinutes: createAppointmentDto.durationMinutes,
        cabin,
        status: this.mapStatusToPrisma(createAppointmentDto.status),
        paymentStatus: this.mapPaymentStatusToPrisma(
          createAppointmentDto.paymentStatus,
        ),
        notes: createAppointmentDto.notes,
        internalNotes: this.buildInternalNotes({
          paymentStatus: createAppointmentDto.paymentStatus,
          depositAmount: createAppointmentDto.depositAmount,
          internalNotes: createAppointmentDto.internalNotes,
        }),
        statusHistory: {
          create: {
            toStatus: this.mapStatusToPrisma(createAppointmentDto.status),
            note: 'Cita creada desde el panel interno.',
          },
        },
      },
      include: {
        service: true,
        assignedStaff: {
          include: {
            user: true,
          },
        },
        clientProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    await this.logConflictOverrideIfNeeded({
      appointmentId: appointment.id,
      actorUserId: user.sub,
      reason: createAppointmentDto.overrideReason,
      source: createAppointmentDto.overrideSource,
      conflicts,
      allowConflictOverride: createAppointmentDto.allowConflictOverride,
    });

    const notificationEmail = this.resolveNotificationEmail(
      createAppointmentDto.clientEmail,
      appointment.clientProfile.user.email,
    );

    await this.mailService.sendAppointmentCreated({
      email: notificationEmail,
      fullName: `${appointment.clientProfile.user.firstName} ${appointment.clientProfile.user.lastName}`.trim(),
      serviceName: appointment.service.name,
      date: this.formatBogotaDate(appointment.scheduledAt),
      time: this.formatBogotaTime(appointment.scheduledAt),
      professionalName: appointment.assignedStaff
        ? `${appointment.assignedStaff.user.firstName} ${appointment.assignedStaff.user.lastName}`.trim()
        : null,
      notes: appointment.notes,
    });

    return this.mapAppointment(appointment);
  }

  async updateAppointment(
    user: AuthenticatedUser,
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
  ) {
    const existing = await this.prisma.appointment.findFirst({
      where: {
        id,
        ...(user.role === Role.CLIENT
          ? {
              clientProfile: {
                userId: user.sub,
              },
            }
          : {}),
      },
      include: {
        service: true,
        assignedStaff: {
          include: {
            user: true,
          },
        },
        clientProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('La cita solicitada no existe.');
    }

    const nextDate = updateAppointmentDto.date
      ? updateAppointmentDto.date
      : this.formatBogotaDate(existing.scheduledAt);
    const nextTime = updateAppointmentDto.time
      ? updateAppointmentDto.time
      : this.formatBogotaTime(existing.scheduledAt);
    const nextDuration =
      updateAppointmentDto.durationMinutes ?? existing.durationMinutes;
    const nextStatus = updateAppointmentDto.status
      ? this.mapStatusToPrisma(updateAppointmentDto.status)
      : existing.status;
    const nextPaymentStatus = updateAppointmentDto.paymentStatus
      ? this.mapPaymentStatusToPrisma(updateAppointmentDto.paymentStatus)
      : existing.paymentStatus;
    const nextInternalNotes = this.buildInternalNotes({
      paymentStatus:
        updateAppointmentDto.paymentStatus ??
        this.mapPaymentStatusFromPrisma(existing.paymentStatus),
      depositAmount:
        updateAppointmentDto.depositAmount ??
        this.extractDepositAmount(existing.internalNotes) ??
        undefined,
      internalNotes:
        updateAppointmentDto.internalNotes ?? this.stripDepositNote(existing.internalNotes),
    });

    const serviceId =
      updateAppointmentDto.serviceName || updateAppointmentDto.category || updateAppointmentDto.durationMinutes
        ? await this.resolveServiceReference({
            serviceName: updateAppointmentDto.serviceName ?? existing.service.name,
            category:
              updateAppointmentDto.category ??
              this.mapCategoryFromPrisma(existing.service.category),
            durationMinutes: nextDuration,
          })
        : existing.serviceId;

    const assignedStaffId = updateAppointmentDto.professionalName
      ? await this.resolveAssignedStaffReference(updateAppointmentDto.professionalName)
      : existing.assignedStaffId;
    const nextScheduledAt = this.buildScheduledAt(nextDate, nextTime);
    const nextCabin =
      updateAppointmentDto.cabin !== undefined
        ? this.normalizeCabin(updateAppointmentDto.cabin)
        : existing.cabin;

    const conflicts = await this.findSchedulingConflicts({
      scheduledAt: nextScheduledAt,
      durationMinutes: nextDuration,
      clientProfileId: existing.clientProfileId,
      assignedStaffId,
      cabin: nextCabin ?? null,
      excludeAppointmentId: existing.id,
    });

    this.assertOverrideAllowed({
      user,
      allowConflictOverride: updateAppointmentDto.allowConflictOverride,
      overrideReason: updateAppointmentDto.overrideReason,
      overrideSource: updateAppointmentDto.overrideSource,
      conflicts,
    });

    await this.prisma.user.update({
      where: { id: existing.clientProfile.user.id },
      data: {
        firstName: updateAppointmentDto.clientName
          ? this.splitName(updateAppointmentDto.clientName).firstName
          : undefined,
        lastName: updateAppointmentDto.clientName
          ? this.splitName(updateAppointmentDto.clientName).lastName
          : undefined,
        phone: updateAppointmentDto.clientPhone?.trim(),
        email: updateAppointmentDto.clientEmail?.trim().toLowerCase(),
      },
    });

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        serviceId,
        assignedStaffId,
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDuration,
        cabin: nextCabin,
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        notes: updateAppointmentDto.notes ?? existing.notes,
        internalNotes: nextInternalNotes,
        statusHistory:
          existing.status !== nextStatus
            ? {
                create: {
                  fromStatus: existing.status,
                  toStatus: nextStatus,
                  note: 'Estado actualizado desde edición de cita.',
                },
              }
            : undefined,
      },
      include: {
        service: true,
        assignedStaff: {
          include: {
            user: true,
          },
        },
        clientProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    await this.logConflictOverrideIfNeeded({
      appointmentId: updated.id,
      actorUserId: user.sub,
      reason: updateAppointmentDto.overrideReason,
      source: updateAppointmentDto.overrideSource,
      conflicts,
      allowConflictOverride: updateAppointmentDto.allowConflictOverride,
    });

    const notificationEmail = this.resolveNotificationEmail(
      updateAppointmentDto.clientEmail,
      updated.clientProfile.user.email,
    );

    await this.mailService.sendAppointmentUpdated({
      email: notificationEmail,
      fullName: `${updated.clientProfile.user.firstName} ${updated.clientProfile.user.lastName}`.trim(),
      serviceName: updated.service.name,
      date: this.formatBogotaDate(updated.scheduledAt),
      time: this.formatBogotaTime(updated.scheduledAt),
      status: this.mapStatusFromPrisma(updated.status),
      professionalName: updated.assignedStaff
        ? `${updated.assignedStaff.user.firstName} ${updated.assignedStaff.user.lastName}`.trim()
        : null,
      notes: updated.notes,
    });

    return this.mapAppointment(updated);
  }

  async removeAppointment(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.appointment.findFirst({
      where: {
        id,
        ...(user.role === Role.CLIENT
          ? {
              clientProfile: {
                userId: user.sub,
              },
            }
          : {}),
      },
    });

    if (!existing) {
      throw new NotFoundException('La cita solicitada no existe.');
    }

    await this.prisma.appointment.delete({
      where: { id },
    });

    return {
      success: true,
      id,
    };
  }

  private buildScheduledAt(date: string, time: string) {
    const scheduledAt = new Date(`${date}T${time}:00-05:00`);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('La fecha u hora de la cita no son válidas.');
    }

    return scheduledAt;
  }

  private normalizeCabin(cabin?: string | null) {
    const normalized = cabin?.trim();
    return normalized ? normalized : null;
  }

  private getAppointmentEndAt(scheduledAt: Date, durationMinutes: number) {
    const endAt = new Date(scheduledAt);
    endAt.setMinutes(endAt.getMinutes() + durationMinutes);
    return endAt;
  }

  private overlaps(
    leftStart: Date,
    leftDurationMinutes: number,
    rightStart: Date,
    rightDurationMinutes: number,
  ) {
    const leftEnd = this.getAppointmentEndAt(leftStart, leftDurationMinutes);
    const rightEnd = this.getAppointmentEndAt(rightStart, rightDurationMinutes);

    return leftStart < rightEnd && rightStart < leftEnd;
  }

  private async findSchedulingConflicts(input: {
    scheduledAt: Date;
    durationMinutes: number;
    clientProfileId: string;
    assignedStaffId?: string | null;
    cabin?: string | null;
    excludeAppointmentId?: string;
  }) {
    const startOfDay = new Date(input.scheduledAt);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(input.scheduledAt);
    endOfDay.setHours(23, 59, 59, 999);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        id: input.excludeAppointmentId
          ? { not: input.excludeAppointmentId }
          : undefined,
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        id: true,
        clientProfileId: true,
        assignedStaffId: true,
        cabin: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
      },
    });

    return candidates
      .filter((appointment) => !this.nonBlockingStatuses.has(appointment.status))
      .filter((appointment) =>
        this.overlaps(
          input.scheduledAt,
          input.durationMinutes,
          appointment.scheduledAt,
          appointment.durationMinutes,
        ),
      )
      .map((appointment) => {
        const conflictTypes: string[] = [];

        if (appointment.clientProfileId === input.clientProfileId) {
          conflictTypes.push('client');
        }

        if (
          input.assignedStaffId &&
          appointment.assignedStaffId &&
          appointment.assignedStaffId === input.assignedStaffId
        ) {
          conflictTypes.push('staff');
        }

        if (
          input.cabin &&
          appointment.cabin &&
          appointment.cabin.toLowerCase() === input.cabin.toLowerCase()
        ) {
          conflictTypes.push('cabin');
        }

        return {
          id: appointment.id,
          conflictTypes,
        };
      })
      .filter((appointment) => appointment.conflictTypes.length > 0);
  }

  private assertOverrideAllowed(input: {
    user: AuthenticatedUser;
    allowConflictOverride?: boolean;
    overrideReason?: string;
    overrideSource?: AppointmentOverrideSourceDto;
    conflicts: Array<{ id: string; conflictTypes: string[] }>;
  }) {
    if (input.conflicts.length === 0) {
      return;
    }

    const labels = Array.from(
      new Set(
        input.conflicts.flatMap((conflict) => conflict.conflictTypes).map((type) => {
          if (type === 'client') return 'cliente';
          if (type === 'staff') return 'profesional';
          return 'cabina';
        }),
      ),
    );

    if (!input.allowConflictOverride) {
      throw new BadRequestException(
        `Ya existe una ocupación en ese horario para ${labels.join(', ')}. Solo administración desde caja puede forzar este cruce y quedará auditado.`,
      );
    }

    if (input.user.role !== Role.ADMIN) {
      throw new BadRequestException(
        'Solo un administrador puede forzar cruces de agenda.',
      );
    }

    if (input.overrideSource !== AppointmentOverrideSourceDto.ADMIN_CAJA) {
      throw new BadRequestException(
        'Los cruces intencionales solo se permiten desde caja administrativa.',
      );
    }

    if (!input.overrideReason?.trim()) {
      throw new BadRequestException(
        'Debes registrar el motivo del cruce intencional para dejar trazabilidad.',
      );
    }
  }

  private async logConflictOverrideIfNeeded(input: {
    appointmentId: string;
    actorUserId: string;
    reason?: string;
    source?: AppointmentOverrideSourceDto;
    conflicts: Array<{ id: string; conflictTypes: string[] }>;
    allowConflictOverride?: boolean;
  }) {
    if (!input.allowConflictOverride || input.conflicts.length === 0) {
      return;
    }

    await this.prisma.appointmentConflictOverride.create({
      data: {
        appointmentId: input.appointmentId,
        actorUserId: input.actorUserId,
        source: input.source ?? AppointmentOverrideSourceDto.ADMIN_CAJA,
        reason: input.reason?.trim() ?? 'Cruce intencional autorizado.',
        conflictTypes: Array.from(
          new Set(input.conflicts.flatMap((conflict) => conflict.conflictTypes)),
        ),
        conflictingAppointmentIds: input.conflicts.map((conflict) => conflict.id),
      },
    });
  }

  private resolveNotificationEmail(
    requestedEmail?: string | null,
    persistedEmail?: string | null,
  ) {
    const normalizedRequested = requestedEmail?.trim().toLowerCase();
    const normalizedPersisted = persistedEmail?.trim().toLowerCase();

    if (
      normalizedRequested &&
      !normalizedRequested.endsWith('@clientes.ohmeria.local') &&
      !normalizedRequested.endsWith('@staff.ohmeria.local')
    ) {
      return normalizedRequested;
    }

    return normalizedPersisted ?? undefined;
  }

  private async resolveClientProfileId(createAppointmentDto: CreateAppointmentDto) {
    const normalizedEmail = createAppointmentDto.clientEmail?.trim().toLowerCase();
    const normalizedPhone = createAppointmentDto.clientPhone.trim();
    const splitClientName = this.splitName(createAppointmentDto.clientName);

    const existingUser = normalizedEmail
      ? await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { clientProfile: true },
        })
      : await this.prisma.user.findFirst({
          where: {
            role: Role.CLIENT,
            phone: normalizedPhone,
          },
          include: { clientProfile: true },
        });

    if (existingUser?.clientProfile) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: splitClientName.firstName,
          lastName: splitClientName.lastName,
          phone: normalizedPhone,
          email: normalizedEmail ?? existingUser.email,
        },
      });
      return existingUser.clientProfile.id;
    }

    const fallbackEmail =
      normalizedEmail ??
      `cliente-${normalizedPhone}@clientes.ohmeria.local`;

    const createdUser = await this.prisma.user.create({
      data: {
        email: fallbackEmail,
        passwordHash: await this.createRandomPasswordHash(),
        firstName: splitClientName.firstName,
        lastName: splitClientName.lastName,
        phone: normalizedPhone,
        role: Role.CLIENT,
        clientProfile: {
          create: {},
        },
      },
      include: {
        clientProfile: true,
      },
    });

    return createdUser.clientProfile!.id;
  }

  private async resolveServiceId(createAppointmentDto: CreateAppointmentDto) {
    return this.resolveServiceReference({
      serviceName: createAppointmentDto.serviceName,
      category: createAppointmentDto.category,
      durationMinutes: createAppointmentDto.durationMinutes,
    });
  }

  private async resolveAssignedStaffId(createAppointmentDto: CreateAppointmentDto) {
    return this.resolveAssignedStaffReference(
      createAppointmentDto.professionalName,
    );
  }

  private async resolveServiceReference(input: {
    serviceName: string;
    category: AppointmentCategoryDto;
    durationMinutes: number;
  }) {
    const slug = this.slugify(input.serviceName);

    const service = await this.prisma.service.upsert({
      where: { slug },
      update: {
        category: this.mapCategoryToPrisma(input.category),
        durationMinutes: input.durationMinutes,
        isActive: true,
      },
      create: {
        name: input.serviceName,
        slug,
        category: this.mapCategoryToPrisma(input.category),
        durationMinutes: input.durationMinutes,
        price: '0',
        isActive: true,
      },
    });

    return service.id;
  }

  private async resolveAssignedStaffReference(professionalName: string) {
    const { firstName, lastName } = this.splitName(professionalName);
    const email = `${this.slugify(professionalName)}@staff.ohmeria.local`;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { staffProfile: true },
    });

    if (existingUser?.staffProfile) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName,
          lastName,
        },
      });
      return existingUser.staffProfile.id;
    }

    const createdUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.createRandomPasswordHash(),
        firstName,
        lastName,
        role: this.inferStaffRole(professionalName),
        staffProfile: {
          create: {
            title: professionalName,
          },
        },
      },
      include: { staffProfile: true },
    });

    return createdUser.staffProfile!.id;
  }

  private mapStatusToPrisma(status: AppointmentStatusDto): AppointmentStatus {
    const mapping: Record<AppointmentStatusDto, AppointmentStatus> = {
      [AppointmentStatusDto.SOLICITUD]: AppointmentStatus.REQUEST_RECEIVED,
      [AppointmentStatusDto.PENDIENTE]:
        AppointmentStatus.PENDING_CONFIRMATION,
      [AppointmentStatusDto.CONFIRMADA]: AppointmentStatus.CONFIRMED,
      [AppointmentStatusDto.PREPARACION]: AppointmentStatus.IN_PREPARATION,
      [AppointmentStatusDto.EN_CURSO]: AppointmentStatus.IN_PROGRESS,
      [AppointmentStatusDto.FINALIZADA]: AppointmentStatus.COMPLETED,
      [AppointmentStatusDto.REPROGRAMADA]: AppointmentStatus.RESCHEDULED,
      [AppointmentStatusDto.CANCELADA]: AppointmentStatus.CANCELLED,
      [AppointmentStatusDto.NO_ASISTIO]: AppointmentStatus.NO_SHOW,
      [AppointmentStatusDto.REQUIERE_VALORACION]:
        AppointmentStatus.REQUIRES_PRE_ASSESSMENT,
      [AppointmentStatusDto.SEGUIMIENTO]:
        AppointmentStatus.FOLLOW_UP_PENDING,
    };

    return mapping[status];
  }

  private mapStatusFromPrisma(status: AppointmentStatus): AppointmentStatusDto {
    const mapping: Record<AppointmentStatus, AppointmentStatusDto> = {
      [AppointmentStatus.REQUEST_RECEIVED]: AppointmentStatusDto.SOLICITUD,
      [AppointmentStatus.PENDING_CONFIRMATION]: AppointmentStatusDto.PENDIENTE,
      [AppointmentStatus.REQUIRES_PRE_ASSESSMENT]:
        AppointmentStatusDto.REQUIERE_VALORACION,
      [AppointmentStatus.CONFIRMED]: AppointmentStatusDto.CONFIRMADA,
      [AppointmentStatus.IN_PREPARATION]: AppointmentStatusDto.PREPARACION,
      [AppointmentStatus.IN_PROGRESS]: AppointmentStatusDto.EN_CURSO,
      [AppointmentStatus.COMPLETED]: AppointmentStatusDto.FINALIZADA,
      [AppointmentStatus.RESCHEDULED]: AppointmentStatusDto.REPROGRAMADA,
      [AppointmentStatus.CANCELLED]: AppointmentStatusDto.CANCELADA,
      [AppointmentStatus.NO_SHOW]: AppointmentStatusDto.NO_ASISTIO,
      [AppointmentStatus.FOLLOW_UP_PENDING]: AppointmentStatusDto.SEGUIMIENTO,
      [AppointmentStatus.FOLLOW_UP_COMPLETED]:
        AppointmentStatusDto.FINALIZADA,
    };

    return mapping[status];
  }

  private mapPaymentStatusToPrisma(
    paymentStatus: AppointmentPaymentStatusDto,
  ): PaymentStatus {
    const mapping: Record<AppointmentPaymentStatusDto, PaymentStatus> = {
      [AppointmentPaymentStatusDto.PENDING]: PaymentStatus.PENDING,
      [AppointmentPaymentStatusDto.PARTIAL]: PaymentStatus.PARTIAL,
      [AppointmentPaymentStatusDto.PAID]: PaymentStatus.PAID,
    };

    return mapping[paymentStatus];
  }

  private mapPaymentStatusFromPrisma(
    paymentStatus: PaymentStatus,
  ): AppointmentPaymentStatusDto {
    const mapping: Record<PaymentStatus, AppointmentPaymentStatusDto> = {
      [PaymentStatus.PENDING]: AppointmentPaymentStatusDto.PENDING,
      [PaymentStatus.PARTIAL]: AppointmentPaymentStatusDto.PARTIAL,
      [PaymentStatus.PAID]: AppointmentPaymentStatusDto.PAID,
      [PaymentStatus.REFUNDED]: AppointmentPaymentStatusDto.PAID,
    };

    return mapping[paymentStatus];
  }

  private mapCategoryToPrisma(category: AppointmentCategoryDto): ServiceCategory {
    return category === AppointmentCategoryDto.MEDICAL
      ? ServiceCategory.MEDICAL
      : ServiceCategory.WELLNESS_BEAUTY;
  }

  private mapCategoryFromPrisma(
    category: ServiceCategory,
  ): AppointmentCategoryDto {
    return category === ServiceCategory.MEDICAL
      ? AppointmentCategoryDto.MEDICAL
      : AppointmentCategoryDto.WELLNESS;
  }

  private inferStaffRole(professionalName: string) {
    return /^dra?\.?/i.test(professionalName.trim())
      ? Role.DOCTOR
      : Role.SPECIALIST;
  }

  private splitName(fullName: string) {
    const cleaned = fullName.trim().replace(/\s+/g, ' ');
    const [firstName, ...rest] = cleaned.split(' ');

    return {
      firstName: firstName || 'Persona',
      lastName: rest.join(' '),
    };
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private mapAppointment(
    appointment: {
      id: string;
      scheduledAt: Date;
      durationMinutes: number;
      cabin: string | null;
      status: AppointmentStatus;
      paymentStatus: PaymentStatus;
      notes: string | null;
      internalNotes: string | null;
      service: { name: string; category: ServiceCategory };
      assignedStaff: {
        user: { firstName: string; lastName: string };
      } | null;
      clientProfile: {
        user: {
          firstName: string;
          lastName: string;
          phone: string | null;
          email: string;
        };
      };
    }
  ) {
    const scheduledAt = new Date(appointment.scheduledAt);
    const endAt = new Date(scheduledAt);
    endAt.setMinutes(endAt.getMinutes() + appointment.durationMinutes);

    return {
      id: appointment.id,
      date: this.formatBogotaDate(scheduledAt),
      time: this.formatBogotaTime(scheduledAt),
      endTime: this.formatBogotaTime(endAt),
      duration: `${appointment.durationMinutes} min`,
      client: `${appointment.clientProfile.user.firstName} ${appointment.clientProfile.user.lastName}`.trim(),
      phone: appointment.clientProfile.user.phone ?? '',
      email: appointment.clientProfile.user.email.includes('@clientes.ohmeria.local')
        ? ''
        : appointment.clientProfile.user.email,
      service: appointment.service.name,
      category: this.mapCategoryFromPrisma(appointment.service.category),
      cabin: appointment.cabin ?? '',
      professional: appointment.assignedStaff
        ? `${appointment.assignedStaff.user.firstName} ${appointment.assignedStaff.user.lastName}`.trim()
        : 'Sin asignar',
      status: this.mapStatusFromPrisma(appointment.status),
      paid: appointment.paymentStatus === PaymentStatus.PAID,
      paymentStatus: this.mapPaymentStatusFromPrisma(appointment.paymentStatus),
      deposit:
        appointment.paymentStatus === PaymentStatus.PARTIAL &&
        this.extractDepositAmount(appointment.internalNotes) &&
        this.extractDepositAmount(appointment.internalNotes)
          ? `COP ${Number(
              this.extractDepositAmount(appointment.internalNotes),
            ).toLocaleString('es-CO')}`
          : undefined,
      depositAmount: this.extractDepositAmount(appointment.internalNotes),
      notes: appointment.notes ?? '',
      internalNotes: this.stripDepositNote(appointment.internalNotes),
    };
  }

  private buildInternalNotes(input: {
    paymentStatus: AppointmentPaymentStatusDto;
    depositAmount?: string;
    internalNotes?: string | null;
  }) {
    const notes = [input.internalNotes?.trim()]
      .filter(Boolean)
      .join('\n');

    if (
      input.paymentStatus === AppointmentPaymentStatusDto.PARTIAL &&
      input.depositAmount
    ) {
      return [notes, `deposit:${input.depositAmount.trim()}`]
        .filter(Boolean)
        .join('\n');
    }

    return notes || null;
  }

  private extractDepositAmount(notes?: string | null) {
    if (!notes) {
      return null;
    }

    const match = notes.match(/deposit:(\d+(?:[.,]\d+)?)/i);
    return match?.[1]?.replace(',', '.') ?? null;
  }

  private stripDepositNote(notes?: string | null) {
    if (!notes) {
      return '';
    }

    return notes
      .split('\n')
      .filter((line) => !/^deposit:/i.test(line.trim()))
      .join('\n')
      .trim();
  }

  private formatBogotaDate(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.bogotaTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';

    return `${year}-${month}-${day}`;
  }

  private formatBogotaTime(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.bogotaTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

    return `${hour}:${minute}`;
  }
}
