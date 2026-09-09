import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type {
  NotificationDeliveryResult,
  NotificationDeliveryStrategy,
  NotificationMessage,
} from '../notification-message';

@Injectable()
export class EmailNotificationStrategy implements NotificationDeliveryStrategy {
  readonly channel = NotificationChannel.EMAIL;

  constructor(private readonly configService: ConfigService) {}

  async deliver(
    message: NotificationMessage,
  ): Promise<NotificationDeliveryResult> {
    const host = this.configService.get<string>('SMTP_HOST');
    if (!host) throw new Error('SMTP_HOST is not configured');
    const user = this.configService.get<string>('SMTP_USER');
    const transporter = nodemailer.createTransport({
      host,
      port: this.configService.getOrThrow<number>('SMTP_PORT'),
      secure: false,
      auth: user
        ? {
            user,
            pass: this.configService.get<string>('SMTP_PASSWORD') ?? '',
          }
        : undefined,
    });
    const subject = `[omniSentinel] ${message.event.replaceAll('_', ' ')} · ${message.incident.code}`;
    const sent = await transporter.sendMail({
      from: this.configService.getOrThrow<string>('SMTP_FROM'),
      to: message.destination,
      subject,
      text: this.textBody(message),
      html: this.htmlBody(message),
    });
    return {
      metadata: {
        messageId: sent.messageId,
        accepted: sent.accepted,
        rejected: sent.rejected,
      },
    };
  }

  private textBody(message: NotificationMessage): string {
    const incident = message.incident;
    return [
      'omniSentinel notification',
      `Event: ${message.event}`,
      `Incident: ${incident.code}`,
      `Severity: ${incident.severity}`,
      `Status: ${incident.status}`,
      `Root cause: ${incident.rootCause} (${incident.rootCauseConfidence}%)`,
      `OLT/PON: ${incident.oltExternalId ?? '—'} / ${incident.ponIdentifier ?? '—'}`,
      `Affected customers: ${incident.confirmedCustomerCount}`,
    ].join('\n');
  }

  private htmlBody(message: NotificationMessage): string {
    const incident = message.incident;
    return `<h2>omniSentinel notification</h2>
      <p><b>Event:</b> ${message.event}</p>
      <p><b>Incident:</b> ${incident.code}</p>
      <p><b>Severity:</b> ${incident.severity} · <b>Status:</b> ${incident.status}</p>
      <p><b>Root cause:</b> ${incident.rootCause} (${incident.rootCauseConfidence}%)</p>
      <p><b>OLT / PON:</b> ${incident.oltExternalId ?? '—'} / ${incident.ponIdentifier ?? '—'}</p>
      <p><b>Affected customers:</b> ${incident.confirmedCustomerCount}</p>`;
  }
}
