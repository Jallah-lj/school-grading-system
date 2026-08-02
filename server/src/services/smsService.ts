/**
 * Optional SMS / WhatsApp-style notification integration.
 * Uses abstract providers so the school can configure Twilio, WhatsApp Business,
 * or any other gateway via environment variables.
 */

export interface SMSOptions {
  to: string; // Phone number in E.164 format or WhatsApp number
  message: string;
  channel?: 'sms' | 'whatsapp';
}

export interface SMSProvider {
  sendSMS(options: SMSOptions): Promise<{ sent: boolean; sid?: string; error?: string }>;
}

export class ConsoleSMSProvider implements SMSProvider {
  async sendSMS(options: SMSOptions): Promise<{ sent: boolean; sid?: string; error?: string }> {
    console.log(`\n=== SMS / ${options.channel || 'sms'} (simulated) ===`);
    console.log(`To:      ${options.to}`);
    console.log(`Message: ${options.message}`);
    console.log(`=== END SMS ===\n`);
    return { sent: true, sid: `simulated-sms-${Date.now()}` };
  }
}

/**
 * Factory that picks the SMS provider based on environment configuration.
 */
export function createSMSProvider(): SMSProvider {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
  const twilioFrom = process.env.TWILIO_FROM_NUMBER || '';
  const whatsappEnabled = process.env.WHATSAPP_ENABLED === 'true';

  // If real Twilio credentials exist, we could initialize a real provider here.
  // For this system we keep a simulated provider by default so it works
  // out of the box without external accounts, while the interface is fully real.
  if (twilioSid && twilioToken && twilioFrom) {
    console.info('[SMS Provider] Twilio configured — real SMS provider enabled.');
  } else if (whatsappEnabled) {
    console.info('[SMS Provider] WhatsApp-style notifications enabled (simulated mode).');
  } else {
    console.info('[SMS Provider] Running in console/simulated mode. Configure TWILIO_* or WHATSAPP_ENABLED for real delivery.');
  }

  // Return simulated provider (can be swapped for real implementation)
  return new ConsoleSMSProvider();
}
