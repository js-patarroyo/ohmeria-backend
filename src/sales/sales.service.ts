import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  SaleItemType,
  SalePaymentMethod,
  SaleStatus,
  ServiceCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSaleDto,
  SaleItemTypeDto,
  SalePaymentMethodDto,
  SaleStatusDto,
} from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async listSales() {
    const sales = await this.prisma.sale.findMany({
      include: {
        clientProfile: {
          include: {
            user: true,
          },
        },
        items: true,
        createdBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return sales.map((sale) => this.mapSale(sale));
  }

  async getSaleById(id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id },
      include: {
        clientProfile: {
          include: {
            user: true,
          },
        },
        items: true,
        createdBy: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }

    return this.mapSale(sale);
  }

  async createSale(
    user: { sub: string; role: Role } | undefined,
    createSaleDto: CreateSaleDto,
  ) {
    const isClientUser = user?.role === Role.CLIENT;

    if (!isClientUser && !createSaleDto.isWalkIn && !createSaleDto.clientId) {
      throw new BadRequestException(
        'Selecciona un cliente o activa venta rápida.',
      );
    }

    if (isClientUser && createSaleDto.isWalkIn) {
      throw new BadRequestException(
        'La compra anticipada del cliente debe quedar asociada a su cuenta.',
      );
    }

    if (isClientUser && createSaleDto.status === SaleStatusDto.PAID) {
      throw new ForbiddenException(
        'El cliente no puede registrar compras pagadas desde este portal.',
      );
    }

    const uniqueProductIds = createSaleDto.items
      .filter((item) => item.type === SaleItemTypeDto.PRODUCT)
      .map((item) => item.id);
    const uniqueServiceIds = createSaleDto.items
      .filter((item) => item.type === SaleItemTypeDto.SERVICE)
      .map((item) => item.id);

    const [products, services, clientProfile] = await Promise.all([
      uniqueProductIds.length
        ? this.prisma.product.findMany({
            where: {
              id: { in: uniqueProductIds },
              isActive: true,
            },
          })
        : Promise.resolve([]),
      uniqueServiceIds.length
        ? this.prisma.service.findMany({
            where: {
              id: { in: uniqueServiceIds },
              isActive: true,
            },
          })
        : Promise.resolve([]),
      isClientUser
        ? this.prisma.clientProfile.findFirst({
            where: {
              userId: user?.sub,
            },
            include: { user: true },
          })
        : createSaleDto.clientId
        ? this.prisma.clientProfile.findFirst({
            where: {
              OR: [
                { id: createSaleDto.clientId },
                { userId: createSaleDto.clientId },
              ],
            },
            include: { user: true },
          })
        : Promise.resolve(null),
    ]);

    if (isClientUser && !clientProfile) {
      throw new NotFoundException('No se encontró el perfil del cliente autenticado.');
    }

    if (!isClientUser && createSaleDto.clientId && !clientProfile) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    const productMap = new Map<string, (typeof products)[number]>();
    for (const product of products) {
      productMap.set(product.id, product);
    }

    const serviceMap = new Map<string, (typeof services)[number]>();
    for (const service of services) {
      serviceMap.set(service.id, service);
    }

    const normalizedItems = createSaleDto.items.map((item) => {
      if (item.type === SaleItemTypeDto.PRODUCT) {
        const product = productMap.get(item.id);
        if (!product) {
          throw new NotFoundException('Producto no encontrado en la venta.');
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${product.name}.`,
          );
        }

        const unitPrice = Number(product.price);
        return {
          type: SaleItemType.PRODUCT,
          productId: product.id,
          serviceId: undefined,
          name: product.name,
          category: product.category,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
        };
      }

      const service = serviceMap.get(item.id);
      if (!service) {
        throw new NotFoundException('Servicio no encontrado en la venta.');
      }

      const unitPrice = Number(service.promoPrice ?? service.price);
      return {
        type: SaleItemType.SERVICE,
        productId: undefined,
        serviceId: service.id,
        name: service.name,
        category:
          service.category === ServiceCategory.MEDICAL
            ? 'medico'
            : 'bienestar',
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
      };
    });

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );

    const sale = await this.prisma.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          clientProfileId: clientProfile?.id,
          createdById: user?.sub,
          status: this.mapSaleStatus(createSaleDto.status),
          paymentMethod: this.mapPaymentMethod(createSaleDto.paymentMethod),
          isWalkIn: createSaleDto.isWalkIn,
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(subtotal),
          notes: this.optionalTrim(createSaleDto.notes),
          items: {
            create: normalizedItems.map((item) => ({
              type: item.type,
              productId: item.productId,
              serviceId: item.serviceId,
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              totalPrice: new Prisma.Decimal(item.totalPrice),
            })),
          },
        },
        include: {
          clientProfile: { include: { user: true } },
          items: true,
          createdBy: true,
        },
      });

      for (const item of normalizedItems) {
        if (item.type === SaleItemType.PRODUCT && item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      return createdSale;
    });

    await this.mailService.sendSaleCreated({
      email: sale.clientProfile?.user?.email,
      fullName: sale.clientProfile
        ? this.fullName(
            sale.clientProfile.user?.firstName,
            sale.clientProfile.user?.lastName,
          )
        : null,
      saleId: sale.id,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      total: sale.total.toString(),
      items: sale.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        totalPrice: item.totalPrice.toString(),
      })),
    });

    return this.mapSale(sale);
  }

  async updateSale(id: string, updateSaleDto: UpdateSaleDto) {
    const sale = await this.prisma.sale.findFirst({
      where: { id },
      include: {
        clientProfile: {
          include: {
            user: true,
          },
        },
        items: true,
        createdBy: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }

    const updatedSale = await this.prisma.sale.update({
      where: { id },
      data: {
        status: updateSaleDto.status
          ? this.mapSaleStatus(updateSaleDto.status)
          : undefined,
        paymentMethod: updateSaleDto.paymentMethod
          ? this.mapPaymentMethod(updateSaleDto.paymentMethod)
          : undefined,
        notes: updateSaleDto.notes !== undefined
          ? this.optionalTrim(updateSaleDto.notes)
          : undefined,
      },
      include: {
        clientProfile: {
          include: {
            user: true,
          },
        },
        items: true,
        createdBy: true,
      },
    });

    await this.mailService.sendSaleUpdated({
      email: updatedSale.clientProfile?.user?.email,
      fullName: updatedSale.clientProfile
        ? this.fullName(
            updatedSale.clientProfile.user?.firstName,
            updatedSale.clientProfile.user?.lastName,
          )
        : null,
      saleId: updatedSale.id,
      status: updatedSale.status,
      paymentMethod: updatedSale.paymentMethod,
      total: updatedSale.total.toString(),
      items: updatedSale.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        totalPrice: item.totalPrice.toString(),
      })),
    });

    return this.mapSale(updatedSale);
  }

  private mapSaleStatus(status: SaleStatusDto) {
    switch (status) {
      case SaleStatusDto.PAID:
        return SaleStatus.PAID;
      case SaleStatusDto.RESERVED:
        return SaleStatus.RESERVED;
      default:
        return SaleStatus.PENDING;
    }
  }

  private mapPaymentMethod(method: SalePaymentMethodDto) {
    switch (method) {
      case SalePaymentMethodDto.CASH:
        return SalePaymentMethod.CASH;
      case SalePaymentMethodDto.BANK_TRANSFER:
        return SalePaymentMethod.BANK_TRANSFER;
      case SalePaymentMethodDto.CARD:
        return SalePaymentMethod.CARD;
      case SalePaymentMethodDto.MIXED:
        return SalePaymentMethod.MIXED;
      default:
        return SalePaymentMethod.PENDING;
    }
  }

  private mapSale(sale: any) {
    return {
      id: sale.id,
      clientId: sale.clientProfileId ?? null,
      clientName: sale.clientProfile
        ? this.fullName(
            sale.clientProfile.user?.firstName,
            sale.clientProfile.user?.lastName,
          )
        : 'Venta rápida',
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      isWalkIn: sale.isWalkIn,
      subtotal: sale.subtotal.toString(),
      total: sale.total.toString(),
      notes: sale.notes ?? '',
      createdAt: sale.createdAt.toISOString(),
      createdBy: sale.createdBy
        ? this.fullName(sale.createdBy.firstName, sale.createdBy.lastName)
        : '',
      items: sale.items.map((item: any) => ({
        id: item.id,
        type: item.type,
        productId: item.productId,
        serviceId: item.serviceId,
        name: item.name,
        category: item.category ?? '',
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
    };
  }

  private fullName(firstName?: string | null, lastName?: string | null) {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Ohmeria';
  }

  private optionalTrim(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
