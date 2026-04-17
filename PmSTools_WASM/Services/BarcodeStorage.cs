using PmSTools_WASM.Models;

namespace PmSTools_WASM.Services;

public sealed class BarcodeStorage
{
    private const string PrefixesKey = "pmstools.prefixes";
    private const string LastCodesKey = "pmstools.lastCodes";
    private const string SavedCodesKey = "pmstools.savedCodes";

    private static readonly string[] DefaultPrefixes =
    [
        "NV", "NT", "NE", "NA", "C1", "CD", "PK", "PQ", "PS", "90", "CX", "PH"
    ];

    private readonly LocalStorageService _storage;

    public BarcodeStorage(LocalStorageService storage)
    {
        _storage = storage;
    }

    public async Task<List<PrefixItem>> GetPrefixesAsync()
    {
        var prefixes = await _storage.GetItemAsync<List<PrefixItem>>(PrefixesKey);
        if (prefixes is { Count: > 0 })
        {
            return NormalizePrefixes(prefixes);
        }

        var defaults = DefaultPrefixes.Select(prefix => new PrefixItem(prefix, true)).ToList();
        await _storage.SetItemAsync(PrefixesKey, defaults);
        return defaults;
    }

    public Task SavePrefixesAsync(List<PrefixItem> prefixes)
    {
        return _storage.SetItemAsync(PrefixesKey, NormalizePrefixes(prefixes));
    }

    public async Task<List<string>> GetLastCodesAsync()
    {
        var codes = await _storage.GetItemAsync<List<string>>(LastCodesKey);
        return NormalizeCodes(codes);
    }

    public Task SaveLastCodesAsync(List<string> codes)
    {
        return _storage.SetItemAsync(LastCodesKey, NormalizeCodes(codes));
    }

    public async Task<List<string>> GetSavedCodesAsync()
    {
        var codes = await _storage.GetItemAsync<List<string>>(SavedCodesKey);
        return NormalizeCodes(codes);
    }

    public Task SaveSavedCodesAsync(List<string> codes)
    {
        return _storage.SetItemAsync(SavedCodesKey, NormalizeCodes(codes));
    }

    private static List<PrefixItem> NormalizePrefixes(IEnumerable<PrefixItem>? prefixes)
    {
        if (prefixes == null)
        {
            return new List<PrefixItem>();
        }

        var normalized = new List<PrefixItem>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var prefix in prefixes)
        {
            if (prefix == null)
            {
                continue;
            }

            var trimmed = (prefix.Value ?? string.Empty).Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                continue;
            }

            if (seen.Add(trimmed))
            {
                normalized.Add(new PrefixItem(trimmed, prefix.IsActive));
            }
        }

        return normalized;
    }

    private static List<string> NormalizeCodes(IEnumerable<string>? codes)
    {
        if (codes == null)
        {
            return new List<string>();
        }

        var normalized = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var code in codes)
        {
            var trimmed = (code ?? string.Empty).Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                continue;
            }

            if (seen.Add(trimmed))
            {
                normalized.Add(trimmed);
            }
        }

        return normalized;
    }
}
