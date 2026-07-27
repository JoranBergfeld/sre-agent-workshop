using System.Net;
using System.Net.Http.Json;

namespace HandoverApp.Tests;

public sealed class EndpointTests(HandoverAppFactory factory)
    : IClassFixture<HandoverAppFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await client.GetAsync("/health");
        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("healthy", payload?.Status);
    }

    [Fact]
    public async Task Feature_documents_the_initial_unfinished_state()
    {
        var response = await client.PostAsync("/api/feature", content: null);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Home_renders_the_handover_button()
    {
        var html = await client.GetStringAsync("/");

        Assert.Contains("Run unfinished feature", html);
        Assert.Contains("SRE Agent to Copilot", html);
    }

    private sealed record HealthResponse(string Status);
}
