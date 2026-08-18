

// validateMobile.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const axios = require('axios');
const { logTransaction } = require('./src/utils/logger');

const API_URL = "https://payments.relworx.com/api/mobile-money/validate";
const API_KEY = process.env.RELWORX_API_KEY;

/**
 * Validates a mobile money number
 * @param {string} msisdn - Phone number in international format (+2567XXXXXXXX)
 */
async function validateMobileNumber(msisdn) {
    if (!API_KEY) {
        throw new Error("RELWORX_API_KEY is not defined in environment variables");
    }

    try {
        const response = await axios.post(API_URL, {
            msisdn: msisdn // MSISDN should already be cleaned by caller if needed
        }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/vnd.relworx.v2",
                "Authorization": `Bearer ${API_KEY}`
            },
            timeout: 30000 // 30 seconds timeout for name validation
        });

        const data = response.data;
        console.log("Validation Success:", JSON.stringify(data));
        logTransaction('VALIDATION', 'success', msisdn, data);
        return data;

    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Validation Failed:", JSON.stringify(errorData));
        throw error;
    }
}

module.exports = { validateMobileNumber };
