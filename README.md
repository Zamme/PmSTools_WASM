# PmSTools WASM

[![Deploy Blazor WASM to GitHub Pages](https://github.com/Zamme/PmSTools_WASM/actions/workflows/gh-pages.yml/badge.svg)](https://github.com/Zamme/PmSTools_WASM/actions/workflows/gh-pages.yml)

Live site: https://zamme.github.io/PmSTools_WASM/

## About
PmSTools reimagined for the web using Blazor WebAssembly. This version focuses on the Code2Barcode flow with OCR, prefix filtering, and saved barcodes.

## Features
- Camera OCR in-browser (best effort, depends on permissions)
- Image upload OCR for labels and documents
- Prefix-based code filtering
- Code editing and validation flow
- Barcode rendering with Code39
- Local saved codes library (browser storage)

## Development

```bash
dotnet watch --project PmSTools_WASM/PmSTools_WASM.csproj run
```

## Deployment
GitHub Pages deployment is handled by the workflow in `.github/workflows/gh-pages.yml`.
