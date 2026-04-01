import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  getSummary() {
    return {
      categories: [
        'Cuidado facial',
        'Cuidado corporal',
        'Bienestar',
        'Postoperatorio',
      ],
    };
  }

  async listProducts() {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return products.map((product) => this.mapProduct(product));
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado.');
    }

    return this.mapProduct(product);
  }

  async createProduct(createProductDto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name.trim(),
        slug: this.buildUniqueSlug(createProductDto.name),
        description: this.optionalTrim(createProductDto.description),
        fullDescription: this.optionalTrim(createProductDto.fullDescription),
        category: createProductDto.category.trim(),
        brand: this.optionalTrim(createProductDto.brand),
        presentation: this.optionalTrim(createProductDto.presentation),
        sku: this.optionalTrim(createProductDto.sku),
        status: createProductDto.status.trim(),
        price: createProductDto.price,
        internalCost: this.optionalTrim(createProductDto.internalCost),
        taxRate: createProductDto.taxRate ?? 0,
        stock: createProductDto.stock,
        stockMin: createProductDto.stockMin,
        unit: this.optionalTrim(createProductDto.unit),
        featured: createProductDto.featured,
        lowStockAlert: createProductDto.lowStockAlert,
        relatedServices: createProductDto.relatedServices,
        notes: this.optionalTrim(createProductDto.notes),
        imageUrl: this.optionalTrim(createProductDto.imageUrl),
        isActive: true,
      },
    });

    return this.mapProduct(product);
  }

  async updateProduct(id: string, updateProductDto: UpdateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Producto no encontrado.');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: updateProductDto.name?.trim(),
        slug: updateProductDto.name
          ? this.buildUniqueSlug(updateProductDto.name)
          : undefined,
        description: this.optionalTrim(updateProductDto.description),
        fullDescription: this.optionalTrim(updateProductDto.fullDescription),
        category: updateProductDto.category?.trim(),
        brand: this.optionalTrim(updateProductDto.brand),
        presentation: this.optionalTrim(updateProductDto.presentation),
        sku: this.optionalTrim(updateProductDto.sku),
        status: updateProductDto.status?.trim(),
        price: updateProductDto.price,
        internalCost: this.optionalTrim(updateProductDto.internalCost),
        taxRate: updateProductDto.taxRate,
        stock: updateProductDto.stock,
        stockMin: updateProductDto.stockMin,
        unit: this.optionalTrim(updateProductDto.unit),
        featured: updateProductDto.featured,
        lowStockAlert: updateProductDto.lowStockAlert,
        relatedServices: updateProductDto.relatedServices,
        notes: this.optionalTrim(updateProductDto.notes),
        imageUrl: this.optionalTrim(updateProductDto.imageUrl),
      },
    });

    return this.mapProduct(product);
  }

  async removeProduct(id: string) {
    const existing = await this.prisma.product.findFirst({
      where: {
        id,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Producto no encontrado.');
    }

    await this.prisma.product.update({
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

  private mapProduct(product: any) {
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      fullDescription: product.fullDescription ?? '',
      category: product.category,
      brand: product.brand ?? '',
      presentation: product.presentation ?? '',
      sku: product.sku ?? '',
      status: product.status,
      price: product.price.toString(),
      internalCost: product.internalCost?.toString() ?? '',
      taxRate: product.taxRate,
      stock: product.stock,
      stockMin: product.stockMin ?? 0,
      unit: product.unit ?? '',
      featured: product.featured,
      lowStockAlert: product.lowStockAlert,
      relatedServices: product.relatedServices,
      notes: product.notes ?? '',
      imageUrl: product.imageUrl ?? '',
      createdAt: product.createdAt.toISOString(),
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

    return `${base || 'producto'}-${Date.now()}`;
  }

  private optionalTrim(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
