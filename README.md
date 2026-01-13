# Sleeping Beauty Mechanism Viewer

Static web viewer for qualitative research on Sleeping Beauty posts in the AsthmaUK Online Health Community.

## Features

- Password-protected access (AES encryption)
- Overview statistics and charts
- Case browser with detailed post content
- Awakening mechanism analysis
- New commenter activity tracing

## Deployment

### GitHub Pages

1. Create a new GitHub repository
2. Push all files to the `main` branch
3. Go to Settings > Pages
4. Set Source to "Deploy from a branch" > `main` > `/ (root)`
5. Share the URL and password with colleagues

### Local Testing

```bash
# Simple HTTP server
python -m http.server 8000
# Then open http://localhost:8000
```

## Data Update

To regenerate data from the lurking project:

```bash
python convert_data.py --password "YOUR_PASSWORD"
```

## Files

- `index.html` - Main page structure
- `app.js` - Application logic and decryption
- `styles.css` - Styling
- `convert_data.py` - Data export script
- `data/metadata.json` - Public case overview
- `data/cases.encrypted` - Encrypted case data
- `data/encryption_config.json` - Encryption parameters

## Security Note

The data has been anonymized (User IDs simplified). The encryption provides an additional layer of access control for research purposes.
