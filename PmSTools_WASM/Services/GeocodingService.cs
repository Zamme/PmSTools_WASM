using System.Globalization;
using System.Text.Json;
using PmSTools_WASM.Models;

namespace PmSTools_WASM.Services;

public sealed class GeocodingService
{
    private readonly HttpClient _http;

    public GeocodingService(HttpClient http)
    {
        _http = http;
    }

    public async Task<List<GeocodeCandidate>> SearchAsync(PlaceInfoItem place)
    {
        var queries = BuildQueries(place);
        return await SearchAsync(queries);
    }

    public async Task<GeocodeCandidate?> GeocodeStopAsync(DeliveryRouteStop stop)
    {
        var queries = BuildQueries(stop);
        var results = await SearchAsync(queries);
        return results.FirstOrDefault();
    }

    public List<string> BuildQueries(PlaceInfoItem place)
    {
        var street = string.Join(" ", new[] { place.StreetName, place.StreetNumber }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        var cityLine = string.Join(" ", new[] { place.PostalCode, place.City }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        var country = string.IsNullOrWhiteSpace(place.Country) ? "Spain" : place.Country.Trim();

        return BuildQueryList(street, cityLine, country, place.Name);
    }

    public List<string> BuildQueries(DeliveryRouteStop stop)
    {
        var street = string.Join(" ", new[] { stop.StreetName, stop.StreetNumber }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        var cityLine = string.Join(" ", new[] { stop.PostalCode, stop.City }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        var country = string.IsNullOrWhiteSpace(stop.Country) ? "Spain" : stop.Country.Trim();
        return BuildQueryList(street, cityLine, country, stop.Name);
    }

    private static List<string> BuildQueryList(string street, string cityLine, string country, string? name)
    {
        var queries = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(params string[] parts)
        {
            var query = string.Join(" ", parts
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!.Trim()));

            if (string.IsNullOrWhiteSpace(query))
            {
                return;
            }

            if (seen.Add(query))
            {
                queries.Add(query);
            }
        }

        Add(street, cityLine, country);
        Add(street, cityLine);
        Add(street, country);
        Add(cityLine, country);
        Add(cityLine);
        Add(name ?? string.Empty, cityLine, country);
        return queries;
    }

    private async Task<List<GeocodeCandidate>> SearchAsync(IEnumerable<string> queries)
    {
        var results = new List<GeocodeCandidate>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var query in queries.Where(q => !string.IsNullOrWhiteSpace(q)))
        {
            var url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=" +
                      Uri.EscapeDataString(query);

            using var response = await _http.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                continue;
            }

            var json = await response.Content.ReadAsStringAsync();
            if (string.IsNullOrWhiteSpace(json))
            {
                continue;
            }

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (!item.TryGetProperty("display_name", out var displayProp))
                {
                    continue;
                }

                var display = displayProp.GetString() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(display) || !seen.Add(display))
                {
                    continue;
                }

                if (!item.TryGetProperty("lat", out var latProp) || !item.TryGetProperty("lon", out var lonProp))
                {
                    continue;
                }

                if (!double.TryParse(latProp.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lat))
                {
                    continue;
                }

                if (!double.TryParse(lonProp.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lon))
                {
                    continue;
                }

                var candidate = new GeocodeCandidate
                {
                    DisplayName = display,
                    Latitude = lat,
                    Longitude = lon
                };

                if (item.TryGetProperty("address", out var addressProp))
                {
                    if (addressProp.TryGetProperty("road", out var roadProp))
                    {
                        candidate.StreetName = roadProp.GetString();
                    }

                    if (addressProp.TryGetProperty("house_number", out var numberProp))
                    {
                        candidate.StreetNumber = numberProp.GetString();
                    }

                    if (addressProp.TryGetProperty("postcode", out var postalProp))
                    {
                        candidate.PostalCode = postalProp.GetString();
                    }

                    if (addressProp.TryGetProperty("city", out var cityProp))
                    {
                        candidate.City = cityProp.GetString();
                    }
                    else if (addressProp.TryGetProperty("town", out var townProp))
                    {
                        candidate.City = townProp.GetString();
                    }

                    if (addressProp.TryGetProperty("country", out var countryProp))
                    {
                        candidate.Country = countryProp.GetString();
                    }
                }

                results.Add(candidate);
            }

            if (results.Count >= 5)
            {
                break;
            }
        }

        return results;
    }
}
