import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ClientStatusDto, ClientTypeDto } from './create-client.dto';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7,15}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(ClientTypeDto)
  type?: ClientTypeDto;

  @IsOptional()
  @IsEnum(ClientStatusDto)
  status?: ClientStatusDto;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  preferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  consultReason?: string;
}
