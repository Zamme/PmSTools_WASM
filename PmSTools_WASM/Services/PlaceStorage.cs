using PmSTools_WASM.Models;

namespace PmSTools_WASM.Services;

public sealed class PlaceStorage
{
    private const string LastPlaceKey = "pmstools.places.last";
    private const string RecentPlacesKey = "pmstools.places.recent";
    private const string RoutesKey = "pmstools.routes";
    private const int MaxRecentPlaces = 20;

    private readonly LocalStorageService _storage;

    public PlaceStorage(LocalStorageService storage)
    {
        _storage = storage;
    }

    public Task<PlaceInfoItem?> GetLastPlaceAsync()
    {
        return _storage.GetItemAsync<PlaceInfoItem>(LastPlaceKey);
    }

    public async Task SaveLastPlaceAsync(PlaceInfoItem place)
    {
        await _storage.SetItemAsync(LastPlaceKey, place);
        await UpdateRecentPlacesAsync(place);
    }

    public async Task<List<PlaceInfoItem>> GetRecentPlacesAsync()
    {
        var places = await _storage.GetItemAsync<List<PlaceInfoItem>>(RecentPlacesKey);
        return places ?? new List<PlaceInfoItem>();
    }

    public async Task RemoveRecentPlaceAsync(PlaceInfoItem place)
    {
        var places = await GetRecentPlacesAsync();
        var key = BuildPlaceKey(place);
        places.RemoveAll(item => string.Equals(BuildPlaceKey(item), key, StringComparison.OrdinalIgnoreCase));
        await _storage.SetItemAsync(RecentPlacesKey, places);
    }

    public Task ClearRecentPlacesAsync()
    {
        return _storage.SetItemAsync(RecentPlacesKey, new List<PlaceInfoItem>());
    }

    public async Task<List<DeliveryRoute>> GetRoutesAsync()
    {
        var routes = await _storage.GetItemAsync<List<DeliveryRoute>>(RoutesKey);
        return routes ?? new List<DeliveryRoute>();
    }

    public Task SaveRoutesAsync(List<DeliveryRoute> routes)
    {
        return _storage.SetItemAsync(RoutesKey, routes);
    }

    private async Task UpdateRecentPlacesAsync(PlaceInfoItem place)
    {
        var places = await GetRecentPlacesAsync();
        var key = BuildPlaceKey(place);
        places.RemoveAll(item => string.Equals(BuildPlaceKey(item), key, StringComparison.OrdinalIgnoreCase));
        places.Insert(0, place);

        if (places.Count > MaxRecentPlaces)
        {
            places = places.Take(MaxRecentPlaces).ToList();
        }

        await _storage.SetItemAsync(RecentPlacesKey, places);
    }

    private static string BuildPlaceKey(PlaceInfoItem place)
    {
        var parts = new[]
        {
            place.Name,
            place.StreetName,
            place.StreetNumber,
            place.PostalCode,
            place.City,
            place.Country
        };

        return string.Join("|", parts.Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim().ToUpperInvariant()));
    }
}
