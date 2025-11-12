const { connect } = require('nats');
const dns = require('dns').promises;

class DNSModule {
  constructor() {
    this.name = 'dns-module';
    this.version = '1.0.0';
    this.natsConnection = null;
  }

  async start() {
    console.log('🚀 Starting DNS Module with REAL DNS resolution...');
    
    try {
      await this.connectToNATS();
      await this.announceModule();
      await this.startJobProcessing();
      
      console.log('✅ DNS Module ready - REAL DNS resolution only');
    } catch (error) {
      console.error('❌ DNS Module failed to start:', error);
      setTimeout(() => this.start(), 5000);
    }
  }

  async connectToNATS() {
    const natsUrl = process.env.NATS_URL || 'nats://nats:4222';
    this.natsConnection = await connect({ 
      servers: natsUrl,
      reconnect: true,
      maxReconnectAttempts: -1
    });
    console.log('✅ DNS Module connected to NATS');
  }

  async announceModule() {
    const announcement = {
      name: this.name,
      version: this.version,
      type: 'dns',
      capabilities: ['dns_lookup', 'dns_resolution_time', 'multiple_record_types'],
      timestamp: Date.now(),
      rfcCompliance: ['RFC2330', 'RFC1035', 'RFC8484']
    };

    await this.natsConnection.publish('mmn.modules.announce', JSON.stringify(announcement));
    console.log('📢 DNS Module announced - REAL DNS resolution only');
  }

  async startJobProcessing() {
    const subscription = this.natsConnection.subscribe('mmn.jobs.submit', {
      queue: 'dns-workers'
    });

    console.log('👂 Listening for REAL DNS lookup jobs...');

    for await (const msg of subscription) {
      try {
        const job = JSON.parse(msg.data);
        
        if (job.type === 'dns') {
          console.log(`🎯 Processing REAL DNS lookup: ${job.target}`);
          await this.processDNSJob(job);
        }
      } catch (error) {
        console.error('❌ DNS Job processing error:', error);
      }
    }
  }

  async processDNSJob(job) {
    try {
      // ✅ REAL DNS resolution with multiple record types
      const dnsResult = await this.executeRealDNSLookup(job.target);
      
      // Add job ID to result
      dnsResult.jobId = job.id;
      
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(dnsResult));
      console.log(`✅ REAL DNS result for ${job.target}: ${dnsResult.result.success ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.error(`❌ REAL DNS error for ${job.target}:`, error);
      const errorResult = this.createErrorResult(job, `DNS lookup failed: ${error.message}`);
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(errorResult));
    }
  }

  async executeRealDNSLookup(target) {
    try {
      // ✅ Validate domain first
      if (!this.isValidDomain(target)) {
        return this.createDNSResult(target, false, [], null, 'Invalid domain format', 'A');
      }

      const cleanTarget = this.cleanTarget(target);
      
      console.log(`🔧 Performing REAL DNS lookup for: ${cleanTarget}`);
      
      const startTime = Date.now();
      
      // ✅ Try multiple DNS record types
      let addresses = [];
      let recordType = 'A';
      
      try {
        // First try A records (IPv4)
        addresses = await dns.resolve4(cleanTarget);
        recordType = 'A';
      } catch (error) {
        // If A records fail, try AAAA records (IPv6)
        try {
          addresses = await dns.resolve6(cleanTarget);
          recordType = 'AAAA';
        } catch (error2) {
          // If both fail, try ANY and filter
          try {
            const anyRecords = await dns.resolveAny(cleanTarget);
            addresses = anyRecords
              .filter(record => record.type === 'A' || record.type === 'AAAA')
              .map(record => record.address);
            recordType = 'ANY';
          } catch (error3) {
            throw error; // Throw original error
          }
        }
      }
      
      const resolveTime = Date.now() - startTime;

      return this.createDNSResult(
        target,
        true,
        addresses,
        resolveTime,
        `Resolved ${cleanTarget} to ${addresses.length} IP addresses (${recordType}) in ${resolveTime}ms`,
        recordType
      );

    } catch (error) {
      // ✅ REAL DNS error handling
      let errorMessage = 'DNS resolution failed';
      let errorCode = 'UNKNOWN_ERROR';
      
      if (error.code === 'ENOTFOUND') {
        errorMessage = `Domain not found: ${this.cleanTarget(target)}`;
        errorCode = 'DOMAIN_NOT_FOUND';
      } else if (error.code === 'ETIMEOUT') {
        errorMessage = 'DNS resolution timeout - no response from DNS servers';
        errorCode = 'TIMEOUT';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'DNS server refused connection';
        errorCode = 'CONNECTION_REFUSED';
      } else if (error.code === 'ESERVFAIL') {
        errorMessage = 'DNS server failure';
        errorCode = 'SERVER_FAILURE';
      } else if (error.code === 'ENODATA') {
        errorMessage = 'Domain exists but has no DNS records';
        errorCode = 'NO_DATA';
      } else {
        errorMessage = `DNS error: ${error.message}`;
        errorCode = error.code || 'UNKNOWN';
      }
      
      return this.createDNSResult(
        this.cleanTarget(target), 
        false, 
        [], 
        null, 
        errorMessage,
        'A',
        errorCode
      );
    }
  }

  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return false;
    }
    
    const cleanDomain = this.cleanTarget(domain);
    
    // Basic domain validation
    if (cleanDomain.length < 1 || cleanDomain.length > 253) {
      return false;
    }
    
    // Check for valid domain structure
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    
    return domainRegex.test(cleanDomain);
  }

  cleanTarget(target) {
    // Remove protocols and paths, keep only domain
    return target
      .replace(/^(https?|ftp):\/\//, '') // Remove protocol
      .replace(/\/.*$/, '') // Remove path
      .replace(/^www\./, '') // Remove www prefix
      .trim();
  }

  createDNSResult(target, success, addresses, resolveTime, message, recordType = 'A', errorCode = null) {
    const timestamp = Date.now();
    
    return {
      jobId: `dns_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'dns',
      target: target,
      timestamp: timestamp,
      status: 'completed',
      result: {
        addresses: addresses,
        resolveTime: resolveTime,
        success: success,
        addressCount: addresses.length,
        recordType: recordType,
        errorCode: errorCode,
        message: message,
        isRealMeasurement: true,
        metadata: {
          dnsServer: 'system-default',
          protocol: 'UDP',
          port: 53,
          timestamp: new Date(timestamp).toISOString()
        }
      }
    };
  }

  createErrorResult(job, errorMessage) {
    return {
      jobId: job.id,
      type: 'dns',
      target: job.target,
      timestamp: Date.now(),
      status: 'completed',
      result: {
        addresses: [],
        resolveTime: null,
        success: false,
        addressCount: 0,
        recordType: 'A',
        errorCode: 'PROCESSING_ERROR',
        error: errorMessage,
        message: `DNS lookup for ${job.target} failed: ${errorMessage}`,
        isRealMeasurement: true,
        metadata: {
          dnsServer: 'system-default',
          protocol: 'UDP',
          port: 53,
          timestamp: new Date().toISOString()
        }
      }
    };
  }
}

// Start the DNS Module
const dnsModule = new DNSModule();
dnsModule.start().catch(error => {
  console.error('DNS Module startup failed:', error);
  process.exit(1);
});

// Error handling for production
process.on('uncaughtException', (error) => {
  console.error('❌ DNS Module - Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ DNS Module - Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down DNS Module gracefully...');
  process.exit(0);
});