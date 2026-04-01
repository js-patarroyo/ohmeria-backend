import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  listClients() {
    return this.clientsService.listClients();
  }

  @Get(':id')
  getClientById(@Param('id') id: string) {
    return this.clientsService.getClientById(id);
  }

  @Post()
  createClient(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.createClient(createClientDto);
  }

  @Patch(':id')
  updateClient(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.updateClient(id, updateClientDto);
  }

  @Patch(':id/suspend')
  suspendClient(@Param('id') id: string) {
    return this.clientsService.changeLifecycleStatus(id, 'suspendido');
  }

  @Patch(':id/ban')
  banClient(@Param('id') id: string) {
    return this.clientsService.changeLifecycleStatus(id, 'bloqueado');
  }

  @Delete(':id')
  deleteClient(@Param('id') id: string) {
    return this.clientsService.softDeleteClient(id);
  }
}
