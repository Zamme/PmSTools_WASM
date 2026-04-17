using System.Diagnostics;

namespace PmSTools_WASM.Services;

public sealed class BarcodeParser
{
    public List<string> ParseCodes(string input, IEnumerable<string> prefixes)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return new List<string>();
        }

        var prefixList = prefixes
            .Where(prefix => !string.IsNullOrWhiteSpace(prefix))
            .Select(prefix => prefix.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (prefixList.Count == 0)
        {
            return new List<string>();
        }

        var results = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var parts = input.Split(new[] { ' ', '\n', '\r', '\t' }, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

        foreach (var part in parts)
        {
            var upperText = part.ToUpperInvariant();
            var normalized = upperText.Replace("O", "0");

            if (normalized.Length == 22 && TryAppendDniLikeControl(normalized, out var withControl))
            {
                LogDniControlAppended(normalized, withControl);
                normalized = withControl;
                upperText = withControl;
            }

            var isShortCode = normalized.Length == 13;
            var isLongCode = normalized.Length == 23;
            var isLongNoControlCode = normalized.Length == 22;
            if (!isShortCode && !isLongCode && !isLongNoControlCode)
            {
                LogRejected(normalized, $"invalid length ({normalized.Length})");
                continue;
            }

            var startsWithTwoLetters = upperText.Length >= 2 && char.IsLetter(upperText[0]) && char.IsLetter(upperText[1]);
            var startsWith90 = normalized.StartsWith("90", StringComparison.OrdinalIgnoreCase);

            if (isShortCode && !startsWithTwoLetters)
            {
                LogRejected(normalized, "13-char code does not start with two letters");
                continue;
            }

            if ((isLongCode || isLongNoControlCode) && !startsWithTwoLetters && !startsWith90)
            {
                LogRejected(normalized, "long code does not start with two letters or 90");
                continue;
            }

            var matchesPrefix = false;
            foreach (var prefix in prefixList)
            {
                if (normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    matchesPrefix = true;
                    if (seen.Add(normalized))
                    {
                        results.Add(normalized);
                    }
                    break;
                }
            }

            if (!matchesPrefix)
            {
                LogRejected(normalized, "no matching prefix");
            }
        }

        return results;
    }

    private static bool TryAppendDniLikeControl(string dataPart, out string codeWithControl)
    {
        codeWithControl = dataPart;
        if (dataPart.Length != 22)
        {
            return false;
        }

        if (!TryGetDniLikeControlCharacter(dataPart, out var control))
        {
            return false;
        }

        codeWithControl = dataPart + control;
        return true;
    }

    private static bool TryGetDniLikeControlCharacter(string dataPart, out char control)
    {
        control = '\0';

        var hasAtLeastOneDigit = false;
        var remainder = 0;
        foreach (var currentChar in dataPart)
        {
            if (char.IsDigit(currentChar))
            {
                hasAtLeastOneDigit = true;
                remainder = (remainder * 10 + (currentChar - '0')) % 23;
                continue;
            }

            if (!char.IsLetter(currentChar))
            {
                return false;
            }
        }

        if (!hasAtLeastOneDigit)
        {
            return false;
        }

        const string dniLetters = "TRWAGMYFPDXBNJZSQVHLCKE";
        control = dniLetters[remainder];
        return true;
    }

    [Conditional("DEBUG")]
    private static void LogRejected(string value, string reason)
    {
        Debug.WriteLine($"[BarcodeParser] Rejected '{value}': {reason}");
    }

    [Conditional("DEBUG")]
    private static void LogDniControlAppended(string originalValue, string normalizedValue)
    {
        Debug.WriteLine($"[BarcodeParser] Appended DNI-like control: '{originalValue}' -> '{normalizedValue}'");
    }
}
