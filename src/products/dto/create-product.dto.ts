import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(120)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  fullDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  presentation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MaxLength(40)
  status!: string;

  @IsString()
  price!: string;

  @IsOptional()
  @IsString()
  internalCost?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxRate?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unit?: string;

  @IsBoolean()
  featured!: boolean;

  @IsBoolean()
  lowStockAlert!: boolean;

  @IsArray()
  @IsString({ each: true })
  relatedServices!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(800)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  imageUrl?: string;
}
