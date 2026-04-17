using System.Text.Json;
using Microsoft.JSInterop;

namespace PmSTools_WASM.Services;

public sealed class LocalStorageService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly IJSRuntime _jsRuntime;

    public LocalStorageService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async Task<T?> GetItemAsync<T>(string key)
    {
        var json = await _jsRuntime.InvokeAsync<string>("localStorage.getItem", key);
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    public Task SetItemAsync<T>(string key, T value)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        return _jsRuntime.InvokeVoidAsync("localStorage.setItem", key, json).AsTask();
    }

    public Task RemoveItemAsync(string key)
    {
        return _jsRuntime.InvokeVoidAsync("localStorage.removeItem", key).AsTask();
    }
}
