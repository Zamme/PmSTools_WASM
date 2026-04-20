namespace PmSTools_WASM.Models;

public sealed class DeliveryRouteStop
{
    public int Order { get; set; }
    public bool IsFirst { get; set; }
    public bool IsLast { get; set; }

    public string? Name { get; set; }
    public string? StreetName { get; set; }
    public string? StreetNumber { get; set; }
    public string? PostalCode { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string BuildAddressLine()
    {
        var street = string.Join(" ", new[] { StreetName, StreetNumber }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));

        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(street))
        {
            parts.Add(street);
        }

        if (!string.IsNullOrWhiteSpace(PostalCode))
        {
            parts.Add(PostalCode!.Trim());
        }

        if (!string.IsNullOrWhiteSpace(City))
        {
            parts.Add(City!.Trim());
        }

        if (!string.IsNullOrWhiteSpace(Country))
        {
            parts.Add(Country!.Trim());
        }

        if (parts.Count == 0 && !string.IsNullOrWhiteSpace(Name))
        {
            parts.Add(Name!.Trim());
        }

        return string.Join(" ", parts.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    public void ClearCoordinates()
    {
        Latitude = null;
        Longitude = null;
    }
}
