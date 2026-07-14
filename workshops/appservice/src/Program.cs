using Microsoft.Data.SqlClient;
using Shop.Models;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

var connectionString = Environment.GetEnvironmentVariable("AZURE_SQL_CONNECTIONSTRING") ?? "";

// Shared catalog query — both / and /products read through this one statement.
const string ProductsQuery = "SELECT Id, Name, Price FROM dbo.Products ORDER BY Id";

// Release theme — visible A/B marker (v1 stable green / v2 canary red).
const string Accent = "#1a7f37";      // v1 green
const string BadgeText = "v1 · stable";

// Health check — intentionally does NOT verify DB connectivity (liveness only)
app.MapGet("/health", () => Results.Json(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Landing page — themed shop that lists the catalog and degrades gracefully (always HTTP 200)
app.MapGet("/", async () =>
{
    string statusLine;
    string catalogHtml;
    if (string.IsNullOrEmpty(connectionString))
    {
        statusLine = "<span style='color:#b3261e'>● Azure SQL: not configured</span>";
        catalogHtml = "";
    }
    else
    {
        try
        {
            var products = new List<Product>();
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(ProductsQuery, conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                products.Add(new Product(reader.GetInt32(0), reader.GetString(1), reader.GetDecimal(2)));
            }
            statusLine = "<span style='color:#1a7f37'>● Azure SQL: connected</span>";
            catalogHtml = string.Join("\n", products.Select(p =>
                $"<div style='display:flex;justify-content:space-between;border:1px solid #eee;border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:13px'><span>{p.Name}</span><strong>${p.Price:0.00}</strong></div>"));
        }
        catch (Exception ex)
        {
            statusLine = "<span style='color:#b3261e'>● Catalog failed to load</span>";
            catalogHtml = $"<div style='border:1px dashed #b3261e;background:#fff5f5;color:#b3261e;border-radius:8px;padding:12px;font-size:12px'>Failed to read products from Azure SQL — {ex.Message}</div>";
        }
    }

    var html = $"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Workshop Shop</title></head>
        <body style="font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;color:#1a1a1a">
          <div style="max-width:420px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #ececec">
              <strong>🛍️ Workshop Shop</strong>
              <span style="border:1px solid {Accent};color:{Accent};border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700">{BadgeText}</span>
            </div>
            <div style="padding:14px 16px">
              <div style="font-size:12px;margin-bottom:12px;font-weight:600">{statusLine}</div>
              {catalogHtml}
              <button style="margin-top:14px;width:100%;background:{Accent};color:#fff;border:none;border-radius:8px;padding:11px;font-weight:700;font-size:13px">Add to cart</button>
            </div>
          </div>
        </body>
        </html>
        """;
    return Results.Content(html, "text/html");
});

// Catalog — reads Products from Azure SQL via the managed identity
app.MapGet("/products", async (ILogger<Program> logger) =>
{
    if (string.IsNullOrEmpty(connectionString))
    {
        return Results.Json(new { error = "AZURE_SQL_CONNECTIONSTRING is not set" }, statusCode: 500);
    }

    try
    {
        var products = new List<Product>();
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync();
        await using var cmd = new SqlCommand(ProductsQuery, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            products.Add(new Product(reader.GetInt32(0), reader.GetString(1), reader.GetDecimal(2)));
        }
        return Results.Json(products);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to read products from Azure SQL");
        return Results.Json(new { error = $"Failed to connect to Azure SQL: {ex.Message}" }, statusCode: 500);
    }
});

// ── Red Button demo (red-button-500 scenario) ─────────────────────────────
// A deliberately minimal two-button page. The green button always works; the red
// button ships a broken feature that returns HTTP 500. RED_BUTTON_MODE is an
// operational kill-switch (unset ⇒ broken). The durable fix removes the broken branch.
const string RedButtonPage = """
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Red Button Demo</title></head>
    <body style="font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;color:#1a1a1a">
      <div style="max-width:420px;margin:48px auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08);text-align:center">
        <h1 style="font-size:18px;margin:0 0 6px">Red Button Demo</h1>
        <p style="font-size:13px;color:#555;margin:0 0 20px">Green works. Red returns HTTP 500.</p>
        <button id="green" style="background:#1a7f37;color:#fff;border:none;border-radius:8px;padding:12px 20px;font-weight:700;font-size:14px;cursor:pointer;margin:4px">Green</button>
        <button id="red" style="background:#b3261e;color:#fff;border:none;border-radius:8px;padding:12px 20px;font-weight:700;font-size:14px;cursor:pointer;margin:4px">Red</button>
        <p id="result" style="font-size:13px;margin-top:20px;min-height:18px"></p>
      </div>
      <script>
        async function press(path) {
          const el = document.getElementById('result');
          el.textContent = 'GET ' + path + ' …';
          try {
            const r = await fetch(path);
            el.textContent = 'GET ' + path + ' → ' + r.status + ' ' + r.statusText;
            el.style.color = r.ok ? '#1a7f37' : '#b3261e';
          } catch (e) {
            el.textContent = 'GET ' + path + ' → network error';
            el.style.color = '#b3261e';
          }
        }
        document.getElementById('green').onclick = () => press('/api/green');
        document.getElementById('red').onclick = () => press('/api/red');
      </script>
    </body>
    </html>
    """;

app.MapGet("/demo", () => Results.Content(RedButtonPage, "text/html"));

app.MapGet("/api/green", () => Results.Json(new { status = "ok", button = "green" }));

app.MapGet("/api/red", (ILogger<Program> logger) =>
{
    var mode = Environment.GetEnvironmentVariable("RED_BUTTON_MODE") ?? "broken";
    if (mode == "broken")
    {
        logger.LogError("Red button pressed — /api/red is broken, returning HTTP 500");
        return Results.Json(new { error = "The red button is broken" }, statusCode: 500);
    }
    return Results.Json(new { status = "ok", button = "red" });
});

app.Run();
