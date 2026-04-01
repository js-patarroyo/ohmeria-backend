import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SaleStatusDto {
  PAID = 'pagada',
  PENDING = 'pendiente',
  RESERVED = 'reserva',
}

export enum SalePaymentMethodDto {
  CASH = 'efectivo',
  BANK_TRANSFER = 'transferencia',
  CARD = 'tarjeta',
  MIXED = 'mixto',
  PENDING = 'pendiente',
}

export enum SaleItemTypeDto {
  PRODUCT = 'producto',
  SERVICE = 'servicio',
}

export class CreateSaleItemDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsEnum(SaleItemTypeDto)
  type!: SaleItemTypeDto;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;

  @IsBoolean()
  isWalkIn!: boolean;

  @IsEnum(SaleStatusDto)
  status!: SaleStatusDto;

  @IsEnum(SalePaymentMethodDto)
  paymentMethod!: SalePaymentMethodDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
