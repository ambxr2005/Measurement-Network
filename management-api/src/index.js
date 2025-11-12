const express = require("express");
const cors = require("cors");
const { connect } = require("nats");
const WebSocket = require("ws");
const path = require("path");
const JSONStorage = require("./storage");

const corsOptions = {
  origin: [
    "https://management-ui.up.railway.app",
    "http://localhost:5173",
    "https://your-app.vercel.app", // If using mixed approach
  ],
  credentials: true,
};

this.app.use(cors(corsOptions));

class ManagementAPI {
  constructor() {
    this.app = express();
    this.natsConnection = null;
    this.jobResults = [];
    this.storage = new JSONStorage(); // ✅ Storage initialized

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  async start() {
    await this.connectToNATS();
    this.startResultListener();

    this.app.listen(3001, () => {
      console.log("✅ Management API running on port 3001");
      console.log("💾 Storage system initialized");
    });
  }

  async connectToNATS() {
    try {
      const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
      this.natsConnection = await connect({ servers: natsUrl });
      console.log("✅ Management API connected to NATS");
    } catch (error) {
      console.error("❌ NATS connection failed:", error);
    }
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static("public"));
  }

  setupRoutes() {
    // Submit job to NATS
    this.app.post("/api/jobs", async (req, res) => {
      try {
        const job = {
          id: this.generateJobId(),
          type: req.body.type,
          target: req.body.target,
          timestamp: Date.now(),
          status: "submitted",
        };

        // Publish job to NATS
        await this.natsConnection.publish(
          "mmn.jobs.submit",
          JSON.stringify(job)
        );

        this.jobResults.push(job);
        res.json({ success: true, jobId: job.id });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get recent job results (from memory)
    this.app.get("/api/jobs", (req, res) => {
      res.json(this.jobResults.slice(-50).reverse());
    });

    // Error handling improve karo
    this.app.get("/api/modules", async (req, res) => {
      try {
        // Railway internal networking - service discovery
        const response = await axios.get("http://anchor-service:3000/modules");
        res.json(response.data);
      } catch (error) {
        console.error("Failed to fetch modules from anchor:", error.message);
        // Better fallback for production
        res.json([
          {
            name: "ping-module",
            healthy: false,
            type: "ping",
            status: "checking...",
          },
          {
            name: "dns-module",
            healthy: false,
            type: "dns",
            status: "checking...",
          },
        ]);
      }
    });

    // ✅ STORAGE ENDPOINTS

    // Get all stored measurements
    this.app.get("/api/measurements", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const measurements = await this.storage.getRecent(limit);
        res.json(measurements);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get measurements by type
    this.app.get("/api/measurements/:type", async (req, res) => {
      try {
        const { type } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const measurements = await this.storage.getByType(type, limit);
        res.json(measurements);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get storage statistics
    this.app.get("/api/storage/stats", async (req, res) => {
      try {
        const stats = await this.storage.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Export measurements to file
    this.app.post("/api/storage/export", async (req, res) => {
      try {
        const filename =
          req.body.filename || `measurements_export_${Date.now()}.json`;
        const exportPath = await this.storage.exportToFile(filename);

        if (exportPath) {
          res.json({
            success: true,
            message: "Export created successfully",
            filename: filename,
            path: exportPath,
          });
        } else {
          res.status(500).json({ success: false, error: "Export failed" });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Download exported file
    this.app.get("/api/storage/download/:filename", async (req, res) => {
      try {
        const { filename } = req.params;
        const filePath = path.join("./data", filename);

        // Security check - prevent directory traversal
        if (!filename.match(/^[a-zA-Z0-9_.-]+$/)) {
          return res.status(400).json({ error: "Invalid filename" });
        }

        res.download(filePath, filename, (err) => {
          if (err) {
            console.error("Download error:", err);
            res.status(404).json({ error: "File not found" });
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health check
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "management-api",
        storage: {
          enabled: true,
          records: this.jobResults.length,
        },
      });
    });
  }

  setupWebSocket() {
    const wss = new WebSocket.Server({ port: 8081 });

    wss.on("connection", (ws) => {
      console.log("🔗 Management WebSocket connected");

      // Send recent results
      ws.send(
        JSON.stringify({
          type: "initial_results",
          data: this.jobResults.slice(-20),
        })
      );
    });

    this.wss = wss;
  }

  startResultListener() {
    // Subscribe to job results
    const sub = this.natsConnection.subscribe("mmn.jobs.result.>");

    (async () => {
      for await (const msg of sub) {
        try {
          const result = JSON.parse(msg.data);

          // Update job in results
          const jobIndex = this.jobResults.findIndex(
            (j) => j.id === result.jobId
          );
          if (jobIndex !== -1) {
            this.jobResults[jobIndex] = {
              ...this.jobResults[jobIndex],
              ...result,
            };
          }

          // ✅ SAVE TO PERSISTENT STORAGE
          await this.storage.saveMeasurement(result);

          // Broadcast to WebSocket clients
          this.broadcastToWebSocket({
            type: "job_result",
            data: result,
          });

          console.log(`💾 Result stored for job: ${result.jobId}`);
        } catch (error) {
          console.error("❌ Error processing result:", error);
        }
      }
    })();
  }

  broadcastToWebSocket(message) {
    if (!this.wss) return;

    const messageStr = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Start the API
const api = new ManagementAPI();
api.start().catch(console.error);
