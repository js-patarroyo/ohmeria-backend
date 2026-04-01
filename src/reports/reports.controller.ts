import { Controller, Get, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get()
  getOverview(
    @Query('range') range?: string,
    @Query('category') category?: string,
  ) {
    return this.reportsService.getOverview(range, category);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get('export.csv')
  async exportCsv(
    @Res() res: Response,
    @Query('range') range?: string,
    @Query('category') category?: string,
  ) {
    const csv = await this.reportsService.exportCsv(range, category);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ohmeria-reportes-${Date.now()}.csv"`,
    );
    res.send(csv);
  }
}
