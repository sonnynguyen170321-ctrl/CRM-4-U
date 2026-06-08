import nodemailer from 'nodemailer';
import type { EmailAdapter, SendEmailOptions } from '../EmailService';

interface ImapConfig {
  email: string;
  password: string;
  smtpServer: string;
  smtpPort: number;
  imapServer?: string;
  imapPort?: number;
}

/**
 * IMAP/SMTP adapter for Roundcube and any standard mail server.
 * Uses nodemailer for sending (SMTP) and imapflow for reading (IMAP).
 */
export class ImapAdapter implements EmailAdapter {
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  async send(options: SendEmailOptions): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.config.smtpServer,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      auth: {
        user: this.config.email,
        pass: this.config.password,
      },
      tls: { rejectUnauthorized: false }, // allow self-signed certs for internal mail servers
    });

    await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });
  }

  /** Verify the SMTP connection credentials. Returns true if valid. */
  async verify(): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: this.config.smtpServer,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        auth: { user: this.config.email, pass: this.config.password },
        tls: { rejectUnauthorized: false },
      });
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

/** Verify IMAP/SMTP credentials before saving to DB. */
export async function verifyImapCredentials(config: ImapConfig): Promise<boolean> {
  const adapter = new ImapAdapter(config);
  return adapter.verify();
}
