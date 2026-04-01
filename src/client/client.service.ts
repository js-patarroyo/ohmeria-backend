import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentStatus,
  SaleStatus,
  ServiceCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  REQUEST_RECEIVED: 'Solicitud recibida',
  PENDING_CONFIRMATION: 'Pendiente de confirmacion',
  REQUIRES_PRE_ASSESSMENT: 'Requiere valoracion previa',
  CONFIRMED: 'Confirmada',
  IN_PREPARATION: 'En preparacion',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  RESCHEDULED: 'Reprogramada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistio',
  FOLLOW_UP_PENDING: 'Seguimiento pendiente',
  FOLLOW_UP_COMPLETED: 'Seguimiento realizado',
};

const serviceCategoryLabels: Record<ServiceCategory, string> = {
  WELLNESS_BEAUTY: 'Bienestar y belleza',
  MEDICAL: 'Servicios medicos',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: 'Pago pendiente',
  PARTIAL: 'Pago parcial',
  PAID: 'Pago completo',
  REFUNDED: 'Reembolsado',
};

const saleStatusLabels: Record<SaleStatus, string> = {
  PAID: 'Pagada',
  PENDING: 'Pendiente en caja',
  RESERVED: 'Reservada',
  CANCELLED: 'Cancelada',
};

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  private mapPurchase(sale: {
    id: string;
    createdAt: Date;
    status: SaleStatus;
    total: any;
    paymentMethod: any;
    items: Array<{ id: string; name: string; quantity: number; type: any }>;
  }) {
    return {
      id: sale.id,
      createdAt: sale.createdAt,
      status: saleStatusLabels[sale.status],
      statusCode: sale.status,
      total: sale.total.toString(),
      paymentMethod: sale.paymentMethod,
      itemsCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      items: sale.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        type: item.type,
      })),
    };
  }

  async getOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        clientProfile: {
          select: {
            id: true,
            allergies: true,
            contraindications: true,
            notes: true,
            appointments: {
              orderBy: { scheduledAt: 'asc' },
              take: 5,
              where: {
                scheduledAt: { gte: new Date() },
              },
              select: {
                id: true,
                scheduledAt: true,
                durationMinutes: true,
                status: true,
                paymentStatus: true,
                service: {
                  select: {
                    name: true,
                    category: true,
                  },
                },
                assignedStaff: {
                  select: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
            sales: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                createdAt: true,
                status: true,
                total: true,
                paymentMethod: true,
                items: {
                  select: {
                    id: true,
                    name: true,
                    quantity: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.clientProfile) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    return {
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
        allergies: user.clientProfile.allergies,
        contraindications: user.clientProfile.contraindications,
        notes: user.clientProfile.notes,
      },
      upcomingAppointments: user.clientProfile.appointments.map((appointment) => ({
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        durationMinutes: appointment.durationMinutes,
        status: appointmentStatusLabels[appointment.status],
        paymentStatus: paymentStatusLabels[appointment.paymentStatus],
        serviceName: appointment.service.name,
        serviceCategory: serviceCategoryLabels[appointment.service.category],
        professionalName: appointment.assignedStaff?.user
          ? `${appointment.assignedStaff.user.firstName} ${appointment.assignedStaff.user.lastName}`.trim()
          : null,
      })),
      purchaseRequests: user.clientProfile.sales.map((sale) =>
        this.mapPurchase(sale),
      ),
      recommendedProducts: [
        'Sérum facial revitalizante',
        'Protector solar facial premium',
        'Aceite corporal relajante premium',
      ],
    };
  }

  async getPurchases(userId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!clientProfile) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        clientProfileId: clientProfile.id,
      },
      include: {
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sales.map((sale) => this.mapPurchase(sale));
  }
}
