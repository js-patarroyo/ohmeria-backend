import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.sub);
  }

  @Roles(Role.ADMIN)
  @Get('team')
  listTeamMembers() {
    return this.usersService.listTeamMembers();
  }

  @Roles(Role.ADMIN)
  @Post('team')
  createTeamMember(@Body() createTeamMemberDto: CreateTeamMemberDto) {
    return this.usersService.createTeamMember(createTeamMemberDto);
  }

  @Roles(Role.ADMIN)
  @Get('team/:id')
  getTeamMemberById(@Param('id') id: string) {
    return this.usersService.getTeamMemberById(id);
  }

  @Roles(Role.ADMIN)
  @Patch('team/:id')
  updateTeamMember(
    @Param('id') id: string,
    @Body() updateTeamMemberDto: UpdateTeamMemberDto,
  ) {
    return this.usersService.updateTeamMember(id, updateTeamMemberDto);
  }
}
