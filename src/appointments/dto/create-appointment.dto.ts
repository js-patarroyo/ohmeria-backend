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

export enum AppointmentCategoryDto {
  WELLNESS = 'bienestar',
  MEDICAL = 'medico',
}

export enum AppointmentStatusDto {
  SOLICITUD = 'solicitud',
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  PREPARACION = 'preparacion',
  EN_CURSO = 'en_curso',
  FINALIZADA = 'finalizada',
  REPROGRAMADA = 'reprogramada',
  CANCELADA = 'cancelada',
  NO_ASISTIO = 'no_asistio',
  REQUIERE_VALORACION = 'requiere_valoracion',
  SEGUIMIENTO = 'seguimiento',
}

export enum AppointmentPaymentStatusDto {
  PENDING = 'pendiente',
  PARTIAL = 'anticipo',
  PAID = 'completo',
}

export enum AppointmentOverrideSourceDto {
  ADMIN_CAJA = 'admin_caja',
}

export class CreateAppointmentDto {
  @IsString()
  @MaxLength(120)
  clientName!: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsString()
  @Matches(/^\d{7,15}$/)
  clientPhone!: string;

  @IsString()
  @MaxLength(120)
  serviceName!: string;

  @IsEnum(AppointmentCategoryDto)
  category!: AppointmentCategoryDto;

  @IsString()
  @MaxLength(120)
  professionalName!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time!: string;

  @IsInt()
  @Min(15)
  durationMinutes!: number;

  @IsString()
  @MaxLength(80)
  cabin!: string;

  @IsEnum(AppointmentStatusDto)
  status!: AppointmentStatusDto;

  @IsEnum(AppointmentPaymentStatusDto)
  paymentStatus!: AppointmentPaymentStatusDto;

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
