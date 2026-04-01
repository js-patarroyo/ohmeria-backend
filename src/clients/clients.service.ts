import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClientStatusDto,
  ClientTypeDto,
  CreateClientDto,
} from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private async createRandomPasswordHash() {
    return hash(randomBytes(24).toString('hex'), 10);
  }

  async listClients() {
    const users = await this.prisma.user.findMany({
      where: {
        role: Role.CLIENT,
        clientProfile: {
          isNot: null,
        },
      },
      include: {
        clientProfile: {
          include: {
            appointments: {
              include: {
                service: true,
              },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return users.map((user) => this.mapClient(user));
  }

  async getClientById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.CLIENT,
      },
      include: {
        clientProfile: {
          include: {
            appointments: {
              include: {
                service: true,
              },
            },
          },
        },
      },
    });

    if (!user?.clientProfile) {
      throw new NotFoundException('El cliente solicitado no existe.');
    }

    return this.mapClient(user);
  }

  async createClient(createClientDto: CreateClientDto) {
    const normalizedEmail = createClientDto.email?.trim().toLowerCase();
    const normalizedPhone = createClientDto.phone.trim();

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

    if (existingUser) {
      if (existingUser.clientProfile) {
        throw new BadRequestException(
          'Ya existe un cliente registrado con ese correo o teléfono.',
        );
      }

      throw new BadRequestException(
        'Ya existe un usuario con ese correo, pero no pertenece al módulo de clientes.',
      );
    }

    const { firstName, lastName } = this.splitName(createClientDto.name);
    const email =
      normalizedEmail ?? `cliente-${normalizedPhone}@clientes.ohmeria.local`;

    const createdUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.createRandomPasswordHash(),
        firstName,
        lastName,
        phone: normalizedPhone,
        role: Role.CLIENT,
        status: UserStatus.ACTIVE,
        clientProfile: {
          create: {
            lifecycleStatus: createClientDto.status,
            document: this.optionalTrim(createClientDto.document),
            city: this.optionalTrim(createClientDto.city),
            address: this.optionalTrim(createClientDto.address),
            emergencyContact: this.optionalTrim(
              createClientDto.emergencyContact,
            ),
            birthDate: createClientDto.birthDate
              ? new Date(`${createClientDto.birthDate}T00:00:00`)
              : undefined,
            preferences: this.optionalTrim(createClientDto.preferences),
            notes: this.optionalTrim(createClientDto.observations),
            allergies: this.optionalTrim(createClientDto.allergies),
            contraindications: this.optionalTrim(createClientDto.allergies),
            conditions: this.optionalTrim(createClientDto.conditions),
            consultReason: this.optionalTrim(createClientDto.consultReason),
          },
        },
      },
      include: {
        clientProfile: true,
      },
    });

    return this.mapClient(createdUser, createClientDto.type, createClientDto.status);
  }

  async updateClient(id: string, updateClientDto: UpdateClientDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.CLIENT,
        clientProfile: {
          isNot: null,
        },
      },
      include: {
        clientProfile: true,
      },
    });

    if (!existing?.clientProfile) {
      throw new NotFoundException('El cliente solicitado no existe.');
    }

    const normalizedEmail = updateClientDto.email?.trim().toLowerCase();
    const normalizedPhone = updateClientDto.phone?.trim();

    if (normalizedEmail && normalizedEmail !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (emailTaken) {
        throw new BadRequestException(
          'Ya existe otro usuario con ese correo.',
        );
      }
    }

    if (normalizedPhone && normalizedPhone !== existing.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: {
          role: Role.CLIENT,
          phone: normalizedPhone,
          NOT: { id },
        },
      });

      if (phoneTaken) {
        throw new BadRequestException(
          'Ya existe otro cliente con ese teléfono.',
        );
      }
    }

    const splitName = updateClientDto.name
      ? this.splitName(updateClientDto.name)
      : null;

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: splitName?.firstName,
        lastName: splitName?.lastName,
        phone: normalizedPhone,
        email: normalizedEmail,
        status: this.mapUserStatus(updateClientDto.status),
        clientProfile: {
          update: {
            lifecycleStatus: updateClientDto.status,
            document: this.optionalTrim(updateClientDto.document),
            city: this.optionalTrim(updateClientDto.city),
            address: this.optionalTrim(updateClientDto.address),
            emergencyContact: this.optionalTrim(updateClientDto.emergencyContact),
            birthDate: updateClientDto.birthDate
              ? new Date(`${updateClientDto.birthDate}T00:00:00`)
              : undefined,
            preferences: this.optionalTrim(updateClientDto.preferences),
            notes: this.optionalTrim(updateClientDto.observations),
            allergies: this.optionalTrim(updateClientDto.allergies),
            contraindications: this.optionalTrim(updateClientDto.allergies),
            conditions: this.optionalTrim(updateClientDto.conditions),
            consultReason: this.optionalTrim(updateClientDto.consultReason),
          },
        },
      },
      include: {
        clientProfile: {
          include: {
            appointments: {
              include: {
                service: true,
              },
            },
          },
        },
      },
    });

    return this.mapClient(updatedUser, updateClientDto.type, updateClientDto.status);
  }

  async changeLifecycleStatus(id: string, status: ClientStatusDto | 'suspendido' | 'bloqueado') {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.CLIENT,
        clientProfile: { isNot: null },
      },
      include: {
        clientProfile: {
          include: {
            appointments: {
              include: { service: true },
            },
          },
        },
      },
    });

    if (!user?.clientProfile) {
      throw new NotFoundException('El cliente solicitado no existe.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        status: this.mapUserStatus(status),
        clientProfile: {
          update: {
            lifecycleStatus: status,
          },
        },
      },
      include: {
        clientProfile: {
          include: {
            appointments: {
              include: { service: true },
            },
          },
        },
      },
    });

    return this.mapClient(updatedUser);
  }

  async softDeleteClient(id: string) {
    return this.changeLifecycleStatus(id, ClientStatusDto.INACTIVE);
  }

  private mapClient(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      createdAt?: Date;
      updatedAt?: Date;
      clientProfile: {
        id: string;
        document: string | null;
        city: string | null;
        address: string | null;
        emergencyContact: string | null;
        birthDate: Date | null;
        lifecycleStatus?: string | null;
        preferences: string | null;
        notes: string | null;
        allergies: string | null;
        contraindications: string | null;
        conditions: string | null;
        consultReason: string | null;
        appointments?: Array<{
          scheduledAt: Date;
          service: { name: string } | null;
        }>;
      } | null;
    },
    fallbackType?: ClientTypeDto,
    fallbackStatus?: ClientStatusDto,
  ) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const appointments = user.clientProfile?.appointments ?? [];
    const latestAppointment = [...appointments].sort(
      (left, right) =>
        right.scheduledAt.getTime() - left.scheduledAt.getTime(),
    )[0];

    const type =
      fallbackType ??
      (user.clientProfile?.consultReason ? ClientTypeDto.MEDICAL : ClientTypeDto.WELLNESS);

    const status = (
      user.clientProfile?.lifecycleStatus as ClientStatusDto | undefined
    ) ??
      fallbackStatus ??
      (appointments.length === 0
        ? ClientStatusDto.NEW
        : appointments.length >= 8
          ? ClientStatusDto.FREQUENT
          : ClientStatusDto.ACTIVE);

    return {
      id: user.id,
      name,
      initials: this.buildInitials(name),
      type,
      phone: user.phone ?? '',
      email: user.email.includes('@clientes.ohmeria.local') ? '' : user.email,
      lastService:
        latestAppointment?.service?.name ?? 'Sin servicios registrados',
      lastVisit: latestAppointment
        ? latestAppointment.scheduledAt.toISOString()
        : 'Registro reciente',
      status,
      totalVisits: appointments.length,
      birthDate: user.clientProfile?.birthDate?.toISOString().slice(0, 10) ?? null,
      document: user.clientProfile?.document ?? '',
      city: user.clientProfile?.city ?? '',
      address: user.clientProfile?.address ?? '',
      emergencyContact: user.clientProfile?.emergencyContact ?? '',
      preferences: user.clientProfile?.preferences ?? '',
      observations: user.clientProfile?.notes ?? '',
      allergies: user.clientProfile?.allergies ?? '',
      conditions: user.clientProfile?.conditions ?? '',
      consultReason: user.clientProfile?.consultReason ?? '',
      contraindications: user.clientProfile?.contraindications ?? '',
    };
  }

  private splitName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return {
        firstName: 'Cliente',
        lastName: '',
      };
    }

    if (parts.length === 1) {
      return {
        firstName: parts[0],
        lastName: '',
      };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  private buildInitials(name: string) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private optionalTrim(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private mapUserStatus(status?: ClientStatusDto | string) {
    if (status === ClientStatusDto.INACTIVE) {
      return UserStatus.INACTIVE;
    }

    if (status === ClientStatusDto.SUSPENDED || status === ClientStatusDto.BLOCKED) {
      return UserStatus.SUSPENDED;
    }

    if (status) {
      return UserStatus.ACTIVE;
    }

    return undefined;
  }
}
