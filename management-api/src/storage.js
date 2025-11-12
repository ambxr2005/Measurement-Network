const fs = require('fs').promises;
const path = require('path');

class JSONStorage {
  constructor() {
    this.storageDir = './data';
    this.resultsFile = path.join(this.storageDir, 'measurements.json');
    this.init();
  }

  async init() {
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(this.storageDir, { recursive: true });
      
      // Create empty results file if it doesn't exist
      try {
        await fs.access(this.resultsFile);
      } catch {
        await fs.writeFile(this.resultsFile, JSON.stringify([], null, 2));
        console.log('✅ Storage initialized: measurements.json created');
      }
    } catch (error) {
      console.error('❌ Storage initialization failed:', error);
    }
  }

  async saveMeasurement(result) {
    try {
      // Read existing data
      const data = await this.loadAll();
      
      // Add new result with metadata
      const measurement = {
        ...result,
        _persisted: true,
        _savedAt: new Date().toISOString(),
        _id: `meas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Add to beginning of array (newest first)
      data.unshift(measurement);
      
      // Keep only last 1000 records to prevent file from growing too large
      const trimmedData = data.slice(0, 1000);
      
      // Write back to file
      await fs.writeFile(this.resultsFile, JSON.stringify(trimmedData, null, 2));
      
      console.log(`💾 Measurement saved: ${result.jobId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save measurement:', error);
      return false;
    }
  }

  async loadAll() {
    try {
      const data = await fs.readFile(this.resultsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Failed to load measurements:', error);
      return [];
    }
  }

  async getByJobId(jobId) {
    const data = await this.loadAll();
    return data.find(item => item.jobId === jobId);
  }

  async getByType(type, limit = 50) {
    const data = await this.loadAll();
    return data
      .filter(item => item.type === type)
      .slice(0, limit);
  }

  async getRecent(limit = 100) {
    const data = await this.loadAll();
    return data.slice(0, limit);
  }

  async exportToFile(filename = `measurements_export_${Date.now()}.json`) {
    try {
      const data = await this.loadAll();
      const exportPath = path.join(this.storageDir, filename);
      await fs.writeFile(exportPath, JSON.stringify(data, null, 2));
      console.log(`📤 Export created: ${exportPath}`);
      return exportPath;
    } catch (error) {
      console.error('❌ Export failed:', error);
      return null;
    }
  }

  async getStats() {
    const data = await this.loadAll();
    const stats = {
      total: data.length,
      byType: {},
      successRate: 0,
      oldest: data[data.length - 1]?.timestamp || null,
      newest: data[0]?.timestamp || null
    };

    data.forEach(item => {
      if (!stats.byType[item.type]) {
        stats.byType[item.type] = { count: 0, success: 0 };
      }
      stats.byType[item.type].count++;
      if (item.result?.success) {
        stats.byType[item.type].success++;
      }
    });

    // Calculate success rate
    const successful = data.filter(item => item.result?.success).length;
    stats.successRate = data.length > 0 ? (successful / data.length * 100).toFixed(2) : 0;

    return stats;
  }
}

module.exports = JSONStorage;