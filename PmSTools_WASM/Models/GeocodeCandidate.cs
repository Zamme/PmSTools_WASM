namespace PmSTools_WASM.Models;

public sealed class GeocodeCandidate
{
    public string DisplayName { get; set; } = string.Empty;
    public string? StreetName { get; set; }
    public string? StreetNumber { get; set; }
    public string? PostalCode { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public string BuildShortLabel()
    {
        var parts = new List<string>();

        var street = string.Join(" ", new[] { StreetName, StreetNumber }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        if (!string.IsNullOrWhiteSpace(street))
        {
            parts.Add(street);
        }

        var cityLine = string.Join(" ", new[] { PostalCode, City }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        if (!string.IsNullOrWhiteSpace(cityLine))
        {
            parts.Add(cityLine);
        }

        if (!string.IsNullOrWhiteSpace(Country))
        {
            parts.Add(Country!.Trim());
        }

        return parts.Count == 0 ? DisplayName : string.Join(" - ", parts);
    }
}
