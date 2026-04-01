import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SalePaymentMethodDto, SaleStatusDto } from './create-sale.dto';

export class UpdateSaleDto {
  @IsOptional()
  @IsEnum(SaleStatusDto)
  status?: SaleStatusDto;

  @IsOptional()
  @IsEnum(SalePaymentMethodDto)
  paymentMethod?: SalePaymentMethodDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
