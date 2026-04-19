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
        string? json = null;
        try
        {
            json = await _jsRuntime.InvokeAsync<string>("pmstools.storageGetItem", key);
        }
        catch (JSException)
        {
            return default;
        }

        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    public async Task SetItemAsync<T>(string key, T value)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        try
        {
            await _jsRuntime.InvokeVoidAsync("pmstools.storageSetItem", key, json);
        }
        catch (JSException)
        {
            // Storage might be unavailable (iOS private mode or restricted contexts).
        }
    }

    public async Task RemoveItemAsync(string key)
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("pmstools.storageRemoveItem", key);
        }
        catch (JSException)
        {
            // Storage might be unavailable (iOS private mode or restricted contexts).
        }
    }
}
