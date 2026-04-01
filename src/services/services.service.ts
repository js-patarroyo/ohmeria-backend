import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalogSummary() {
    return {
      categories: ['WELLNESS_BEAUTY', 'MEDICAL'],
      featured: [
        'Masajes relajantes premium',
        'Limpieza facial',
        'Consulta de medicina general',
      ],
    };
  }

  async listServices() {
    const services = await this.prisma.service.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return services.map((service) => this.mapService(service));
  }

  async getServiceById(id: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    return this.mapService(service);
  }

  async createService(createServiceDto: CreateServiceDto) {
    const service = await this.prisma.service.create({
      data: {
        name: createServiceDto.name.trim(),
        slug: this.buildUniqueSlug(createServiceDto.name),
        description: this.optionalTrim(createServiceDto.description),
        fullDescription: this.optionalTrim(createServiceDto.fullDescription),
        category: createServiceDto.category,
        status: this.optionalTrim(createServiceDto.status) ?? 'activo',
        durationMinutes: createServiceDto.durationMinutes,
        price: createServiceDto.price,
        promoPrice: this.optionalTrim(createServiceDto.promoPrice),
        depositRequired: this.optionalTrim(createServiceDto.depositRequired),
        professionalLabel: this.optionalTrim(createServiceDto.professionalLabel),
        professionalRole: this.optionalTrim(createServiceDto.professionalRole),
        requiresAssessment: createServiceDto.requiresAssessment ?? false,
        requiresFollowUp: createServiceDto.requiresFollowUp ?? false,
        featured: createServiceDto.featured ?? false,
        preparationNotes: this.optionalTrim(createServiceDto.preparationNotes),
        aftercareNotes: this.optionalTrim(createServiceDto.aftercareNotes),
        suggestedFrequency: this.optionalTrim(createServiceDto.suggestedFrequency),
        internalNotes: this.optionalTrim(createServiceDto.internalNotes),
        isActive: true,
      },
    });

    return this.mapService(service);
  }

  async updateService(id: string, updateServiceDto: UpdateServiceDto) {
    const existing = await this.prisma.service.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        name: updateServiceDto.name?.trim(),
        slug: updateServiceDto.name
          ? this.buildUniqueSlug(updateServiceDto.name)
          : undefined,
        description: this.optionalTrim(updateServiceDto.description),
        fullDescription: this.optionalTrim(updateServiceDto.fullDescription),
        category: updateServiceDto.category,
        status: this.optionalTrim(updateServiceDto.status),
        durationMinutes: updateServiceDto.durationMinutes,
        price: updateServiceDto.price,
        promoPrice: this.optionalTrim(updateServiceDto.promoPrice),
        depositRequired: this.optionalTrim(updateServiceDto.depositRequired),
        professionalLabel: this.optionalTrim(updateServiceDto.professionalLabel),
        professionalRole: this.optionalTrim(updateServiceDto.professionalRole),
        requiresAssessment: updateServiceDto.requiresAssessment,
        requiresFollowUp: updateServiceDto.requiresFollowUp,
        featured: updateServiceDto.featured,
        preparationNotes: this.optionalTrim(updateServiceDto.preparationNotes),
        aftercareNotes: this.optionalTrim(updateServiceDto.aftercareNotes),
        suggestedFrequency: this.optionalTrim(updateServiceDto.suggestedFrequency),
        internalNotes: this.optionalTrim(updateServiceDto.internalNotes),
      },
    });

    return this.mapService(service);
  }

  async removeService(id: string) {
    const existing = await this.prisma.service.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    await this.prisma.service.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    return {
      success: true,
      id,
    };
  }

  private mapService(service: any) {
    return {
      id: service.id,
      name: service.name,
      description: service.description ?? '',
      fullDescription: service.fullDescription ?? '',
      category: service.category,
      status: service.status,
      durationMinutes: service.durationMinutes,
      price: service.price.toString(),
      promoPrice: service.promoPrice?.toString() ?? '',
      depositRequired: service.depositRequired?.toString() ?? '',
      professionalLabel: service.professionalLabel ?? '',
      professionalRole: service.professionalRole ?? '',
      requiresAssessment: service.requiresAssessment,
      requiresFollowUp: service.requiresFollowUp,
      featured: service.featured,
      preparationNotes: service.preparationNotes ?? '',
      aftercareNotes: service.aftercareNotes ?? '',
      suggestedFrequency: service.suggestedFrequency ?? '',
      internalNotes: service.internalNotes ?? '',
      createdAt: service.createdAt.toISOString(),
    };
  }

  private buildUniqueSlug(name: string) {
    const base = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    return `${base || 'servicio'}-${Date.now()}`;
  }

  private optionalTrim(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
