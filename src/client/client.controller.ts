import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ClientService } from './client.service';

@Controller('client')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Roles(Role.CLIENT)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.clientService.getOverview(user.sub);
  }

  @Roles(Role.CLIENT)
  @Get('purchases')
  getPurchases(@CurrentUser() user: AuthenticatedUser) {
    return this.clientService.getPurchases(user.sub);
  }
}
