import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AppointmentCategoryDto,
  AppointmentOverrideSourceDto,
  AppointmentPaymentStatusDto,
  AppointmentStatusDto,
} from './create-appointment.dto';

export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7,15}$/)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceName?: string;

  @IsOptional()
  @IsEnum(AppointmentCategoryDto)
  category?: AppointmentCategoryDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  professionalName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cabin?: string;

  @IsOptional()
  @IsEnum(AppointmentStatusDto)
  status?: AppointmentStatusDto;

  @IsOptional()
  @IsEnum(AppointmentPaymentStatusDto)
  paymentStatus?: AppointmentPaymentStatusDto;

  @IsOptional()
  @IsString()
  depositAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNotes?: string;

  @IsOptional()
  @IsBoolean()
  allowConflictOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;

  @IsOptional()
  @IsEnum(AppointmentOverrideSourceDto)
  overrideSource?: AppointmentOverrideSourceDto;
}
