using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using PmSTools_WASM;
using PmSTools_WASM.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddScoped<LocalStorageService>();
builder.Services.AddScoped<BarcodeStorage>();
builder.Services.AddScoped<BarcodeParser>();
builder.Services.AddScoped<AddressParser>();
builder.Services.AddScoped<GeocodingService>();
builder.Services.AddScoped<PlaceStorage>();

await builder.Build().RunAsync();
