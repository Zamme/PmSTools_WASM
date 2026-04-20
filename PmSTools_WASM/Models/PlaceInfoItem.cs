namespace PmSTools_WASM.Models;

public sealed class PlaceInfoItem
{
    public string? Name { get; set; }
    public string? Street { get; set; }
    public string? StreetName { get; set; }
    public string? StreetNumber { get; set; }
    public string? PostalCode { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public void EnsureStreetParts()
    {
        if (!string.IsNullOrWhiteSpace(StreetName) || !string.IsNullOrWhiteSpace(StreetNumber))
        {
            return;
        }

        var (name, number) = SplitStreetParts(Street);
        StreetName = name;
        StreetNumber = number;
    }

    public string BuildDisplayName()
    {
        var street = CombineStreet(StreetName, StreetNumber);
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(Name))
        {
            parts.Add(Name.Trim());
        }

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

        return string.Join(" - ", parts.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    public string BuildSearchAddress()
    {
        var street = CombineStreet(StreetName, StreetNumber);
        var parts = new List<string>
        {
            street,
            PostalCode,
            City,
            Country
        };

        return string.Join(" ", parts.Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim()));
    }

    private static (string Name, string Number) SplitStreetParts(string? street)
    {
        if (string.IsNullOrWhiteSpace(street))
        {
            return (string.Empty, string.Empty);
        }

        var normalized = System.Text.RegularExpressions.Regex.Replace(street.Trim(), @"\s+", " ");
        var match = System.Text.RegularExpressions.Regex.Match(
            normalized,
            @"^(?<name>.+?)\s+(?<number>\d{1,5}[A-Za-z]?)\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            return (normalized, string.Empty);
        }

        return (match.Groups["name"].Value.Trim(), match.Groups["number"].Value.Trim());
    }

    private static string CombineStreet(string? streetName, string? streetNumber)
    {
        var name = (streetName ?? string.Empty).Trim();
        var number = (streetNumber ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(number))
        {
            return string.Empty;
        }

        return string.Join(" ", new[] { name, number }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }
}
