const db = require('../server/src/config/db');
const { checkRadiusTablesExist, getActiveVoucherSessions } = require('../server/src/utils/radius');

async function checkRadiusStatus() {
    console.log('=== Checking RADIUS Database & Tables ===');
    try {
        const tablesExist = await checkRadiusTablesExist();
        console.log(`RADIUS Tables Exist: ${tablesExist ? 'YES' : 'NO'}`);

        const [nasCount] = await db.query('SELECT COUNT(*) as count FROM nas');
        console.log(`Registered NAS Routers (nas table): ${nasCount[0].count}`);

        const [nasList] = await db.query('SELECT nasname, shortname, type, secret FROM nas');
        console.log('NAS Routers:', nasList);

        const [radcheckCount] = await db.query('SELECT COUNT(*) as count FROM radcheck');
        console.log(`Total Radcheck Entries (User Credentials): ${radcheckCount[0].count}`);

        const [radreplyCount] = await db.query('SELECT COUNT(*) as count FROM radreply');
        console.log(`Total Radreply Entries (User Attributes): ${radreplyCount[0].count}`);

        const [radacctTotal] = await db.query('SELECT COUNT(*) as count FROM radacct');
        console.log(`Total Accounting Records (radacct): ${radacctTotal[0].count}`);

        const [activeRadacct] = await db.query('SELECT COUNT(*) as count FROM radacct WHERE acctstoptime IS NULL');
        console.log(`Active Accounting Sessions (acctstoptime IS NULL): ${activeRadacct[0].count}`);

        const activeSessions = await getActiveVoucherSessions();
        console.log(`Parsed Active Voucher Sessions: ${activeSessions.length}`);
        if (activeSessions.length > 0) {
            console.log('Active Sessions Preview:', activeSessions.slice(0, 5));
        }

        const [recentLogs] = await db.query('SELECT radacctid, username, nasipaddress, acctstarttime, acctstoptime, acctsessiontime, acctterminatecause FROM radacct ORDER BY radacctid DESC LIMIT 5');
        console.log('Recent 5 Accounting Sessions:', recentLogs);

    } catch (err) {
        console.error('Error checking RADIUS status:', err.message);
    } finally {
        process.exit(0);
    }
}

checkRadiusStatus();
