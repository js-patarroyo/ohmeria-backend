import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

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
  throttleKey?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';
  private readonly throttleWindowMs = 5 * 60 * 1000;
  private readonly recentDeliveries = new Map<string, number>();

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
        `Fecha: ${this.formatFriendlyDate(input.date)}`,
        `Hora: ${this.formatFriendlyTime(input.time)}`,
        `Profesional: ${input.professionalName || 'Por asignar'}`,
        input.notes ? `Notas registradas: ${input.notes}` : '',
        '',
        'Si necesitas un ajuste, puedes comunicarte con nuestro equipo.',
        'Gracias por confiar en Ohmeria.',
      ]
        .filter(Boolean)
        .join('\n'),
      htmlContent: this.wrapHtml({
        eyebrow: 'Cita confirmada',
        title: 'Tu cita fue registrada correctamente',
        recipientName: input.fullName,
        intro:
          'Hemos registrado tu cita en Ohmeria. Este es el resumen con la información principal.',
        highlights: [
          { label: 'Servicio', value: input.serviceName },
          { label: 'Fecha', value: this.formatFriendlyDate(input.date) },
          { label: 'Hora', value: this.formatFriendlyTime(input.time) },
          { label: 'Profesional', value: input.professionalName || 'Por asignar' },
        ],
        detailHtml: input.notes
          ? `<p><strong>Notas registradas:</strong> ${this.escapeHtml(input.notes)}</p>`
          : '',
        closing:
          'Si necesitas un ajuste, puedes comunicarte con nuestro equipo. Gracias por confiar en Ohmeria.',
      }),
      tags: ['appointment', 'appointment-created'],
      idempotencyKey: `appointment-created-${input.email}-${input.date}-${input.time}-${input.serviceName}`,
      throttleKey: `appointment-created-${input.email}-${input.date}-${input.time}-${input.serviceName}`,
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
        `Fecha: ${this.formatFriendlyDate(input.date)}`,
        `Hora: ${this.formatFriendlyTime(input.time)}`,
        `Estado: ${this.formatAppointmentStatusLabel(input.status)}`,
        `Profesional: ${input.professionalName || 'Por asignar'}`,
        input.notes ? `Notas registradas: ${input.notes}` : '',
        '',
        'Consulta los detalles antes de tu visita.',
      ]
        .filter(Boolean)
        .join('\n'),
      htmlContent: this.wrapHtml({
        eyebrow: 'Actualización de cita',
        title: 'Tu cita fue actualizada',
        recipientName: input.fullName,
        intro:
          'Tu cita en Ohmeria tuvo una actualización. Revisa la información más reciente a continuación.',
        highlights: [
          { label: 'Servicio', value: input.serviceName },
          { label: 'Fecha', value: this.formatFriendlyDate(input.date) },
          { label: 'Hora', value: this.formatFriendlyTime(input.time) },
          {
            label: 'Estado',
            value: this.formatAppointmentStatusLabel(input.status),
          },
          { label: 'Profesional', value: input.professionalName || 'Por asignar' },
        ],
        detailHtml: input.notes
          ? `<p><strong>Notas registradas:</strong> ${this.escapeHtml(input.notes)}</p>`
          : '',
        closing: 'Consulta los detalles antes de tu visita.',
      }),
      tags: ['appointment', 'appointment-updated'],
      idempotencyKey: `appointment-updated-${input.email}-${input.date}-${input.time}-${input.status}`,
      throttleKey: `appointment-updated-${input.email}-${input.date}-${input.time}-${input.status}`,
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
        'Tu solicitud de compra fue registrada en Ohmeria.',
        `Estado: ${this.formatSaleStatusLabel(input.status)}`,
        `Método de pago: ${this.formatPaymentMethodLabel(input.paymentMethod)}`,
        `Total: COP ${this.formatCop(input.total)}`,
        '',
        'Detalle:',
        itemsText,
        '',
        'Nuestro equipo validará y continuará el proceso según el estado de la compra.',
      ].join('\n'),
      htmlContent: this.wrapHtml({
        eyebrow: 'Resumen de compra',
        title: 'Tu compra fue registrada en Ohmeria',
        recipientName: input.fullName,
        intro:
          'Este es el resumen de la compra o solicitud enviada al equipo de Ohmeria.',
        highlights: [
          { label: 'Estado', value: this.formatSaleStatusLabel(input.status) },
          {
            label: 'Método de pago',
            value: this.formatPaymentMethodLabel(input.paymentMethod),
          },
          { label: 'Total', value: `COP ${this.formatCop(input.total)}` },
        ],
        detailHtml: `<p><strong>Detalle:</strong></p><ul>${itemsHtml}</ul>`,
        closing:
          'Nuestro equipo validará y continuará el proceso según el estado de la compra.',
      }),
      tags: ['sale', 'sale-created'],
      idempotencyKey: `sale-created-${input.saleId}`,
      throttleKey: `sale-created-${input.saleId}`,
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
        `Estado: ${this.formatSaleStatusLabel(input.status)}`,
        `Método de pago: ${this.formatPaymentMethodLabel(input.paymentMethod)}`,
        `Total: COP ${this.formatCop(input.total)}`,
        '',
        'Detalle:',
        itemsText,
        '',
        input.status.toUpperCase() === 'PAID'
          ? 'Hemos confirmado el pago de tu compra.'
          : 'Consulta el estado actualizado de tu compra en Ohmeria.',
      ].join('\n'),
      htmlContent: this.wrapHtml({
        eyebrow:
          input.status.toUpperCase() === 'PAID'
            ? 'Pago confirmado'
            : 'Actualización de compra',
        title:
          input.status.toUpperCase() === 'PAID'
            ? 'Tu pago fue confirmado'
            : 'Tu compra fue actualizada',
        recipientName: input.fullName,
        intro: 'Te compartimos el estado más reciente de tu compra en Ohmeria.',
        highlights: [
          { label: 'Estado', value: this.formatSaleStatusLabel(input.status) },
          {
            label: 'Método de pago',
            value: this.formatPaymentMethodLabel(input.paymentMethod),
          },
          { label: 'Total', value: `COP ${this.formatCop(input.total)}` },
        ],
        detailHtml: `<p><strong>Detalle:</strong></p><ul>${itemsHtml}</ul>`,
        closing:
          input.status.toUpperCase() === 'PAID'
            ? 'Hemos confirmado el pago de tu compra. Gracias por elegir Ohmeria.'
            : 'Consulta el estado actualizado de tu compra en Ohmeria.',
      }),
      tags: ['sale', 'sale-updated'],
      idempotencyKey: `sale-updated-${input.saleId}-${input.status}`,
      throttleKey: `sale-updated-${input.saleId}-${input.status}`,
    });
  }

  private async safeSend(input: SendMailInput) {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Correo omitido para ${input.to.email}: Brevo no está configurado.`,
      );
      return;
    }

    if (input.throttleKey && !this.registerDeliveryAttempt(input.throttleKey)) {
      this.logger.warn(
        `Correo omitido para ${input.to.email}: límite temporal alcanzado para ${input.throttleKey}.`,
      );
      return;
    }

    try {
      await this.sendTransactionalEmail(input);
      this.logger.log(
        `Correo enviado a ${input.to.email} con asunto "${input.subject}".`,
      );
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
          'Idempotency-Key': this.buildBrevoIdempotencyKey(
            input.idempotencyKey ?? randomUUID(),
          ),
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Brevo devolvió ${response.status}: ${payload}`);
    }
  }

  private registerDeliveryAttempt(key: string) {
    const now = Date.now();

    for (const [entryKey, timestamp] of this.recentDeliveries.entries()) {
      if (now - timestamp > this.throttleWindowMs) {
        this.recentDeliveries.delete(entryKey);
      }
    }

    const previousAttempt = this.recentDeliveries.get(key);

    if (previousAttempt && now - previousAttempt < this.throttleWindowMs) {
      return false;
    }

    this.recentDeliveries.set(key, now);
    return true;
  }

  private buildBrevoIdempotencyKey(source: string) {
    const digest = createHash('sha256').update(source).digest('hex');
    const variant = ['8', '9', 'a', 'b'][parseInt(digest[16], 16) % 4];

    return [
      digest.slice(0, 8),
      digest.slice(8, 12),
      `4${digest.slice(13, 16)}`,
      `${variant}${digest.slice(17, 20)}`,
      digest.slice(20, 32),
    ].join('-');
  }

  private isDeliverableEmail(email?: string | null) {
    if (!email) {
      this.logger.warn('Correo omitido: el destinatario no tiene email.');
      return false;
    }

    const normalized = email.trim().toLowerCase();

    if (!normalized || !normalized.includes('@')) {
      this.logger.warn(
        `Correo omitido para "${email}": el formato del destinatario no es válido.`,
      );
      return false;
    }

    const isLocal = 
      normalized.endsWith('@clientes.ohmeria.local') ||
      normalized.endsWith('@staff.ohmeria.local');

    if (isLocal) {
      this.logger.warn(
        `Correo omitido para ${normalized}: es un correo local/no entregable.`,
      );
      return false;
    }

    return true;
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

  private wrapHtml(input: {
    eyebrow: string;
    title: string;
    recipientName?: string | null;
    intro: string;
    highlights: Array<{ label: string; value: string }>;
    detailHtml?: string;
    closing?: string;
  }) {
    const highlightsHtml = input.highlights
      .map(
        (highlight) => `
          <tr>
            <td style="padding:10px 0;color:#8a7a61;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${this.escapeHtml(highlight.label)}</td>
            <td style="padding:10px 0;color:#1d1b19;font-size:14px;font-weight:600;text-align:right;">${this.escapeHtml(highlight.value)}</td>
          </tr>
        `,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f5f1ea;color:#1d1b19;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:32px 18px;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e7dfd3;border-radius:22px;overflow:hidden;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#faf5eb 0%,#f3eadc 100%);border-bottom:1px solid #eadfce;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#8f7e62;">Ohmeria</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#1d1b19;">${this.escapeHtml(input.title)}</h1>
          <p style="margin:12px 0 0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#a18a67;">${this.escapeHtml(input.eyebrow)}</p>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#40382f;">
            Hola${input.recipientName ? ` <strong>${this.escapeHtml(input.recipientName)}</strong>` : ''},
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#5a5045;line-height:1.75;">
            ${this.escapeHtml(input.intro)}
          </p>
          <div style="border:1px solid #ece3d5;border-radius:16px;padding:18px 20px;background:#fcfaf6;">
            <table style="width:100%;border-collapse:collapse;">
              ${highlightsHtml}
            </table>
          </div>
          ${
            input.detailHtml
              ? `<div style="margin-top:24px;font-size:14px;line-height:1.75;color:#4f463d;">${input.detailHtml}</div>`
              : ''
          }
          ${
            input.closing
              ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.75;color:#5a5045;">${this.escapeHtml(input.closing)}</p>`
              : ''
          }
        </div>
        <div style="padding:18px 32px;border-top:1px solid #ece6dc;background:#faf7f1;">
          <p style="font-size:12px;color:#6f665b;margin:0;">Este es un mensaje automático del sistema de Ohmeria. Si necesitas asistencia adicional, nuestro equipo podrá orientarte directamente.</p>
        </div>
      </div>
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

  private formatFriendlyDate(value: string) {
    const parsed = new Date(`${value}T12:00:00-05:00`);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Bogota',
    });
  }

  private formatFriendlyTime(value: string) {
    const [hour = '00', minute = '00'] = value.split(':');
    const parsed = new Date(`2000-01-01T${hour}:${minute}:00-05:00`);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    });
  }

  private formatAppointmentStatusLabel(status: string) {
    const labels: Record<string, string> = {
      solicitud: 'Solicitud recibida',
      pendiente: 'Pendiente de confirmación',
      requiere_valoracion: 'Requiere valoración previa',
      confirmada: 'Confirmada',
      preparacion: 'En preparación',
      en_curso: 'En curso',
      finalizada: 'Finalizada',
      reprogramada: 'Reprogramada',
      cancelada: 'Cancelada',
      no_asistio: 'No asistió',
      seguimiento: 'Seguimiento pendiente',
    };

    return labels[status] ?? status;
  }

  private formatSaleStatusLabel(status: string) {
    const labels: Record<string, string> = {
      PAID: 'Pagada',
      PENDING: 'Pendiente',
      RESERVED: 'Reservada',
      CANCELLED: 'Cancelada',
      paid: 'Pagada',
      pending: 'Pendiente',
      reserved: 'Reservada',
      cancelled: 'Cancelada',
    };

    return labels[status] ?? status;
  }

  private formatPaymentMethodLabel(method: string) {
    const labels: Record<string, string> = {
      CASH: 'Efectivo',
      BANK_TRANSFER: 'Transferencia',
      CARD: 'Tarjeta',
      MIXED: 'Mixto',
      PENDING: 'Pendiente',
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      card: 'Tarjeta',
      mixed: 'Mixto',
      pending: 'Pendiente',
    };

    return labels[method] ?? method;
  }
}
