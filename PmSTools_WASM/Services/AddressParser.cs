using System.Text.RegularExpressions;
using PmSTools_WASM.Models;

namespace PmSTools_WASM.Services;

public sealed class AddressParser
{
    private static readonly Regex PostalCodeRegex = new(@"\b(?<postal>\d{5})\b", RegexOptions.Compiled);
    private static readonly Regex StreetPrefixRegex = new(@"^(?:calle|c/|cl\.?|cr\.?|carrer|avenida|av\.?|avda\.?|plaza|pza\.?|passeig|paseo|ronda|rambla|carretera|camino)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex StreetNumberRegex = new(@"(?<number>\d{1,5}[A-Za-z]?)\b", RegexOptions.Compiled);

    public PlaceInfoItem Parse(string? ocrText)
    {
        var place = new PlaceInfoItem();
        if (string.IsNullOrWhiteSpace(ocrText))
        {
            return place;
        }

        var lines = ocrText
            .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();

        if (lines.Count == 0)
        {
            return place;
        }

        var postalIndex = -1;
        string? postalLine = null;

        for (var i = 0; i < lines.Count; i++)
        {
            if (PostalCodeRegex.IsMatch(lines[i]))
            {
                postalIndex = i;
                postalLine = lines[i];
                break;
            }
        }

        if (postalIndex >= 0 && postalLine != null)
        {
            var match = PostalCodeRegex.Match(postalLine);
            place.PostalCode = match.Groups["postal"].Value.Trim();

            var city = postalLine.Replace(match.Value, string.Empty).Trim('-', ' ', ',');
            if (string.IsNullOrWhiteSpace(city) && postalIndex + 1 < lines.Count)
            {
                city = lines[postalIndex + 1];
            }

            place.City = city;

            var streetLine = FindStreetLine(lines, postalIndex);
            if (!string.IsNullOrWhiteSpace(streetLine))
            {
                place.Street = streetLine;
            }

            if (postalIndex - 2 >= 0)
            {
                place.Name = lines[postalIndex - 2];
            }
            else if (postalIndex - 1 >= 0)
            {
                place.Name = lines[postalIndex - 1];
            }
        }
        else
        {
            place.Street = lines.FirstOrDefault();
            if (lines.Count > 1)
            {
                place.City = lines.LastOrDefault();
            }
        }

        place.Street ??= string.Empty;
        var (streetName, streetNumber) = SplitStreet(place.Street);
        place.StreetName = streetName;
        place.StreetNumber = streetNumber;

        return place;
    }

    private static string? FindStreetLine(List<string> lines, int postalIndex)
    {
        for (var offset = 1; offset <= 3; offset++)
        {
            var index = postalIndex - offset;
            if (index < 0)
            {
                break;
            }

            var candidate = lines[index];
            if (StreetPrefixRegex.IsMatch(candidate) || StreetNumberRegex.IsMatch(candidate))
            {
                return candidate;
            }
        }

        return postalIndex > 0 ? lines[postalIndex - 1] : null;
    }

    private static (string Name, string Number) SplitStreet(string? street)
    {
        if (string.IsNullOrWhiteSpace(street))
        {
            return (string.Empty, string.Empty);
        }

        var normalized = Regex.Replace(street.Trim(), @"\s+", " ");
        var match = Regex.Match(normalized, @"^(?<name>.+?)\s+(?<number>\d{1,5}[A-Za-z]?)\b", RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            return (normalized, string.Empty);
        }

        return (match.Groups["name"].Value.Trim(), match.Groups["number"].Value.Trim());
    }
}
