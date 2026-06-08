import { google } from 'googleapis';
import type { EmailAdapter, SendEmailOptions } from '../EmailService';

interface GmailConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: Date;
}

/**
 * Gmail adapter using the Gmail API via OAuth 2.0.
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env.
 */
export class GmailAdapter implements EmailAdapter {
  private config: GmailConfig;

  constructor(config: GmailConfig) {
    this.config = config;
  }

  async send(options: SendEmailOptions): Promise<void> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      expiry_date: this.config.tokenExpiry?.getTime(),
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageParts = [
      `From: ${options.from}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      options.html ?? options.text ?? '',
    ];

    const raw = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  }
}

/**
 * Exchange a Google authorization code for OAuth tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeGoogleCode(code: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  oauth2Client.setCredentials(tokens);
  const profile = await gmail.users.getProfile({ userId: 'me' });

  return {
    email: profile.data.emailAddress!,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

/** Build the Google OAuth authorization URL for connecting a Gmail account. */
export function getGoogleAuthUrl(state?: string): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    state,
  });
}
