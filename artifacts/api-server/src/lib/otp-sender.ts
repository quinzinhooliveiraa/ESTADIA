import { logger } from "./logger";

// ── OtpSender interface ────────────────────────────────────────────────────

export interface OtpSender {
  send(telefone: string, codigo: string): Promise<void>;
}

// ── DevLogSender (development / no Twilio creds) ──────────────────────────

export class DevLogSender implements OtpSender {
  async send(telefone: string, codigo: string): Promise<void> {
    logger.info({ telefone, codigo }, "OTP generated (dev — check logs)");
  }
}

// ── TwilioSmsSender ───────────────────────────────────────────────────────

export class TwilioSmsSender implements OtpSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async send(telefone: string, codigo: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const body = new URLSearchParams({
      From: this.fromNumber,
      To: telefone,
      Body: `ESTADIA: seu código é ${codigo}. Válido por 10 minutos.`,
    });

    const credentials = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error({ status: response.status, body: text }, "Twilio SMS failed");
      throw new Error(`Twilio error ${response.status}`);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createOtpSender(): OtpSender {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (sid && token && from) {
    logger.info("OTP sender: Twilio SMS");
    return new TwilioSmsSender(sid, token, from);
  }

  logger.info("OTP sender: DevLog (Twilio env vars not set)");
  return new DevLogSender();
}
