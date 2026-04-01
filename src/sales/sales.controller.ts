import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Get()
  listSales() {
    return this.salesService.listSales();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Get(':id')
  getSaleById(@Param('id') id: string) {
    return this.salesService.getSaleById(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Post()
  createSale(
    @Req() request: { user?: AuthenticatedUser },
    @Body() createSaleDto: CreateSaleDto,
  ) {
    return this.salesService.createSale(request.user, createSaleDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Patch(':id')
  updateSale(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto) {
    return this.salesService.updateSale(id, updateSaleDto);
  }
}
