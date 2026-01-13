# Deployment Notes

## Project Relationship

This viewer is deployed separately from the main analysis project.

### Source Project
- **Location**: `C:\Users\Xianc\Documents\lurking\sb-viewer\`
- **Purpose**: Development and data generation
- **Contains**: Source code + `convert_data.py` script

### Deployment Project (this repo)
- **Location**: `C:\Users\Xianc\Documents\Sleeping_beauty_viewer\`
- **Purpose**: GitHub Pages hosting
- **URL**: https://xianchengli.github.io/Sleeping_beauty_viewer/

## Update Workflow

When you need to update the viewer:

1. **Modify code** in `lurking/sb-viewer/`

2. **Regenerate encrypted data**:
   ```bash
   cd C:\Users\Xianc\Documents\lurking\sb-viewer
   python convert_data.py --password "ASTHMAPOSTS"
   ```

3. **Copy updated files** to deployment folder:
   ```bash
   # Copy all files except .git
   cp lurking/sb-viewer/*.html Sleeping_beauty_viewer/
   cp lurking/sb-viewer/*.js Sleeping_beauty_viewer/
   cp lurking/sb-viewer/*.css Sleeping_beauty_viewer/
   cp lurking/sb-viewer/data/* Sleeping_beauty_viewer/data/
   ```

4. **Push to GitHub**:
   ```bash
   cd C:\Users\Xianc\Documents\Sleeping_beauty_viewer
   git add .
   git commit -m "Update viewer"
   git push
   ```

## Access Information

- **Password**: `ASTHMAPOSTS`
- **Encryption**: AES-256-CBC with PBKDF2 key derivation

## Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML structure |
| `app.js` | Application logic |
| `styles.css` | Styling |
| `data/metadata.json` | Public case overview (not encrypted) |
| `data/cases.encrypted` | Encrypted full case data |
| `data/encryption_config.json` | Encryption parameters |
| `convert_data.py` | Data conversion script (for reference) |

---
*Last updated: 2025-01-13*
