import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(
        token,
        {
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      );

      const currentUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
        },
      });

      if (!currentUser) {
        throw new UnauthorizedException('La sesión ya no es válida.');
      }

      if (currentUser.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException(
          'Tu cuenta no está habilitada para usar este recurso.',
        );
      }

      request.user = {
        sub: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
      } satisfies AuthenticatedUser;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    return true;
  }

  private extractTokenFromHeader(request: {
    headers: { authorization?: string };
  }) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
