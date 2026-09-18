const { processTrialReminders } = require('../src/services/trialReminderCron');

async function test() {
    console.log('Testing processTrialReminders execution...');
    try {
        await processTrialReminders();
        console.log('processTrialReminders executed successfully with no errors!');
    } catch (err) {
        console.error('Error running processTrialReminders:', err);
    }
}

test();
