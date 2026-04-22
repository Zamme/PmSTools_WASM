using System.Diagnostics;
using System.Text.RegularExpressions;

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
        var upperInput = input.ToUpperInvariant();
        var matches = Regex.Matches(upperInput, "[A-Z0-9]+");

        foreach (Match match in matches)
        {
            var cleaned = match.Value;
            var normalized = cleaned.Replace("O", "0");

            if (normalized.Length == 22 && TryAppendDniLikeControl(normalized, out var withControl))
            {
                LogDniControlAppended(normalized, withControl);
                normalized = withControl;
                cleaned = withControl;
            }

            TryAddCandidate(normalized, cleaned, prefixList, results, seen);
        }

        var lines = upperInput.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
            var lineMatches = Regex.Matches(line, "[A-Z0-9]+");
            if (lineMatches.Count < 2)
            {
                continue;
            }

            for (var i = 0; i < lineMatches.Count - 1; i++)
            {
                var left = lineMatches[i].Value;
                var right = lineMatches[i + 1].Value;
                var combined = (left + right).Replace("O", "0");
                TryAddCandidate(combined, combined, prefixList, results, seen);
            }
        }

        return results;
    }

    private static void TryAddCandidate(string normalized, string cleaned, List<string> prefixList, List<string> results, HashSet<string> seen)
    {
        var isShortCode = normalized.Length == 13;
        var isLongCode = normalized.Length == 23;
        var isLongNoControlCode = normalized.Length == 22;
        if (!isShortCode && !isLongCode && !isLongNoControlCode)
        {
            LogRejected(normalized, $"invalid length ({normalized.Length})");
            return;
        }

        var startsWithTwoLetters = cleaned.Length >= 2 && char.IsLetter(cleaned[0]) && char.IsLetter(cleaned[1]);
        var startsWith90 = normalized.StartsWith("90", StringComparison.OrdinalIgnoreCase);

        if (isShortCode && !startsWithTwoLetters)
        {
            LogRejected(normalized, "13-char code does not start with two letters");
            return;
        }

        if ((isLongCode || isLongNoControlCode) && !startsWithTwoLetters && !startsWith90)
        {
            LogRejected(normalized, "long code does not start with two letters or 90");
            return;
        }

        foreach (var prefix in prefixList)
        {
            if (normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                if (seen.Add(normalized))
                {
                    results.Add(normalized);
                }
                return;
            }
        }

        LogRejected(normalized, "no matching prefix");
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
