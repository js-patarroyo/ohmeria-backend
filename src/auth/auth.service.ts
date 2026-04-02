import {
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { UserStatus } from '@prisma/client';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

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
  private readonly forgotPasswordAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; blockedUntil?: number }
  >();
  private readonly attemptWindowMs = 15 * 60 * 1000;
  private readonly maxAttempts = 5;
  private readonly blockDurationMs = 15 * 60 * 1000;
  private readonly passwordResetTtlMinutes = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.trim().toLowerCase();
    this.ensureAttemptAllowed(this.forgotPasswordAttempts, email);

    const user = await this.usersService.findByEmail(email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.recordFailedAttempt(this.forgotPasswordAttempts, email);
      return {
        message:
          'Si existe una cuenta asociada a este correo, enviaremos un enlace para restablecer la contraseña.',
      };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.passwordResetTtlMinutes * 60 * 1000,
    );

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    this.clearAttempts(this.forgotPasswordAttempts, email);

    await this.mailService.sendPasswordReset({
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      expiresInMinutes: this.passwordResetTtlMinutes,
      resetUrl: this.buildResetPasswordUrl(rawToken),
    });

    return {
      message:
        'Si existe una cuenta asociada a este correo, enviaremos un enlace para restablecer la contraseña.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenHash = this.hashResetToken(resetPasswordDto.token.trim());

    const storedToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.usedAt ||
      storedToken.expiresAt.getTime() < Date.now() ||
      storedToken.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        'El enlace de recuperación no es válido o ya expiró.',
      );
    }

    const newPasswordHash = await hash(resetPasswordDto.password, 10);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: storedToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: storedToken.userId,
          usedAt: null,
          id: { not: storedToken.id },
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: storedToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
    ]);

    this.clearAttempts(this.loginAttempts, storedToken.user.email.toLowerCase());
    this.clearAttempts(
      this.forgotPasswordAttempts,
      storedToken.user.email.toLowerCase(),
    );

    return {
      message: 'La contraseña fue actualizada correctamente.',
    };
  }

  private buildJwtPayload(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private buildResetPasswordUrl(token: string) {
    const frontendAppUrl =
      this.configService.get<string>('FRONTEND_APP_URL') ??
      this.configService.get<string>('FRONTEND_ORIGIN') ??
      'https://app.ohmeria.com';

    const base = frontendAppUrl.replace(/\/$/, '');
    return `${base}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
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
