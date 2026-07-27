using HandoverApp.Components;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddProblemDetails();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await Results.Problem(
            statusCode: StatusCodes.Status500InternalServerError,
            title: "The feature is not implemented yet.")
            .ExecuteAsync(context);
    });
});

app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();
app.UseAntiforgery();

app.MapStaticAssets();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));
app.MapPost("/api/feature", HandleFeature);
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();

static IResult HandleFeature(ILogger<Program> logger)
{
    logger.LogError("POST /api/feature is not implemented");
    throw new NotImplementedException(
        "Implement POST /api/feature and return the documented success response.");
}

public partial class Program;
