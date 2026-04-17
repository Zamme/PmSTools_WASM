namespace PmSTools_WASM.Models;

public sealed class PrefixItem
{
    public PrefixItem(string value, bool isActive)
    {
        Value = value;
        IsActive = isActive;
    }

    public string Value { get; set; }
    public bool IsActive { get; set; }
}
