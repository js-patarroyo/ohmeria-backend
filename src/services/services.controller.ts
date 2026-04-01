import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Get('catalog')
  getCatalogSummary() {
    return this.servicesService.getCatalogSummary();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get()
  listServices() {
    return this.servicesService.listServices();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Get(':id')
  getServiceById(@Param('id') id: string) {
    return this.servicesService.getServiceById(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Post()
  createService(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.createService(createServiceDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Patch(':id')
  updateService(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
  ) {
    return this.servicesService.updateService(id, updateServiceDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Delete(':id')
  removeService(@Param('id') id: string) {
    return this.servicesService.removeService(id);
  }
}
