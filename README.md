# Sleeping Beauty Mechanism Viewer

Static web viewer for qualitative research on Sleeping Beauty posts in the AsthmaUK Online Health Community.

## Features

- Password-protected access (AES encryption)
- Overview statistics and charts
- Case browser with detailed post content
- Awakening mechanism analysis
- New commenter activity tracing

## Deployment

### Current Deployment

- **Live URL**: https://xianchengli.github.io/Sleeping_beauty_viewer/
- **GitHub Repo**: https://github.com/XianchengLI/Sleeping_beauty_viewer
- **Local Clone**: `C:\Users\Xianc\Documents\Sleeping_beauty_viewer`
- **Password**: `ASTHMAPOSTS`

### How to Deploy Updates

```bash
# 1. Copy updated files to deployment repo
Copy-Item -Path "sb-viewer\*" -Destination "C:\Users\Xianc\Documents\Sleeping_beauty_viewer\" -Recurse -Force

# 2. Commit and push
cd C:\Users\Xianc\Documents\Sleeping_beauty_viewer
git add .
git commit -m "Update viewer"
git push origin main
```

### New GitHub Pages Setup (if needed)

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
- `convert_data.py` - Data export script (Day dedup)
- `convert_hourly_data.py` - Data export script (Hour dedup)
- `data/metadata.json` - Public case overview (Day dedup)
- `data/cases.encrypted` - Encrypted case data (Day dedup)
- `data/hourly_metadata.json` - Public case overview (Hour dedup)
- `data/hourly_cases.encrypted` - Encrypted case data (Hour dedup)
- `data/hourly_top20.json` - Top 20 summary (Hour dedup)
- `data/late_awakening_*.json` - 3-Year window data
- `data/encryption_config.json` - Encryption parameters

## Security Note

The data has been anonymized (User IDs simplified). The encryption provides an additional layer of access control for research purposes.
