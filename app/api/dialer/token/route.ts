import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import twilio from 'twilio';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    console.error('Twilio configuration is missing from environment variables.');
    return NextResponse.json(
      { error: 'Twilio dialer is not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create an Access Token
    const token = new AccessToken(
      accountSid,
      apiKey,
      apiSecret,
      {
        identity: user.id,
        ttl: 3600 // 1 hour token expiration
      }
    );

    // Create a Voice Grant pointing to the TwiML App
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true, // Allow incoming calls if needed
    });

    token.addGrant(voiceGrant);

    return NextResponse.json({
      token: token.toJwt(),
      identity: user.id
    });
  } catch (error: any) {
    console.error('Error generating Twilio token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
