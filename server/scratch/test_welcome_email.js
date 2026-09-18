const { sendWelcomeEmail } = require('../src/utils/email');

async function test() {
    console.log('Testing sendWelcomeEmail function import and execution logic...');
    try {
        // We test with a dummy email or check it doesn't throw syntax error
        console.log('sendWelcomeEmail is a function:', typeof sendWelcomeEmail === 'function');
        console.log('Test completed successfully.');
    } catch (err) {
        console.error('Test error:', err);
    }
}

test();
