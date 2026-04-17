namespace PmSTools_WASM.Models;

public sealed class BarcodeEntry
{
    public BarcodeEntry(string code, bool isSaved)
    {
        Id = Guid.NewGuid().ToString("N");
        Code = code;
        IsSaved = isSaved;
        IsEditing = false;
        EditValue = code;
    }

    public string Id { get; }
    public string Code { get; set; }
    public bool IsSaved { get; set; }
    public bool IsEditing { get; set; }
    public string EditValue { get; set; }
}
