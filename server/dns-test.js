const dns = require('dns');
const dnsPromises = require('dns').promises;
require('dotenv').config();

// Force this Node process to use Google's DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function testSrv() {
  const name = `_mongodb._tcp.${process.env.MONGO_HOST || (process.env.MONGO_URI && (process.env.MONGO_URI.match(/@([^/]+)\//) || [])[1]) || 'puresoul.4marxqx.mongodb.net'}`;
  console.log('Using DNS servers:', dns.getServers());
  console.log('Testing SRV for:', name);
  try {
    const records = await dnsPromises.resolveSrv(name);
    console.log('SRV records:', records);
  } catch (err) {
    //console.error('SRV lookup failed:', err && err.code, err && err.message);
    //console.error(err);
  }
}

testSrv();
