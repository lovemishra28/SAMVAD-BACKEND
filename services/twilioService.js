const twilio = require("twilio");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const DEFAULT_COUNTRY_CODE = process.env.TWILIO_DEFAULT_COUNTRY_CODE || "+91";
const TWILIO_SMS_MAX_LENGTH = 1200;

const isTwilioConfigured = () => {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  return ["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(code);
};

const normalizePhone = (mobileNumber) => {
  if (!mobileNumber) return null;

  const raw = String(mobileNumber).trim();
  if (raw.startsWith("+")) return raw;

  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return null;

  // Voter records are 10-digit Indian numbers in this project.
  if (digitsOnly.length === 10) {
    return `${DEFAULT_COUNTRY_CODE}${digitsOnly}`;
  }

  return `+${digitsOnly}`;
};

const sendSms = async ({ to, body }) => {
  if (!isTwilioConfigured()) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env"
    );
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const toPhone = normalizePhone(to);

  if (!toPhone) {
    throw new Error("Invalid recipient phone number");
  }

  const textBody = String(body || "").trim();
  if (!textBody) {
    throw new Error("SMS body cannot be empty");
  }

  const finalBody =
    textBody.length <= TWILIO_SMS_MAX_LENGTH
      ? textBody
      : `${textBody.slice(0, TWILIO_SMS_MAX_LENGTH - 3)}...`;

  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.messages.create({
        body: finalBody,
        from: TWILIO_PHONE_NUMBER,
        to: toPhone,
      });
      return response;
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }

      // Backoff for temporary DNS/network outages.
      await sleep(500 * attempt);
    }
  }

  throw lastError;
};

module.exports = {
  sendSms,
  isTwilioConfigured,
  normalizePhone,
};
