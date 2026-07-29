const express = require("express");
const { DefaultAzureCredential } = require("@azure/identity");
const { CosmosClient } = require("@azure/cosmos");

const app = express();
const PORT = process.env.PORT || 3000;

const COSMOSDB_ENDPOINT = process.env.COSMOSDB_ENDPOINT;
const DB_NAME = "workshop";
const CONTAINER_NAME = "items";

let cosmosClient;
if (COSMOSDB_ENDPOINT) {
  cosmosClient = new CosmosClient({
    endpoint: COSMOSDB_ENDPOINT,
    aadCredentials: new DefaultAzureCredential(),
  });
}

// Landing page
app.get("/", async (req, res) => {
  let dbStatus = "unknown";

  if (!cosmosClient) {
    dbStatus = "not configured (COSMOSDB_ENDPOINT not set)";
  } else {
    try {
      await cosmosClient.databases.readAll().fetchNext();
      dbStatus = "connected";
    } catch (err) {
      dbStatus = `disconnected — ${err.message}`;
    }
  }

  const podName = process.env.HOSTNAME || "unknown";
  const namespace = process.env.POD_NAMESPACE || "unknown";

  res.send(`<!DOCTYPE html>
<html>
<head><title>SRE Agent Workshop Demo</title></head>
<body>
  <h1>SRE Agent Workshop Demo</h1>
  <table>
    <tr><td><strong>CosmosDB Status</strong></td><td>${dbStatus}</td></tr>
    <tr><td><strong>Pod</strong></td><td>${podName}</td></tr>
    <tr><td><strong>Namespace</strong></td><td>${namespace}</td></tr>
  </table>
</body>
</html>`);
});

// Health check — intentionally does NOT verify DB connectivity
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Read items from CosmosDB
app.get("/items", async (req, res) => {
  if (!cosmosClient) {
    return res.status(500).json({
      error: "CosmosDB not configured — COSMOSDB_ENDPOINT is not set",
    });
  }

  try {
    const database = cosmosClient.database(DB_NAME);
    const container = database.container(CONTAINER_NAME);
    const { resources: items } = await container.items.readAll().fetchAll();
    res.json(items);
  } catch (err) {
    console.error("Failed to read items from CosmosDB:", err.message);
    res.status(500).json({
      error: `Failed to connect to CosmosDB: ${err.message}`,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
