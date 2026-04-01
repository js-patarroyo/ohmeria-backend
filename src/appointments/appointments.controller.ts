import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get('statuses')
  getStatuses() {
    return this.appointmentsService.getStatuses();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get()
  listAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.listAppointments(user);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get(':id')
  getAppointmentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appointmentsService.getAppointmentById(user, id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Post()
  createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createAppointmentDto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.createAppointment(user, createAppointmentDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Patch(':id')
  updateAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.updateAppointment(
      user,
      id,
      updateAppointmentDto,
    );
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Delete(':id')
  removeAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appointmentsService.removeAppointment(user, id);
  }
}
