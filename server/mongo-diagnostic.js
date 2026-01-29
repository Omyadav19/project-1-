const dns = require('dns').promises;
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkSrv() {
  const srvName = `_mongodb._tcp.${process.env.MONGO_HOST || extractHost(process.env.MONGO_URI)}`;
  console.log('SRV to resolve:', srvName);
  try {
    const records = await dns.resolveSrv(srvName);
    console.log('SRV records:', records);
  } catch (err) {
    console.error('SRV lookup failed:', err && err.code, err && err.message);
  }
}

function extractHost(uri) {
  if (!uri) return '';
  const match = uri.match(/@([^/]+)\//);
  return match ? match[1] : '';
}

async function tryConnect(uri) {
  if (!uri) {
    console.error('No MONGO_URI provided in .env');
    return;
  }
  console.log('Attempting MongoClient.connect to:', uri.replace(/:(.*?)@/, ':*****@'));
  const client = new MongoClient(uri, { connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB via MongoClient');
    await client.db().command({ ping: 1 });
    console.log('Ping OK');
  } catch (err) {
    console.error('MongoClient connection failed:');
    console.error('Code:', err && err.code);
    console.error('Message:', err && err.message);
    console.error('Full error:', err);
  } finally {
    await client.close().catch(() => {});
  }
}

(async () => {
  await checkSrv();
  await tryConnect(process.env.MONGO_URI);
  console.log('\nHelpful tips:\n- If SRV lookup fails, try changing DNS to 8.8.8.8 or check your network/VPN.\n- In Atlas prefer a non-+srv connection string for environments with DNS issues.');
})();
