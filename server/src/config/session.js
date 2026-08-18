// Simple in-memory session store
// format: { phoneNumber: { expiry: timestamp, token: string } }
const sessionStore = new Map();

module.exports = sessionStore;
