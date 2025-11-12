const { connect } = require('nats');
const express = require('express');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');

class AnchorService {
  constructor() {
    this.modules = new Map();
    this.natsConnection = null;
    this.healthStatus = new Map();
    this.app = express();
    this.rfcCompliance = {
      'RFC2330': 'Framework for IP Performance Metrics',
      'RFC4656': 'One-way Active Measurement Protocol (OWAMP)',
      'RFC5357': 'Two-way Active Measurement Protocol (TWAMP)', 
      'RFC8762': 'Simple Two-way Active Measurement Protocol (STAMP)',
      'RFC7679': 'One-way Delay Metric',
      'RFC2681': 'Round-trip Delay Metric',
      'RFC7680': 'Packet Loss Metric',
      'RFC8259': 'JSON Data Interchange Format',
      'RFC7519': 'JSON Web Token (JWT)',
      'RFC5905': 'Network Time Protocol (NTP)',
      'RFC1035': 'Domain Names - DNS Specification',
      'RFC2616': 'Hypertext Transfer Protocol (HTTP/1.1)'
    };
    
    this.setupExpress();
    this.setupWebSocket();
  }

  async start() {
    console.log('🚀 Starting Anchor Service...');
    
    await this.connectToNATS();
    await this.startHealthMonitoring();
    await this.startModuleDiscovery();
    
    this.app.listen(3000, () => {
      console.log('✅ Anchor Service running on port 3000');
    });
  }

  async connectToNATS() {
    try {
      const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
      this.natsConnection = await connect({ servers: natsUrl });
      console.log('✅ Connected to NATS');
      
      // Subscribe to module announcements
      const sub = this.natsConnection.subscribe('mmn.modules.announce');
      for await (const msg of sub) {
        this.handleModuleAnnouncement(JSON.parse(msg.data));
      }
    } catch (error) {
      console.error('❌ NATS connection failed:', error);
    }
  }

  handleModuleAnnouncement(moduleInfo) {
    console.log(`📢 RFC-COMPLIANT MODULE CONNECTED:`);
    console.log(`   🏷️  Name: ${moduleInfo.name}`);
    console.log(`   🔢 Version: ${moduleInfo.version}`);
    console.log(`   📊 Type: ${moduleInfo.type}`);
    
    // RFC Compliance logging
    if (moduleInfo.rfcCompliance && moduleInfo.rfcCompliance.length > 0) {
      console.log(`   📚 RFC COMPLIANCE:`);
      moduleInfo.rfcCompliance.forEach(rfc => {
        console.log(`      ✅ ${rfc} - ${this.rfcCompliance[rfc] || 'Internet Standard'}`);
      });
    }
    
    console.log(`   ⏰ Connected: ${new Date().toLocaleTimeString()}`);
    console.log(`   ─────────────────────────────────`);

    this.modules.set(moduleInfo.name, {
      ...moduleInfo,
      lastSeen: Date.now(),
      healthy: true,
      connectionTime: new Date().toISOString()
    });
    
    this.broadcastModuleUpdate();
    this.logModuleSummary();
  }

  logModuleSummary() {
    const totalModules = this.modules.size;
    const healthyModules = Array.from(this.modules.values()).filter(m => m.healthy).length;
    
    console.log(`\n📊 MODULE CONNECTION SUMMARY:`);
    console.log(`   🔗 Total Modules: ${totalModules}`);
    console.log(`   💚 Healthy: ${healthyModules}`);
    console.log(`   🔴 Unhealthy: ${totalModules - healthyModules}`);
    
    // RFC Compliance summary
    const allRFCs = new Set();
    this.modules.forEach(module => {
      if (module.rfcCompliance) {
        module.rfcCompliance.forEach(rfc => allRFCs.add(rfc));
      }
    });
    
    console.log(`   📚 Total RFC Standards: ${allRFCs.size}`);
    console.log(`   🎯 Implemented RFCs: ${Array.from(allRFCs).join(', ')}`);
    console.log(`────────────────────────────────────────────────────\n`);
  }

  async startHealthMonitoring() {
    setInterval(() => {
      const now = Date.now();
      let unhealthyCount = 0;
      
      this.modules.forEach((module, name) => {
        if (now - module.lastSeen > 30000) {
          if (module.healthy) {
            console.log(`⚠️  MODULE HEALTH ALERT: ${name}`);
            console.log(`   🔴 Status: UNHEALTHY - No heartbeat for 30s`);
            console.log(`   📚 RFC Compliance: ${module.rfcCompliance ? module.rfcCompliance.join(', ') : 'Not specified'}`);
            unhealthyCount++;
          }
          module.healthy = false;
        }
      });
      
      if (unhealthyCount > 0) {
        console.log(`🚨 TOTAL UNHEALTHY MODULES: ${unhealthyCount}`);
      }
      
      this.broadcastModuleUpdate();
    }, 10000);
  }

  async startModuleDiscovery() {
    // Watch for new modules in modules directory
    const watcher = chokidar.watch('/app/modules', {
      ignored: /node_modules/,
      persistent: true
    });

    watcher.on('add', (filePath) => {
      console.log(`🔍 Discovered new module: ${filePath}`);
    });
  }

  setupExpress() {
    this.app.use(express.json());
    
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        modules: this.modules.size,
        service: 'anchor-service'
      });
    });
    
    this.app.get('/modules', (req, res) => {
      const moduleList = Array.from(this.modules.values()).map(m => ({
        name: m.name,
        version: m.version,
        type: m.type,
        healthy: m.healthy,
        lastSeen: m.lastSeen,
        connectionTime: m.connectionTime,
        rfcCompliance: m.rfcCompliance || [],
        capabilities: m.capabilities || []
      }));
      res.json(moduleList);
    });
    
    // RFC Compliance endpoint
    this.app.get('/rfc-compliance', (req, res) => {
      const rfcSummary = {};
      
      this.modules.forEach(module => {
        if (module.rfcCompliance) {
          module.rfcCompliance.forEach(rfc => {
            if (!rfcSummary[rfc]) {
              rfcSummary[rfc] = {
                name: this.rfcCompliance[rfc] || 'Internet Standard',
                modules: []
              };
            }
            rfcSummary[rfc].modules.push(module.name);
          });
        }
      });
      
      res.json({
        totalRFCs: Object.keys(rfcSummary).length,
        totalModules: this.modules.size,
        rfcStandards: rfcSummary
      });
    });
    
    // Module connection statistics
    this.app.get('/module-stats', (req, res) => {
      const stats = {
        total: this.modules.size,
        healthy: Array.from(this.modules.values()).filter(m => m.healthy).length,
        byType: {},
        connectionTime: new Date().toISOString()
      };
      
      this.modules.forEach(module => {
        if (!stats.byType[module.type]) {
          stats.byType[module.type] = 0;
        }
        stats.byType[module.type]++;
      });
      
      res.json(stats);
    });
  }

  setupWebSocket() {
    const wss = new WebSocket.Server({ port: 8080 });
    
    wss.on('connection', (ws) => {
      console.log('🔗 New WebSocket connection');
      
      // Send current module list
      ws.send(JSON.stringify({
        type: 'module_update',
        data: Array.from(this.modules.values())
      }));
      
      ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
      });
    });
    
    this.wss = wss;
  }

  broadcastModuleUpdate() {
    if (!this.wss) return;
    
    const moduleList = Array.from(this.modules.values());
    const message = JSON.stringify({
      type: 'module_update',
      data: moduleList
    });
    
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Start the service
const anchor = new AnchorService();
anchor.start().catch(console.error);