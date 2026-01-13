"""
Data Conversion Script for SB Mechanism Viewer

Converts Streamlit app data to encrypted JSON for GitHub Pages deployment.
Uses AES encryption compatible with CryptoJS for browser-side decryption.

Usage:
    python convert_data.py --password YOUR_PASSWORD

Author: Lurking Project
Date: 2025-01-13
"""

import pandas as pd
import json
import argparse
import secrets
import base64
from pathlib import Path
from hashlib import pbkdf2_hmac

# Try to import cryptography, fall back to manual if not available
try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("Warning: cryptography not installed. Run: pip install cryptography")

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_PATH = PROJECT_ROOT / "data"
RESULTS_PATH = DATA_PATH / "results"
OUTPUT_PATH = SCRIPT_DIR / "data"


def load_source_data():
    """Load all source data from the lurking project."""
    print("Loading source data...")

    # Top 20 mechanisms
    mechanisms = pd.read_csv(RESULTS_PATH / "sb_top20_mechanisms.csv")
    print(f"  Mechanisms: {len(mechanisms)} cases")

    # Prince exploration
    with open(RESULTS_PATH / "sb_prince_exploration.json", 'r', encoding='utf-8') as f:
        prince_exploration = json.load(f)
    print(f"  Prince exploration: {len(prince_exploration)} cases")

    # Daily views
    daily_views = pd.read_csv(RESULTS_PATH / "sb_post_daily_views.csv")
    print(f"  Daily views: {len(daily_views)} records")

    # Raw posts (only load relevant ones)
    raw_posts = pd.read_csv(DATA_PATH / "raw" / "posts_combined.csv", encoding='utf-8')
    print(f"  Raw posts: {len(raw_posts)} total")

    return mechanisms, prince_exploration, daily_views, raw_posts


def get_relevant_posts(mechanisms, prince_exploration, raw_posts):
    """Extract only the posts needed for the viewer."""
    relevant_post_ids = set()

    # Main SB posts
    for post_id in mechanisms['post_id']:
        relevant_post_ids.add(post_id)

    # Comments on SB posts
    for post_id in mechanisms['post_id']:
        comments = raw_posts[raw_posts['superparentid'] == post_id]
        relevant_post_ids.update(comments['postid'].tolist())

    # Prince posts
    for prince_id in mechanisms['prince_id'].dropna():
        relevant_post_ids.add(int(prince_id))

    # Author posts and commenter activity from exploration
    for case in prince_exploration:
        for ap in case.get('author_posts', []):
            relevant_post_ids.add(ap['post_id'])
        for activity in case.get('commenter_activity', []):
            for p in activity.get('posts_created', []):
                relevant_post_ids.add(p['post_id'])
            for t in activity.get('threads_participated', []):
                if t.get('post_id'):
                    relevant_post_ids.add(int(t['post_id']))

    # Filter raw posts
    relevant_posts = raw_posts[raw_posts['postid'].isin(relevant_post_ids)].copy()
    print(f"  Relevant posts extracted: {len(relevant_posts)}")

    return relevant_posts


def prepare_case_data(mechanisms, prince_exploration, daily_views, relevant_posts):
    """Prepare case data structure for the viewer."""
    cases = []

    prince_dict = {p['post_id']: p for p in prince_exploration}

    for _, row in mechanisms.iterrows():
        post_id = row['post_id']

        # Get main post
        main_post = relevant_posts[relevant_posts['postid'] == post_id]
        main_post_data = None
        if len(main_post) > 0:
            mp = main_post.iloc[0]
            main_post_data = {
                'title': mp['title'],
                'body': str(mp['body']) if pd.notna(mp['body']) else '',
                'author_id': mp['simplified_user_id'],
                'date': str(mp['datecreated']),
                'category': mp.get('category', '')
            }

        # Get comments
        comments = relevant_posts[relevant_posts['superparentid'] == post_id].copy()
        comments = comments.sort_values('datecreated')
        comments_data = []
        for _, c in comments.iterrows():
            comments_data.append({
                'user_id': c['simplified_user_id'],
                'body': str(c['body']) if pd.notna(c['body']) else '',
                'date': str(c['datecreated'])
            })

        # Get daily views for this post
        post_views = daily_views[daily_views['post_id'] == post_id].copy()
        post_views = post_views.sort_values('post_age_days')
        views_data = post_views[['post_age_days', 'daily_views']].to_dict('records')

        # Get prince exploration data
        prince_info = prince_dict.get(post_id, {})

        # Get prince post if exists
        prince_post_data = None
        if pd.notna(row['prince_id']):
            prince_post = relevant_posts[relevant_posts['postid'] == int(row['prince_id'])]
            if len(prince_post) > 0:
                pp = prince_post.iloc[0]
                prince_post_data = {
                    'post_id': int(row['prince_id']),
                    'title': pp['title'],
                    'body': str(pp['body']) if pd.notna(pp['body']) else ''
                }

        case = {
            'rank': int(row['rank']),
            'post_id': int(post_id),
            'title': row['title'],
            'B': float(row['B']),
            'tm': int(row['tm']),
            'created_date': row['created_date'],
            'category': row['category'],
            'mechanism': row['mechanism'],
            'confidence': row['confidence'],
            'evidence': row['evidence'],
            'main_post': main_post_data,
            'comments': comments_data,
            'daily_views': views_data,
            'prince_post': prince_post_data,
            'exploration': {
                'author_posts': prince_info.get('author_posts', []),
                'author_comments_elsewhere': prince_info.get('author_comments_elsewhere', []),
                'peak_commenters': prince_info.get('peak_commenters', []),
                'commenter_activity': prince_info.get('commenter_activity', [])
            }
        }
        cases.append(case)

    return cases


def pad(data):
    """PKCS7 padding."""
    block_size = 16
    padding_len = block_size - (len(data) % block_size)
    return data + bytes([padding_len] * padding_len)


def convert_to_serializable(obj):
    """Convert numpy types to Python native types for JSON serialization."""
    import numpy as np
    if isinstance(obj, dict):
        return {k: convert_to_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    else:
        return obj


def encrypt_data(data, password):
    """Encrypt data using AES-256-CBC compatible with CryptoJS."""
    if not HAS_CRYPTO:
        raise ImportError("cryptography package required for encryption")

    # Convert numpy types to native Python types
    data = convert_to_serializable(data)

    # Generate random salt and IV
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(16)

    # Derive key using PBKDF2
    iterations = 10000
    key = pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=32)

    # Encrypt
    json_data = json.dumps(data, ensure_ascii=False)
    padded_data = pad(json_data.encode('utf-8'))

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded_data) + encryptor.finalize()

    # Encode to base64
    encrypted = {
        'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
        'iv': base64.b64encode(iv).decode('utf-8'),
        'salt': base64.b64encode(salt).decode('utf-8')
    }

    config = {
        'iterations': iterations,
        'keySize': 256,
        'algorithm': 'AES-CBC'
    }

    return encrypted, config


def main():
    parser = argparse.ArgumentParser(description='Convert SB data for GitHub Pages viewer')
    parser.add_argument('--password', type=str, required=True, help='Encryption password')
    args = parser.parse_args()

    print("=" * 60)
    print("SB MECHANISM VIEWER DATA CONVERTER")
    print("=" * 60)

    # Load data
    mechanisms, prince_exploration, daily_views, raw_posts = load_source_data()

    # Get relevant posts
    relevant_posts = get_relevant_posts(mechanisms, prince_exploration, raw_posts)

    # Prepare case data
    print("\nPreparing case data...")
    cases = prepare_case_data(mechanisms, prince_exploration, daily_views, relevant_posts)
    print(f"  Prepared {len(cases)} cases")

    # Create output directory
    OUTPUT_PATH.mkdir(exist_ok=True)

    # Save metadata (non-sensitive, for overview)
    metadata = []
    for case in cases:
        metadata.append({
            'rank': case['rank'],
            'post_id': case['post_id'],
            'title': case['title'],
            'B': case['B'],
            'tm': case['tm'],
            'category': case['category'],
            'mechanism': case['mechanism'],
            'confidence': case['confidence'],
            'comments_count': len(case['comments']),
            'has_prince': case['prince_post'] is not None
        })

    with open(OUTPUT_PATH / "metadata.json", 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"\nSaved metadata.json ({len(metadata)} cases)")

    # Encrypt full case data
    print("\nEncrypting case data...")
    encrypted, config = encrypt_data(cases, args.password)

    with open(OUTPUT_PATH / "cases.encrypted", 'w', encoding='utf-8') as f:
        json.dump(encrypted, f)
    print("  Saved cases.encrypted")

    with open(OUTPUT_PATH / "encryption_config.json", 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)
    print("  Saved encryption_config.json")

    print("\n" + "=" * 60)
    print("CONVERSION COMPLETE")
    print("=" * 60)
    print(f"\nOutput files in: {OUTPUT_PATH}")
    print("  - metadata.json (public overview)")
    print("  - cases.encrypted (encrypted full data)")
    print("  - encryption_config.json (encryption params)")
    print(f"\nPassword: {args.password}")
    print("\nNext steps:")
    print("  1. Copy sb-viewer/ folder to new GitHub repo")
    print("  2. Enable GitHub Pages in repo settings")
    print("  3. Share URL and password with colleagues")


if __name__ == "__main__":
    main()
