import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, Role, User, UserStatus } from '@prisma/client';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { hash } from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  updatePasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async createClientUser(params: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: params.email.toLowerCase(),
        passwordHash: params.passwordHash,
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        role: Role.CLIENT,
        clientProfile: {
          create: {},
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        clientProfile: {
          select: {
            id: true,
            allergies: true,
            contraindications: true,
            notes: true,
          },
        },
        staffProfile: {
          select: {
            id: true,
            title: true,
            bio: true,
            isAvailable: true,
          },
        },
      },
    });
  }

  async listTeamMembers() {
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          in: [Role.ADMIN, Role.DOCTOR, Role.SPECIALIST],
        },
      },
      include: {
        staffProfile: {
          include: {
            services: {
              select: {
                id: true,
                name: true,
              },
            },
            appointments: {
              orderBy: {
                scheduledAt: 'asc',
              },
              take: 5,
              include: {
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((user) => this.mapTeamMember(user));
  }

  async createTeamMember(createTeamMemberDto: CreateTeamMemberDto) {
    const email = createTeamMemberDto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo.');
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: createTeamMemberDto.firstName.trim(),
        lastName: this.optionalTrim(createTeamMemberDto.lastName) ?? '',
        email,
        phone: this.optionalTrim(createTeamMemberDto.phone),
        role: createTeamMemberDto.role,
        status: createTeamMemberDto.status ?? UserStatus.ACTIVE,
        passwordHash: await hash(createTeamMemberDto.password, 10),
        staffProfile: {
          create: {
            title: this.optionalTrim(createTeamMemberDto.title),
            bio: this.optionalTrim(createTeamMemberDto.bio),
            isAvailable: createTeamMemberDto.isAvailable ?? true,
            services: createTeamMemberDto.serviceIds?.length
              ? {
                  connect: createTeamMemberDto.serviceIds.map((serviceId) => ({
                    id: serviceId,
                  })),
                }
              : undefined,
          },
        },
      },
      include: {
        staffProfile: {
          include: {
            services: {
              select: {
                id: true,
                name: true,
              },
            },
            appointments: {
              orderBy: {
                scheduledAt: 'asc',
              },
              take: 20,
              include: {
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.mapTeamMember(user);
  }

  async getTeamMemberById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: {
          in: [Role.ADMIN, Role.DOCTOR, Role.SPECIALIST],
        },
      },
      include: {
        staffProfile: {
          include: {
            services: {
              select: {
                id: true,
                name: true,
              },
            },
            appointments: {
              orderBy: {
                scheduledAt: 'asc',
              },
              take: 20,
              include: {
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Integrante del equipo no encontrado.');
    }

    return this.mapTeamMember(user);
  }

  async updateTeamMember(id: string, updateTeamMemberDto: UpdateTeamMemberDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        role: {
          in: [Role.ADMIN, Role.DOCTOR, Role.SPECIALIST],
        },
      },
      include: {
        staffProfile: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Integrante del equipo no encontrado.');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: this.optionalTrim(updateTeamMemberDto.firstName),
        lastName: updateTeamMemberDto.lastName !== undefined
          ? (this.optionalTrim(updateTeamMemberDto.lastName) ?? '')
          : undefined,
        email: updateTeamMemberDto.email?.trim().toLowerCase(),
        phone: this.optionalTrim(updateTeamMemberDto.phone),
        role: updateTeamMemberDto.role,
        status: updateTeamMemberDto.status,
        staffProfile: {
          upsert: {
            create: {
              title: this.optionalTrim(updateTeamMemberDto.title),
              bio: this.optionalTrim(updateTeamMemberDto.bio),
              isAvailable: updateTeamMemberDto.isAvailable ?? true,
              services: updateTeamMemberDto.serviceIds
                ? {
                    connect: updateTeamMemberDto.serviceIds.map((serviceId) => ({
                      id: serviceId,
                    })),
                  }
                : undefined,
            },
            update: {
              title: this.optionalTrim(updateTeamMemberDto.title),
              bio: this.optionalTrim(updateTeamMemberDto.bio),
              isAvailable: updateTeamMemberDto.isAvailable,
              services: updateTeamMemberDto.serviceIds
                ? {
                    set: updateTeamMemberDto.serviceIds.map((serviceId) => ({
                      id: serviceId,
                    })),
                  }
                : undefined,
            },
          },
        },
      },
      include: {
        staffProfile: {
          include: {
            services: {
              select: {
                id: true,
                name: true,
              },
            },
            appointments: {
              orderBy: {
                scheduledAt: 'asc',
              },
              take: 20,
              include: {
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.mapTeamMember(user);
  }

  private mapTeamMember(user: any) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const roleLabel =
      user.role === Role.ADMIN
        ? 'administrador'
        : user.role === Role.DOCTOR
          ? 'doctor'
          : 'especialista';

    const statusLabel =
      user.status === UserStatus.SUSPENDED
        ? 'suspendido'
        : user.status === UserStatus.INACTIVE
          ? 'inactivo'
          : 'activo';

    const upcomingAppointment = user.staffProfile?.appointments?.find(
      (appointment: any) =>
        appointment.scheduledAt >= new Date() &&
        ![
          AppointmentStatus.CANCELLED,
          AppointmentStatus.RESCHEDULED,
          AppointmentStatus.NO_SHOW,
          AppointmentStatus.COMPLETED,
          AppointmentStatus.FOLLOW_UP_COMPLETED,
        ].includes(appointment.status),
    );

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayAppointments =
      user.staffProfile?.appointments?.filter(
        (appointment: any) =>
          appointment.scheduledAt >= startOfDay &&
          appointment.scheduledAt <= endOfDay,
      ) ?? [];

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName ?? '',
      fullName: fullName || user.email,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      roleLabel,
      status: user.status,
      statusLabel,
      title: user.staffProfile?.title ?? '',
      bio: user.staffProfile?.bio ?? '',
      isAvailable: user.staffProfile?.isAvailable ?? false,
      initials: this.buildInitials(fullName || user.email),
      services:
        user.staffProfile?.services?.map((service: any) => ({
          id: service.id,
          name: service.name,
        })) ?? [],
      nextAppointment: upcomingAppointment
        ? {
            id: upcomingAppointment.id,
            scheduledAt: upcomingAppointment.scheduledAt.toISOString(),
            serviceName: upcomingAppointment.service?.name ?? 'Cita',
          }
        : null,
      appointmentsToday: todayAppointments.length,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private buildInitials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? '')
      .join('');
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined) return undefined;
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
