const { connect } = require('nats');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class HTTPModule {
  constructor() {
    this.name = 'http-module';
    this.version = '1.0.0';
    this.natsConnection = null;
  }

  async start() {
    console.log('🚀 Starting HTTP Module with REAL HTTP requests...');
    
    try {
      await this.connectToNATS();
      await this.announceModule();
      await this.startJobProcessing();
      
      console.log('✅ HTTP Module ready - REAL HTTP requests only');
    } catch (error) {
      console.error('❌ HTTP Module failed to start:', error);
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
    console.log('✅ HTTP Module connected to NATS');
  }

  async announceModule() {
    const announcement = {
      name: this.name,
      version: this.version,
      type: 'http',
      capabilities: ['http_probe', 'status_check', 'response_time', 'header_validation'],
      timestamp: Date.now(),
      rfcCompliance: ['RFC2330', 'RFC2616', 'RFC7230', 'RFC7231']
    };

    await this.natsConnection.publish('mmn.modules.announce', JSON.stringify(announcement));
    console.log('📢 HTTP Module announced - REAL HTTP requests only');
  }

  async startJobProcessing() {
    const subscription = this.natsConnection.subscribe('mmn.jobs.submit', {
      queue: 'http-workers'
    });

    console.log('👂 Listening for REAL HTTP probe jobs...');

    for await (const msg of subscription) {
      try {
        const job = JSON.parse(msg.data);
        
        if (job.type === 'http') {
          console.log(`🎯 Processing REAL HTTP probe: ${job.target}`);
          await this.processHTTPJob(job);
        }
      } catch (error) {
        console.error('❌ HTTP Job processing error:', error);
      }
    }
  }

  async processHTTPJob(job) {
    try {
      // ✅ REAL HTTP request with detailed analysis
      const httpResult = await this.executeRealHTTPRequest(job.target);
      
      // Add job ID to result
      httpResult.jobId = job.id;
      
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(httpResult));
      console.log(`✅ REAL HTTP result for ${job.target}: ${httpResult.result.statusCode || 'FAILED'}`);
      
    } catch (error) {
      console.error(`❌ REAL HTTP error for ${job.target}:`, error);
      const errorResult = this.createErrorResult(job, `HTTP probe failed: ${error.message}`);
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(errorResult));
    }
  }

  executeRealHTTPRequest(target) {
    return new Promise((resolve) => {
      const url = this.normalizeUrl(target);
      if (!url) {
        resolve(this.createHTTPResult(target, false, null, null, 'Invalid URL format'));
        return;
      }

      console.log(`🔧 Performing REAL HTTP request to: ${url}`);
      
      const protocol = url.startsWith('https') ? https : http;
      const startTime = Date.now();
      let responseTime = null;
      let statusCode = null;
      let statusMessage = '';
      let headers = {};
      let finalUrl = url;

      const options = {
        method: 'GET',
        timeout: 15000,
        headers: {
          'User-Agent': 'Measurement-Network-Probe/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'close'
        },
        rejectUnauthorized: false // Allow self-signed certificates for testing
      };

      const req = protocol.request(url, options, (res) => {
        responseTime = Date.now() - startTime;
        statusCode = res.statusCode;
        statusMessage = res.statusMessage;
        headers = this.sanitizeHeaders(res.headers);
        finalUrl = res.responseUrl || url;

        // Collect response body to ensure complete transfer
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          const success = statusCode >= 200 && statusCode < 400;
          const size = Buffer.byteLength(body, 'utf8');
          
          resolve(this.createHTTPResult(
            target,
            success,
            statusCode,
            responseTime,
            `HTTP ${statusCode} - ${statusMessage}`,
            headers,
            finalUrl,
            size
          ));
        });
      });

      req.on('timeout', () => {
        responseTime = Date.now() - startTime;
        resolve(this.createHTTPResult(
          target, 
          false, 
          null, 
          responseTime, 
          'Request timeout after 15 seconds'
        ));
        req.destroy();
      });

      req.on('error', (error) => {
        responseTime = Date.now() - startTime;
        let errorMessage = 'Connection failed';
        let errorType = 'CONNECTION_ERROR';
        
        if (error.code === 'ENOTFOUND') {
          errorMessage = 'Host not found - DNS resolution failed';
          errorType = 'DNS_ERROR';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused - server is not accepting connections';
          errorType = 'CONNECTION_REFUSED';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timeout - server did not respond';
          errorType = 'CONNECTION_TIMEOUT';
        } else if (error.code === 'CERT_HAS_EXPIRED') {
          errorMessage = 'SSL certificate expired';
          errorType = 'SSL_ERROR';
        } else if (error.code === 'SELF_SIGNED_CERT') {
          errorMessage = 'Self-signed SSL certificate';
          errorType = 'SSL_ERROR';
        } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          errorMessage = 'Unable to verify SSL certificate';
          errorType = 'SSL_ERROR';
        } else if (error.code === 'HPE_INVALID_VERSION') {
          errorMessage = 'Invalid HTTP version';
          errorType = 'PROTOCOL_ERROR';
        } else {
          errorMessage = `Network error: ${error.message}`;
          errorType = error.code || 'NETWORK_ERROR';
        }
        
        resolve(this.createHTTPResult(
          target, 
          false, 
          null, 
          responseTime, 
          errorMessage,
          {},
          url,
          0,
          errorType
        ));
      });

      // Set socket timeout
      req.setTimeout(15000, () => {
        req.destroy();
      });

      req.end();
    });
  }

  normalizeUrl(target) {
    try {
      let url = target.trim();
      
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Validate URL format
      const urlObj = new URL(url);
      
      // Ensure we have a valid hostname
      if (!urlObj.hostname) {
        return null;
      }
      
      return urlObj.href;
    } catch (error) {
      return null;
    }
  }

  sanitizeHeaders(headers) {
    const sanitized = {};
    const safeHeaders = [
      'content-type', 'content-length', 'server', 'date', 
      'cache-control', 'etag', 'last-modified', 'location',
      'x-powered-by', 'x-frame-options', 'x-content-type-options'
    ];
    
    safeHeaders.forEach(header => {
      if (headers[header]) {
        sanitized[header] = headers[header];
      }
    });
    
    return sanitized;
  }

  createHTTPResult(target, success, statusCode, responseTime, message, headers = {}, finalUrl = null, contentSize = 0, errorType = null) {
    const timestamp = Date.now();
    
    return {
      jobId: `http_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'http',
      target: target,
      timestamp: timestamp,
      status: 'completed',
      result: {
        statusCode: statusCode,
        statusMessage: message.includes(' - ') ? message.split(' - ')[1] : message,
        responseTime: responseTime,
        success: success,
        headers: headers,
        finalUrl: finalUrl || target,
        contentSize: contentSize,
        errorType: errorType,
        message: message,
        isRealMeasurement: true,
        metadata: {
          protocol: finalUrl && finalUrl.startsWith('https') ? 'HTTPS' : 'HTTP',
          method: 'GET',
          userAgent: 'Measurement-Network-Probe/1.0',
          timestamp: new Date(timestamp).toISOString()
        }
      }
    };
  }

  createErrorResult(job, errorMessage) {
    return {
      jobId: job.id,
      type: 'http',
      target: job.target,
      timestamp: Date.now(),
      status: 'completed',
      result: {
        statusCode: null,
        responseTime: null,
        success: false,
        headers: {},
        finalUrl: job.target,
        contentSize: 0,
        errorType: 'PROCESSING_ERROR',
        error: errorMessage,
        message: `HTTP probe to ${job.target} failed: ${errorMessage}`,
        isRealMeasurement: true,
        metadata: {
          protocol: 'HTTP/HTTPS',
          method: 'GET',
          userAgent: 'Measurement-Network-Probe/1.0',
          timestamp: new Date().toISOString()
        }
      }
    };
  }
}

// Start the HTTP Module
const httpModule = new HTTPModule();
httpModule.start().catch(error => {
  console.error('HTTP Module startup failed:', error);
  process.exit(1);
});

// Error handling for production
process.on('uncaughtException', (error) => {
  console.error('❌ HTTP Module - Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ HTTP Module - Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down HTTP Module gracefully...');
  process.exit(0);
});