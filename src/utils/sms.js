/**
 * SMS utility — logs to console in development.
 * In production, integrate Twilio or any Indian SMS gateway (MSG91, Fast2SMS, etc.)
 */
async function sendSMS(phone, message) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SMS → ${phone}] ${message}`);
    return { success: true, dev: true };
  }

  // Uncomment and configure for Twilio in production:
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // const msg = await client.messages.create({
  //   body: message,
  //   from: process.env.TWILIO_PHONE,
  //   to: phone.startsWith('+') ? phone : `+91${phone}`
  // });
  // return { success: true, sid: msg.sid };

  return { success: false, reason: 'SMS not configured for production' };
}

module.exports = { sendSMS };
