import {
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; blockedUntil?: number }
  >();
  private readonly registerAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; blockedUntil?: number }
  >();
  private readonly attemptWindowMs = 15 * 60 * 1000;
  private readonly maxAttempts = 5;
  private readonly blockDurationMs = 15 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    this.ensureAttemptAllowed(this.registerAttempts, email);

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      this.recordFailedAttempt(this.registerAttempts, email);
      throw new ConflictException('Ya existe una cuenta con este correo.');
    }

    const passwordHash = await hash(registerDto.password, 10);
    const user = await this.usersService.createClientUser({
      email,
      passwordHash,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      phone: registerDto.phone,
    });
    this.clearAttempts(this.registerAttempts, email);

    const payload = this.buildJwtPayload({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    return {
      message: 'Registro exitoso.',
      user,
      accessToken: await this.jwtService.signAsync(payload),
    };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    this.ensureAttemptAllowed(this.loginAttempts, email);

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      this.recordFailedAttempt(this.loginAttempts, email);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordMatches = await compare(loginDto.password, user.passwordHash);

    if (!passwordMatches) {
      this.recordFailedAttempt(this.loginAttempts, email);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      this.recordFailedAttempt(this.loginAttempts, email);
      throw new UnauthorizedException(
        'Tu cuenta no está habilitada para iniciar sesión.',
      );
    }
    this.clearAttempts(this.loginAttempts, email);

    const payload = this.buildJwtPayload({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    return {
      message: 'Inicio de sesión exitoso.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      accessToken: await this.jwtService.signAsync(payload),
    };
  }

  me(userId: string) {
    return this.usersService.getProfile(userId);
  }

  private buildJwtPayload(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private ensureAttemptAllowed(
    store: Map<string, { count: number; firstAttemptAt: number; blockedUntil?: number }>,
    key: string,
  ) {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry) {
      return;
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      throw new HttpException(
        'Demasiados intentos. Intenta nuevamente en unos minutos.',
        429,
      );
    }

    if (now - entry.firstAttemptAt > this.attemptWindowMs) {
      store.delete(key);
    }
  }

  private recordFailedAttempt(
    store: Map<string, { count: number; firstAttemptAt: number; blockedUntil?: number }>,
    key: string,
  ) {
    const now = Date.now();
    const current = store.get(key);

    if (!current || now - current.firstAttemptAt > this.attemptWindowMs) {
      store.set(key, { count: 1, firstAttemptAt: now });
      return;
    }

    const nextCount = current.count + 1;
    store.set(key, {
      count: nextCount,
      firstAttemptAt: current.firstAttemptAt,
      blockedUntil:
        nextCount >= this.maxAttempts ? now + this.blockDurationMs : undefined,
    });
  }

  private clearAttempts(
    store: Map<string, { count: number; firstAttemptAt: number; blockedUntil?: number }>,
    key: string,
  ) {
    store.delete(key);
  }
}
