import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

type MailRecipient = {
  email: string;
  name?: string;
};

type SendMailInput = {
  to: MailRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
  idempotencyKey?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('BREVO_API_KEY') &&
        this.configService.get<string>('MAIL_FROM_EMAIL'),
    );
  }

  async sendAppointmentCreated(input: {
    email?: string | null;
    fullName?: string | null;
    serviceName: string;
    date: string;
    time: string;
    professionalName?: string | null;
    notes?: string | null;
  }) {
    if (!this.isDeliverableEmail(input.email)) {
      return;
    }

    await this.safeSend({
      to: {
        email: input.email!,
        name: input.fullName ?? undefined,
      },
      subject: `Confirmación de cita en Ohmeria: ${input.serviceName}`,
      textContent: [
        `Hola${input.fullName ? ` ${input.fullName}` : ''},`,
        '',
        'Tu cita fue registrada correctamente en Ohmeria.',
        `Servicio: ${input.serviceName}`,
        `Fecha: ${input.date}`,
        `Hora: ${input.time}`,
        `Profesional: ${input.professionalName || 'Por asignar'}`,
        input.notes ? `Notas: ${input.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      htmlContent: this.wrapHtml(`
        <h2>Tu cita fue registrada correctamente</h2>
        <p>Hola${input.fullName ? ` <strong>${this.escapeHtml(input.fullName)}</strong>` : ''},</p>
        <p>Hemos registrado tu cita en Ohmeria con el siguiente detalle:</p>
        <ul>
          <li><strong>Servicio:</strong> ${this.escapeHtml(input.serviceName)}</li>
          <li><strong>Fecha:</strong> ${this.escapeHtml(input.date)}</li>
          <li><strong>Hora:</strong> ${this.escapeHtml(input.time)}</li>
          <li><strong>Profesional:</strong> ${this.escapeHtml(input.professionalName || 'Por asignar')}</li>
        </ul>
        ${input.notes ? `<p><strong>Notas:</strong> ${this.escapeHtml(input.notes)}</p>` : ''}
        <p>Te esperamos en Ohmeria.</p>
      `),
      tags: ['appointment', 'appointment-created'],
      idempotencyKey: `appointment-created-${input.email}-${input.date}-${input.time}-${input.serviceName}`,
    });
  }

  async sendAppointmentUpdated(input: {
    email?: string | null;
    fullName?: string | null;
    serviceName: string;
    date: string;
    time: string;
    status: string;
    professionalName?: string | null;
    notes?: string | null;
  }) {
    if (!this.isDeliverableEmail(input.email)) {
      return;
    }

    await this.safeSend({
      to: {
        email: input.email!,
        name: input.fullName ?? undefined,
      },
      subject: `Actualización de cita en Ohmeria: ${input.serviceName}`,
      textContent: [
        `Hola${input.fullName ? ` ${input.fullName}` : ''},`,
        '',
        'Tu cita en Ohmeria fue actualizada.',
        `Servicio: ${input.serviceName}`,
        `Fecha: ${input.date}`,
        `Hora: ${input.time}`,
        `Estado: ${input.status}`,
        `Profesional: ${input.professionalName || 'Por asignar'}`,
        input.notes ? `Notas: ${input.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      htmlContent: this.wrapHtml(`
        <h2>Tu cita fue actualizada</h2>
        <p>Hola${input.fullName ? ` <strong>${this.escapeHtml(input.fullName)}</strong>` : ''},</p>
        <p>Tu cita en Ohmeria fue actualizada con el siguiente detalle:</p>
        <ul>
          <li><strong>Servicio:</strong> ${this.escapeHtml(input.serviceName)}</li>
          <li><strong>Fecha:</strong> ${this.escapeHtml(input.date)}</li>
          <li><strong>Hora:</strong> ${this.escapeHtml(input.time)}</li>
          <li><strong>Estado:</strong> ${this.escapeHtml(input.status)}</li>
          <li><strong>Profesional:</strong> ${this.escapeHtml(input.professionalName || 'Por asignar')}</li>
        </ul>
        ${input.notes ? `<p><strong>Notas:</strong> ${this.escapeHtml(input.notes)}</p>` : ''}
      `),
      tags: ['appointment', 'appointment-updated'],
      idempotencyKey: `appointment-updated-${input.email}-${input.date}-${input.time}-${input.status}`,
    });
  }

  async sendSaleCreated(input: {
    email?: string | null;
    fullName?: string | null;
    saleId: string;
    status: string;
    paymentMethod: string;
    total: string;
    items: Array<{ name: string; quantity: number; totalPrice: string }>;
  }) {
    if (!this.isDeliverableEmail(input.email)) {
      return;
    }

    const itemsHtml = input.items
      .map(
        (item) =>
          `<li>${item.quantity} × ${this.escapeHtml(item.name)} — COP ${this.formatCop(item.totalPrice)}</li>`,
      )
      .join('');
    const itemsText = input.items
      .map(
        (item) =>
          `${item.quantity} × ${item.name} — COP ${this.formatCop(item.totalPrice)}`,
      )
      .join('\n');

    await this.safeSend({
      to: {
        email: input.email!,
        name: input.fullName ?? undefined,
      },
      subject: `Resumen de compra en Ohmeria`,
      textContent: [
        `Hola${input.fullName ? ` ${input.fullName}` : ''},`,
        '',
        'Tu compra fue registrada en Ohmeria.',
        `Estado: ${input.status}`,
        `Método de pago: ${input.paymentMethod}`,
        `Total: COP ${this.formatCop(input.total)}`,
        '',
        'Detalle:',
        itemsText,
      ].join('\n'),
      htmlContent: this.wrapHtml(`
        <h2>Tu compra fue registrada en Ohmeria</h2>
        <p>Hola${input.fullName ? ` <strong>${this.escapeHtml(input.fullName)}</strong>` : ''},</p>
        <p>Este es el resumen de tu compra:</p>
        <ul>
          <li><strong>Estado:</strong> ${this.escapeHtml(input.status)}</li>
          <li><strong>Método de pago:</strong> ${this.escapeHtml(input.paymentMethod)}</li>
          <li><strong>Total:</strong> COP ${this.formatCop(input.total)}</li>
        </ul>
        <p><strong>Detalle:</strong></p>
        <ul>${itemsHtml}</ul>
      `),
      tags: ['sale', 'sale-created'],
      idempotencyKey: `sale-created-${input.saleId}`,
    });
  }

  async sendSaleUpdated(input: {
    email?: string | null;
    fullName?: string | null;
    saleId: string;
    status: string;
    paymentMethod: string;
    total: string;
    items: Array<{ name: string; quantity: number; totalPrice: string }>;
  }) {
    if (!this.isDeliverableEmail(input.email)) {
      return;
    }

    const itemsHtml = input.items
      .map(
        (item) =>
          `<li>${item.quantity} × ${this.escapeHtml(item.name)} — COP ${this.formatCop(item.totalPrice)}</li>`,
      )
      .join('');
    const itemsText = input.items
      .map(
        (item) =>
          `${item.quantity} × ${item.name} — COP ${this.formatCop(item.totalPrice)}`,
      )
      .join('\n');

    await this.safeSend({
      to: {
        email: input.email!,
        name: input.fullName ?? undefined,
      },
      subject:
        input.status.toUpperCase() === 'PAID'
          ? 'Pago confirmado en Ohmeria'
          : 'Actualización de compra en Ohmeria',
      textContent: [
        `Hola${input.fullName ? ` ${input.fullName}` : ''},`,
        '',
        'Tu compra en Ohmeria fue actualizada.',
        `Estado: ${input.status}`,
        `Método de pago: ${input.paymentMethod}`,
        `Total: COP ${this.formatCop(input.total)}`,
        '',
        'Detalle:',
        itemsText,
      ].join('\n'),
      htmlContent: this.wrapHtml(`
        <h2>${input.status.toUpperCase() === 'PAID' ? 'Pago confirmado' : 'Compra actualizada'}</h2>
        <p>Hola${input.fullName ? ` <strong>${this.escapeHtml(input.fullName)}</strong>` : ''},</p>
        <p>Tu compra en Ohmeria fue actualizada.</p>
        <ul>
          <li><strong>Estado:</strong> ${this.escapeHtml(input.status)}</li>
          <li><strong>Método de pago:</strong> ${this.escapeHtml(input.paymentMethod)}</li>
          <li><strong>Total:</strong> COP ${this.formatCop(input.total)}</li>
        </ul>
        <p><strong>Detalle:</strong></p>
        <ul>${itemsHtml}</ul>
      `),
      tags: ['sale', 'sale-updated'],
      idempotencyKey: `sale-updated-${input.saleId}-${input.status}`,
    });
  }

  private async safeSend(input: SendMailInput) {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Correo omitido para ${input.to.email}: Brevo no está configurado.`,
      );
      return;
    }

    try {
      await this.sendTransactionalEmail(input);
    } catch (error) {
      this.logger.error(
        `No fue posible enviar correo a ${input.to.email}: ${(error as Error).message}`,
      );
    }
  }

  private async sendTransactionalEmail(input: SendMailInput) {
    const apiKey = this.configService.getOrThrow<string>('BREVO_API_KEY');
    const senderEmail =
      this.configService.getOrThrow<string>('MAIL_FROM_EMAIL');
    const senderName =
      this.configService.get<string>('MAIL_FROM_NAME') ?? 'Ohmeria';
    const sandbox =
      this.configService.get<string>('BREVO_SANDBOX') === 'true';

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
        ...(sandbox ? { 'X-Sib-Sandbox': 'drop' } : {}),
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: input.to.email,
            name: input.to.name,
          },
        ],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
        tags: input.tags,
        headers: {
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Brevo devolvió ${response.status}: ${payload}`);
    }
  }

  private isDeliverableEmail(email?: string | null) {
    if (!email) {
      return false;
    }

    const normalized = email.trim().toLowerCase();

    if (!normalized || !normalized.includes('@')) {
      return false;
    }

    return !(
      normalized.endsWith('@clientes.ohmeria.local') ||
      normalized.endsWith('@staff.ohmeria.local')
    );
  }

  private formatCop(value: string | number) {
    const amount =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value).replace(',', '.'));

    if (Number.isNaN(amount)) {
      return String(value);
    }

    return amount.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  private wrapHtml(content: string) {
    return `<!DOCTYPE html>
<html lang="es">
  <body style="font-family:Arial,Helvetica,sans-serif;background:#f8f5ef;color:#1d1b19;line-height:1.6;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e7dfd3;border-radius:16px;padding:32px;">
      <p style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#8f7e62;margin:0 0 16px;">Ohmeria</p>
      ${content}
      <hr style="border:none;border-top:1px solid #ece6dc;margin:24px 0;" />
      <p style="font-size:12px;color:#6f665b;margin:0;">Este es un mensaje automático del sistema interno de Ohmeria.</p>
    </div>
  </body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
