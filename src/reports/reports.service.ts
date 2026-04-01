import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  SaleStatus,
  ServiceCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RangeKey =
  | 'hoy'
  | 'esta_semana'
  | 'este_mes'
  | 'ultimo_trimestre'
  | 'este_ano';

type CategoryKey = 'Todos' | 'bienestar' | 'medico';

const revenueStatuses = new Set<AppointmentStatus>([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.FOLLOW_UP_COMPLETED,
]);

const cancellationStatuses = new Set<AppointmentStatus>([
  AppointmentStatus.CANCELLED,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.NO_SHOW,
]);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(range?: string, category?: string) {
    const normalizedRange = this.normalizeRange(range);
    const normalizedCategory = this.normalizeCategory(category);
    const window = this.buildWindow(normalizedRange);
    const previousWindow = this.buildPreviousWindow(window);

    const [
      appointments,
      previousAppointments,
      sales,
      previousSales,
      products,
      teamMembers,
    ] =
      await Promise.all([
        this.fetchAppointments(window.start, window.end, normalizedCategory),
        this.fetchAppointments(
          previousWindow.start,
          previousWindow.end,
          normalizedCategory,
        ),
        this.fetchSales(window.start, window.end),
        this.fetchSales(previousWindow.start, previousWindow.end),
        this.prisma.product.findMany({
          where: { isActive: true },
          orderBy: [{ featured: 'desc' }, { stock: 'asc' }, { createdAt: 'desc' }],
        }),
        this.prisma.user.findMany({
          where: {
            role: {
              in: ['ADMIN', 'DOCTOR', 'SPECIALIST'],
            },
          },
          include: {
            staffProfile: true,
          },
        }),
      ]);

    const newClients = await this.prisma.clientProfile.count({
      where: {
        user: {
          createdAt: {
            gte: window.start,
            lte: window.end,
          },
        },
      },
    });

    const appointmentRevenue = this.sumRevenue(appointments);
    const previousAppointmentRevenue = this.sumRevenue(previousAppointments);
    const paidSalesRevenue = this.sumSaleRevenue(sales, normalizedCategory);
    const previousPaidSalesRevenue = this.sumSaleRevenue(
      previousSales,
      normalizedCategory,
    );
    const revenue = appointmentRevenue + paidSalesRevenue;
    const previousRevenue =
      previousAppointmentRevenue + previousPaidSalesRevenue;
    const completedAppointments = appointments.filter((appointment) =>
      revenueStatuses.has(appointment.status),
    ).length;
    const completedSales = sales.filter(
      (sale) =>
        sale.status === SaleStatus.PAID &&
        this.saleMatchesCategory(sale, normalizedCategory),
    ).length;
    const cancelledAppointments = appointments.filter((appointment) =>
      cancellationStatuses.has(appointment.status),
    ).length;
    const cancellationRate = appointments.length
      ? (cancelledAppointments / appointments.length) * 100
      : 0;
    const avgTicket =
      completedAppointments + completedSales
        ? revenue / (completedAppointments + completedSales)
        : 0;

    const servicePerformance = this.buildServicePerformance(appointments);
    const categoryDistribution = this.buildCategoryDistribution(appointments);
    const weeklyAppointments = this.buildWeeklyAppointments(appointments, window);
    const monthlyRevenue = await this.buildMonthlyRevenue(normalizedCategory);
    const teamPerformance = this.buildTeamPerformance(appointments, teamMembers);
    const clientMetrics = this.buildClientMetrics(appointments);
    const productHighlights = products.slice(0, 7).map((product) => ({
      name: product.name,
      stock: product.stock,
      revenue: this.formatCurrency(
        Number(product.price) * Math.max(product.stock, 1),
      ),
      sold: Math.max((product.stockMin ?? 0) + 5 - product.stock, 0),
      category: product.category,
    }));
    const lowStockProducts = products
      .filter(
        (product) =>
          product.stockMin !== null &&
          product.stockMin !== undefined &&
          product.stock <= product.stockMin,
      )
      .slice(0, 10)
      .map((product) => ({
        name: product.name,
        stock: product.stock,
        minStock: product.stockMin ?? 0,
        category: product.category,
      }));
    const salesTarget = this.buildSalesTarget(
      revenue,
      previousRevenue,
      window,
      appointments,
      sales,
      products,
    );
    const insights = this.buildInsights({
      servicePerformance,
      teamPerformance,
      cancellationRate,
      productHighlights,
      salesTarget,
    });

    return {
      meta: {
        range: normalizedRange,
        category: normalizedCategory,
      },
      kpiCards: [
        {
          label: 'Ingresos totales',
          value: this.formatCurrency(revenue),
          change: this.formatPercentDelta(revenue, previousRevenue),
          trend: revenue >= previousRevenue ? 'up' : 'down',
        },
        {
          label: 'Citas realizadas',
          value: `${completedAppointments}`,
          change: `${completedAppointments - previousAppointments.filter((appointment) => revenueStatuses.has(appointment.status)).length >= 0 ? '+' : ''}${completedAppointments - previousAppointments.filter((appointment) => revenueStatuses.has(appointment.status)).length}`,
          trend:
            completedAppointments >=
            previousAppointments.filter((appointment) =>
              revenueStatuses.has(appointment.status),
            ).length
              ? 'up'
              : 'down',
        },
        {
          label: 'Nuevos clientes',
          value: `${newClients}`,
          change: `${newClients > 0 ? '+' : ''}${newClients}`,
          trend: newClients > 0 ? 'up' : 'down',
        },
        {
          label: 'Ticket promedio',
          value: this.formatCurrency(avgTicket),
          change: `${avgTicket >= 0 ? '+' : ''}${Math.round(avgTicket / 1000)}k`,
          trend: 'up',
        },
        {
          label: 'Tasa de cancelación',
          value: `${cancellationRate.toFixed(1)}%`,
          change: `${cancelledAppointments > 0 ? '+' : ''}${cancelledAppointments}`,
          trend: cancelledAppointments > 0 ? 'down' : 'up',
        },
      ],
      salesTarget,
      serviceData: servicePerformance.map((item) => ({
        name: item.name,
        citas: item.appointments,
        ingresos: Math.round(item.revenue / 1000),
      })),
      categoryDistribution,
      weeklyAppointments,
      monthlyRevenue: monthlyRevenue.map((item) => ({
        month: item.month,
        ingresos: Math.round(item.revenue / 1000),
      })),
      topProducts: productHighlights,
      lowStockProducts,
      teamPerformance,
      clientMetrics,
      dailySalesHistory: this.buildDailySalesHistory(
        appointments,
        sales,
        window,
        normalizedCategory,
      ),
      insights,
      filters: {
        categories: [
          { value: 'Todos', label: 'Todas las categorías' },
          { value: 'bienestar', label: 'Bienestar y belleza' },
          { value: 'medico', label: 'Servicios médicos' },
        ],
      },
    };
  }

  async exportCsv(range?: string, category?: string) {
    const normalizedRange = this.normalizeRange(range);
    const normalizedCategory = this.normalizeCategory(category);
    const window = this.buildWindow(normalizedRange);
    const appointments = await this.fetchAppointments(
      window.start,
      window.end,
      normalizedCategory,
    );
    const sales = await this.fetchSales(window.start, window.end);

    const rows = [
      [
        'Fecha',
        'Hora',
        'Cliente',
        'Servicio',
        'Categoria',
        'Profesional',
        'Estado',
        'Pago',
        'Ingreso',
      ],
      ...appointments.map((appointment) => [
        this.formatDate(appointment.scheduledAt),
        this.formatTime(appointment.scheduledAt),
        this.fullName(
          appointment.clientProfile.user.firstName,
          appointment.clientProfile.user.lastName,
        ),
        appointment.service.name,
        appointment.service.category,
        appointment.assignedStaff
          ? this.fullName(
              appointment.assignedStaff.user.firstName,
              appointment.assignedStaff.user.lastName,
            )
          : 'Sin asignar',
        appointment.status,
        appointment.paymentStatus,
        revenueStatuses.has(appointment.status)
          ? this.formatCurrency(Number(appointment.service.price))
          : this.formatCurrency(0),
      ]),
      ...sales
        .filter((sale) => this.saleMatchesCategory(sale, normalizedCategory))
        .map((sale) => [
          this.formatDate(sale.createdAt),
          this.formatTime(sale.createdAt),
          sale.clientProfile
            ? this.fullName(
                sale.clientProfile.user.firstName,
                sale.clientProfile.user.lastName,
              )
            : 'Venta rápida',
          'Venta en caja',
          'POS',
          sale.createdBy
            ? this.fullName(sale.createdBy.firstName, sale.createdBy.lastName)
            : 'Sin usuario',
          sale.status,
          sale.paymentMethod,
          sale.status === SaleStatus.PAID
            ? this.formatCurrency(
                this.sumSaleLineRevenue(sale, normalizedCategory),
              )
            : this.formatCurrency(0),
        ]),
    ];

    return rows.map((row) => row.map((cell) => this.escapeCsv(String(cell))).join(',')).join('\n');
  }

  private async fetchAppointments(
    start: Date,
    end: Date,
    category: CategoryKey,
  ) {
    const serviceFilter = this.serviceCategoryFilter(category);

    return this.prisma.appointment.findMany({
      where: {
        scheduledAt: {
          gte: start,
          lte: end,
        },
        ...(serviceFilter
          ? {
              service: {
                category: serviceFilter,
              },
            }
          : {}),
      },
      include: {
        service: true,
        clientProfile: {
          include: {
            user: true,
          },
        },
        assignedStaff: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });
  }

  private async fetchSales(start: Date, end: Date) {
    return this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        clientProfile: {
          include: {
            user: true,
          },
        },
        createdBy: true,
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  private buildServicePerformance(appointments: any[]) {
    const grouped = new Map<
      string,
      { name: string; appointments: number; revenue: number }
    >();

    for (const appointment of appointments) {
      const existing = grouped.get(appointment.serviceId) ?? {
        name: appointment.service.name,
        appointments: 0,
        revenue: 0,
      };

      existing.appointments += 1;
      if (revenueStatuses.has(appointment.status)) {
        existing.revenue += Number(appointment.service.price);
      }
      grouped.set(appointment.serviceId, existing);
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.appointments - a.appointments)
      .slice(0, 8);
  }

  private buildCategoryDistribution(appointments: any[]) {
    const total = appointments.length || 1;
    const wellbeing = appointments.filter(
      (appointment) =>
        appointment.service.category === ServiceCategory.WELLNESS_BEAUTY,
    ).length;
    const medical = appointments.filter(
      (appointment) => appointment.service.category === ServiceCategory.MEDICAL,
    ).length;

    return [
      {
        name: 'Bienestar y belleza',
        value: Math.round((wellbeing / total) * 100),
      },
      {
        name: 'Servicios médicos',
        value: Math.round((medical / total) * 100),
      },
    ];
  }

  private buildWeeklyAppointments(appointments: any[], window: { start: Date; end: Date }) {
    const days: {
      day: string;
      confirmadas: number;
      canceladas: number;
      completadas: number;
    }[] = [];

    const start = new Date(window.start);
    const length = Math.min(6, Math.max(1, this.diffDays(window.start, window.end)));

    for (let index = 0; index < length; index += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const dailyAppointments = appointments.filter(
        (appointment) =>
          appointment.scheduledAt >= day && appointment.scheduledAt < nextDay,
      );

      days.push({
        day: new Intl.DateTimeFormat('es-CO', {
          weekday: 'short',
          timeZone: 'America/Bogota',
        }).format(day),
        confirmadas: dailyAppointments.filter((appointment) =>
          [AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PREPARATION].includes(
            appointment.status,
          ),
        ).length,
        canceladas: dailyAppointments.filter((appointment) =>
          cancellationStatuses.has(appointment.status),
        ).length,
        completadas: dailyAppointments.filter((appointment) =>
          revenueStatuses.has(appointment.status),
        ).length,
      });
    }

    return days;
  }

  private async buildMonthlyRevenue(category: CategoryKey) {
    const current = new Date();
    current.setDate(1);
    current.setHours(0, 0, 0, 0);

    const months = Array.from({ length: 6 }, (_, index) => {
      const month = new Date(current);
      month.setMonth(current.getMonth() - (5 - index));
      return month;
    });

    const series: Array<{ month: string; revenue: number }> = [];

    for (const monthStart of months) {
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthStart.getMonth() + 1);
      monthEnd.setMilliseconds(-1);

      const appointments = await this.fetchAppointments(
        monthStart,
        monthEnd,
        category,
      );

      const sales = await this.fetchSales(monthStart, monthEnd);

      series.push({
        month: new Intl.DateTimeFormat('es-CO', {
          month: 'short',
          timeZone: 'America/Bogota',
        }).format(monthStart),
        revenue:
          this.sumRevenue(appointments) +
          this.sumSaleRevenue(sales, category),
      });
    }

    return series;
  }

  private buildTeamPerformance(appointments: any[], teamMembers: any[]) {
    const grouped = new Map<string, { count: number }>();

    for (const appointment of appointments) {
      if (!appointment.assignedStaff?.userId) continue;
      const current = grouped.get(appointment.assignedStaff.userId) ?? { count: 0 };
      current.count += 1;
      grouped.set(appointment.assignedStaff.userId, current);
    }

    const maxCount = Math.max(...Array.from(grouped.values()).map((item) => item.count), 1);

    return teamMembers
      .map((member) => {
        const count = grouped.get(member.id)?.count ?? 0;
        return {
          name: this.fullName(member.firstName, member.lastName),
          role:
            member.role === 'ADMIN'
              ? 'Administrador'
              : member.role === 'DOCTOR'
                ? 'Doctor'
                : 'Especialista',
          citas: count,
          ocupacion: Math.round((count / maxCount) * 100),
          initials: this.initials(member.firstName, member.lastName),
        };
      })
      .sort((a, b) => b.citas - a.citas)
      .slice(0, 5);
  }

  private buildClientMetrics(appointments: any[]) {
    const byClient = new Map<string, number>();

    appointments.forEach((appointment) => {
      const current = byClient.get(appointment.clientProfileId) ?? 0;
      byClient.set(appointment.clientProfileId, current + 1);
    });

    const uniqueClients = byClient.size;
    const frequentClients = Array.from(byClient.values()).filter(
      (count) => count >= 2,
    ).length;
    const followUpPending = appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.FOLLOW_UP_PENDING,
    ).length;
    const retentionRate = uniqueClients
      ? Math.round((frequentClients / uniqueClients) * 100)
      : 0;
    const wellbeingAppointments = appointments.filter(
      (appointment) =>
        appointment.service.category === ServiceCategory.WELLNESS_BEAUTY,
    ).length;
    const medicalAppointments = appointments.length - wellbeingAppointments;

    return [
      { label: 'Clientes frecuentes', value: `${frequentClients}` },
      { label: 'Pacientes con seguimiento', value: `${followUpPending}` },
      { label: 'Retención del periodo', value: `${retentionRate}%` },
      {
        label: 'Categoría más frecuente',
        value:
          wellbeingAppointments >= medicalAppointments
            ? 'Bienestar y belleza'
            : 'Servicios médicos',
      },
    ];
  }

  private buildDailySalesHistory(
    appointments: any[],
    sales: any[],
    window: { start: Date; end: Date },
    category: CategoryKey,
  ) {
    const totalDays = Math.min(
      14,
      Math.max(1, this.diffDays(window.start, window.end)),
    );
    const start = new Date(window.end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (totalDays - 1));

    const rows: Array<{
      day: string;
      charged: number;
      pending: number;
      salesCount: number;
      paidSales: number;
    }> = [];

    for (let index = 0; index < totalDays; index += 1) {
      const dayStart = new Date(start);
      dayStart.setDate(start.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);

      const dayAppointments = appointments.filter(
        (appointment) =>
          appointment.scheduledAt >= dayStart && appointment.scheduledAt < dayEnd,
      );
      const daySales = sales.filter(
        (sale) => sale.createdAt >= dayStart && sale.createdAt < dayEnd,
      );

      const chargedAppointments = this.sumRevenue(dayAppointments);
      const chargedSales = this.sumSaleRevenue(daySales, category);
      const pendingSales = daySales.reduce((sum, sale) => {
        if (sale.status === SaleStatus.PAID) return sum;
        return sum + this.sumSaleLineRevenue(sale, category);
      }, 0);
      const salesCount = daySales.filter((sale) =>
        this.saleMatchesCategory(sale, category),
      ).length;
      const paidSales = daySales.filter(
        (sale) =>
          sale.status === SaleStatus.PAID &&
          this.saleMatchesCategory(sale, category),
      ).length;

      rows.push({
        day: new Intl.DateTimeFormat('es-CO', {
          day: '2-digit',
          month: 'short',
          timeZone: 'America/Bogota',
        }).format(dayStart),
        charged: chargedAppointments + chargedSales,
        pending: pendingSales,
        salesCount,
        paidSales,
      });
    }

    return rows;
  }

  private buildSalesTarget(
    revenue: number,
    previousRevenue: number,
    window: { start: Date; end: Date },
    appointments: any[],
    sales: any[],
    products: any[],
  ) {
    const totalDays = Math.max(this.diffDays(window.start, window.end), 1);
    const elapsedDays = Math.max(
      1,
      Math.min(
        totalDays,
        this.diffDays(window.start, new Date()) || 1,
      ),
    );
    const baseline = previousRevenue > 0 ? previousRevenue * 1.12 : Math.max(revenue, 5000000);
    const targetRevenue = Math.ceil(baseline / 50000) * 50000;
    const progressPercent = targetRevenue > 0 ? Math.min((revenue / targetRevenue) * 100, 999) : 0;
    const projectedRevenue = Math.round((revenue / elapsedDays) * totalDays);
    const serviceRevenue = this.sumRevenue(appointments);
    const productRevenue = this.sumSaleRevenue(sales, 'Todos');
    const inventoryValue = products.reduce(
      (sum, product) => sum + Number(product.price) * product.stock,
      0,
    );

    return {
      target: this.formatCurrency(targetRevenue),
      achieved: this.formatCurrency(revenue),
      progressPercent: Number(progressPercent.toFixed(1)),
      remaining: this.formatCurrency(Math.max(targetRevenue - revenue, 0)),
      projected: this.formatCurrency(projectedRevenue),
      previous: this.formatCurrency(previousRevenue),
      deltaPercent: this.formatPercentNumber(revenue, previousRevenue),
      serviceRevenue: this.formatCurrency(serviceRevenue),
      productRevenue: this.formatCurrency(productRevenue),
      inventoryValue: this.formatCurrency(inventoryValue),
      completedAppointments: appointments.filter((appointment) =>
        revenueStatuses.has(appointment.status),
      ).length,
    };
  }

  private buildInsights({
    servicePerformance,
    teamPerformance,
    cancellationRate,
    productHighlights,
    salesTarget,
  }: any) {
    const topService = servicePerformance[0];
    const topMember = teamPerformance[0];
    const criticalProduct = productHighlights.find((product: any) => product.stock <= 3);

    return [
      {
        title: 'Servicio líder',
        description: topService
          ? `${topService.name} lidera el periodo con ${topService.appointments} citas y ${this.formatCurrency(topService.revenue)}.`
          : 'Aún no hay suficiente actividad para identificar un servicio líder.',
      },
      {
        title: 'Capacidad del equipo',
        description: topMember
          ? `${topMember.name} concentra la mayor carga con ${topMember.citas} citas y ${topMember.ocupacion}% de ocupación relativa.`
          : 'Todavía no hay citas suficientes para medir rendimiento del equipo.',
      },
      {
        title: 'Riesgo operativo',
        description:
          cancellationRate > 0
            ? `La tasa de cancelación está en ${cancellationRate.toFixed(1)}%; conviene reforzar recordatorios y confirmaciones.`
            : 'No hay cancelaciones en el periodo actual, señal positiva para la agenda.',
      },
      {
        title: 'Objetivo comercial',
        description: `El avance hacia la meta va en ${salesTarget.progressPercent}% con proyección de ${salesTarget.projected}.`,
      },
      {
        title: 'Inventario sensible',
        description: criticalProduct
          ? `${criticalProduct.name} está cerca del mínimo con ${criticalProduct.stock} unidades.`
          : 'No se detectan productos en nivel crítico dentro del catálogo activo.',
      },
    ];
  }

  private buildWindow(range: RangeKey) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (range === 'hoy') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (range === 'esta_semana') {
      const day = now.getDay() || 7;
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (range === 'ultimo_trimestre') {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(quarterStartMonth + 3, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (range === 'este_ano') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private buildPreviousWindow(window: { start: Date; end: Date }) {
    const span = window.end.getTime() - window.start.getTime();
    const end = new Date(window.start.getTime() - 1);
    const start = new Date(end.getTime() - span);
    return { start, end };
  }

  private normalizeRange(range?: string): RangeKey {
    if (
      range === 'hoy' ||
      range === 'esta_semana' ||
      range === 'ultimo_trimestre' ||
      range === 'este_ano'
    ) {
      return range;
    }
    return 'este_mes';
  }

  private normalizeCategory(category?: string): CategoryKey {
    if (category === 'bienestar' || category === 'medico') {
      return category;
    }
    return 'Todos';
  }

  private serviceCategoryFilter(category: CategoryKey) {
    if (category === 'bienestar') return ServiceCategory.WELLNESS_BEAUTY;
    if (category === 'medico') return ServiceCategory.MEDICAL;
    return null;
  }

  private sumRevenue(appointments: any[]) {
    return appointments.reduce((sum, appointment) => {
      if (!revenueStatuses.has(appointment.status)) return sum;
      return sum + Number(appointment.service.price);
    }, 0);
  }

  private sumSaleRevenue(sales: any[], category: CategoryKey) {
    return sales.reduce((sum, sale) => {
      if (sale.status !== SaleStatus.PAID) return sum;
      return sum + this.sumSaleLineRevenue(sale, category);
    }, 0);
  }

  private sumSaleLineRevenue(sale: any, category: CategoryKey) {
    return sale.items.reduce((sum: number, item: any) => {
      if (!this.saleItemMatchesCategory(item, category)) {
        return sum;
      }
      return sum + Number(item.totalPrice);
    }, 0);
  }

  private saleMatchesCategory(sale: any, category: CategoryKey) {
    if (category === 'Todos') return true;
    return sale.items.some((item: any) =>
      this.saleItemMatchesCategory(item, category),
    );
  }

  private saleItemMatchesCategory(item: any, category: CategoryKey) {
    if (category === 'Todos') return true;
    const normalizedCategory = String(item.category ?? '').toLowerCase();
    if (category === 'medico') {
      return normalizedCategory === 'medico';
    }
    return item.type === 'PRODUCT' || normalizedCategory === 'bienestar';
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatPercentDelta(current: number, previous: number) {
    const delta = this.formatPercentNumber(current, previous);
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}%`;
  }

  private formatPercentNumber(current: number, previous: number) {
    if (!previous) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  private diffDays(start: Date, end: Date) {
    return Math.ceil((end.getTime() - start.getTime()) / 86400000);
  }

  private initials(firstName?: string, lastName?: string) {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'OH';
  }

  private fullName(firstName?: string, lastName?: string) {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Ohmeria';
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(value);
  }

  private formatTime(value: Date) {
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(value);
  }

  private escapeCsv(value: string) {
    const normalized = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${normalized.replace(/"/g, '""')}"`;
  }
}
