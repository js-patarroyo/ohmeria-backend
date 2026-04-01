import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceCategory } from '@prisma/client';

export class CreateServiceDto {
  @IsString()
  @MaxLength(140)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  fullDescription?: string;

  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsNumberString()
  price: string;

  @IsOptional()
  @IsNumberString()
  promoPrice?: string;

  @IsOptional()
  @IsNumberString()
  depositRequired?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  professionalLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  professionalRole?: string;

  @IsOptional()
  @IsBoolean()
  requiresAssessment?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresFollowUp?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  preparationNotes?: string;

  @IsOptional()
  @IsString()
  aftercareNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  suggestedFrequency?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
