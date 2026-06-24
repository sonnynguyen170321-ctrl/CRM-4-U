import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const to = (formData.get('To') || formData.get('to')) as string;

    const callerId = process.env.TWILIO_PHONE_NUMBER;
    if (!callerId) {
      console.error('TWILIO_PHONE_NUMBER is not configured.');
      const response = new twilio.twiml.VoiceResponse();
      response.say('Configuration error: Caller ID is missing.');
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'application/xml' }
      });
    }

    const response = new twilio.twiml.VoiceResponse();

    if (to) {
      const dial = response.dial({ callerId });
      dial.number(to);
    } else {
      response.say('Error: Destination phone number is missing.');
    }

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'application/xml' }
    });
  } catch (error) {
    console.error('Error handling voice callback:', error);
    const response = new twilio.twiml.VoiceResponse();
    response.say('An error occurred while connecting the call.');
    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'application/xml' }
    });
  }
}
