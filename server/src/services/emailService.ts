import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface NotificationProvider {
  sendEmail(options: EmailOptions): Promise<{ sent: boolean; messageId?: string; error?: string }>;
}

/**
 * Configurable email notification provider.
 * Reads SMTP settings from environment variables. If SMTP_HOST is not set,
 * falls back to a console (simulated) mode that logs the email instead of sending.
 */
export class EmailNotificationProvider implements NotificationProvider {
  private transporter: nodemailer.Transporter | null = null;
  private consoleMode = false;

  constructor() {
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || '';
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

    if (host && user) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: user ? { user, pass } : undefined,
          tls: { rejectUnauthorized: false },
        });
      } catch (e) {
        console.warn('Failed to initialize SMTP transporter:', (e as Error).message);
        this.consoleMode = true;
      }
    } else {
      this.consoleMode = true;
    }

    if (this.consoleMode) {
      console.info('[Email Provider] Running in console/simulated mode. Emails will be logged, not sent.');
    }
  }

  async sendEmail(options: EmailOptions): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    const from = options.from || process.env.EMAIL_FROM || 'noreply@school-grading-system.local';
    const to = options.to;
    const subject = options.subject;

    if (this.consoleMode || !this.transporter) {
      console.log(`\n=== EMAIL (simulated) ===`);
      console.log(`From:    ${from}`);
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      if (options.text) console.log(`Text:\n${options.text}`);
      if (options.html) console.log(`HTML:\n${options.html}`);
      console.log(`=== END EMAIL ===\n`);
      return { sent: true, messageId: `simulated-${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text: options.text || '',
        html: options.html || '',
      });
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      const msg = (err as Error).message || 'Unknown SMTP error';
      console.error('Email send failed:', msg);
      return { sent: false, error: msg };
    }
  }
}
