"""
Data Conversion Script for SB Mechanism Viewer - Hourly Dedup Version

Converts hourly dedup data to encrypted JSON for GitHub Pages deployment.
This creates a separate set of data files for the "Hourly Deduplication" tab.

Usage:
    python convert_hourly_data.py --password YOUR_PASSWORD

Author: Lurking Project
Date: 2026-02-02
"""

import pandas as pd
import json
import argparse
import secrets
import base64
from pathlib import Path
from hashlib import pbkdf2_hmac

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
    """Load hourly dedup source data from the lurking project."""
    print("Loading hourly dedup source data...")

    # Top 20 mechanisms (new hourly dedup version)
    mechanisms = pd.read_csv(RESULTS_PATH / "sb_top20_mechanisms.csv")
    print(f"  Mechanisms: {len(mechanisms)} cases")

    # Prince exploration (if exists)
    prince_exploration_file = RESULTS_PATH / "sb_prince_exploration.json"
    if prince_exploration_file.exists():
        with open(prince_exploration_file, 'r', encoding='utf-8') as f:
            prince_exploration = json.load(f)
        print(f"  Prince exploration: {len(prince_exploration)} cases")
    else:
        prince_exploration = []
        print("  Prince exploration: file not found, skipping")

    # Daily views (hourly dedup version)
    daily_views = pd.read_csv(RESULTS_PATH / "sb_post_daily_views.csv")
    print(f"  Daily views: {len(daily_views)} records")

    # Raw posts
    raw_posts = pd.read_csv(DATA_PATH / "raw" / "posts_combined.csv", encoding='utf-8')
    print(f"  Raw posts: {len(raw_posts)} total")

    # Superusers (top 1%)
    superusers_file = DATA_PATH / "processed" / "superusers_top1pct.csv"
    if superusers_file.exists():
        superusers = pd.read_csv(superusers_file)
        superuser_ids = set(superusers['simplified_user_id'].tolist())
        print(f"  Superusers: {len(superuser_ids)} users (top 1%)")
    else:
        superuser_ids = set()
        print("  Superusers: file not found, skipping")

    return mechanisms, prince_exploration, daily_views, raw_posts, superuser_ids


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


def prepare_case_data(mechanisms, prince_exploration, daily_views, relevant_posts, superuser_ids):
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
            author_id = mp['simplified_user_id']
            main_post_data = {
                'title': mp['title'],
                'body': str(mp['body']) if pd.notna(mp['body']) else '',
                'author_id': author_id,
                'is_superuser': author_id in superuser_ids,
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
                prince_author_id = pp['simplified_user_id']
                prince_post_data = {
                    'post_id': int(row['prince_id']),
                    'title': pp['title'],
                    'body': str(pp['body']) if pd.notna(pp['body']) else '',
                    'author_id': prince_author_id,
                    'is_superuser': prince_author_id in superuser_ids,
                    'date': str(pp['datecreated']) if pd.notna(pp['datecreated']) else ''
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


def encrypt_data(data, password, config):
    """Encrypt data using AES-256-CBC compatible with CryptoJS."""
    if not HAS_CRYPTO:
        raise ImportError("cryptography package required for encryption")

    # Convert numpy types to native Python types
    data = convert_to_serializable(data)

    # Generate random salt and IV
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(16)

    # Derive key using PBKDF2
    iterations = config['iterations']
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

    return encrypted


def main():
    parser = argparse.ArgumentParser(description='Convert hourly dedup data for GitHub Pages viewer')
    parser.add_argument('--password', type=str, required=True, help='Encryption password')
    args = parser.parse_args()

    print("=" * 60)
    print("SB MECHANISM VIEWER - HOURLY DEDUP DATA CONVERTER")
    print("=" * 60)

    # Load data
    mechanisms, prince_exploration, daily_views, raw_posts, superuser_ids = load_source_data()

    # Get relevant posts
    relevant_posts = get_relevant_posts(mechanisms, prince_exploration, raw_posts)

    # Prepare case data
    print("\nPreparing case data...")
    cases = prepare_case_data(mechanisms, prince_exploration, daily_views, relevant_posts, superuser_ids)
    print(f"  Prepared {len(cases)} cases")

    # Create output directory
    OUTPUT_PATH.mkdir(exist_ok=True)

    # Load existing encryption config (use same parameters)
    config_file = OUTPUT_PATH / "encryption_config.json"
    if config_file.exists():
        with open(config_file, 'r') as f:
            config = json.load(f)
        print(f"\nUsing existing encryption config")
    else:
        config = {
            'iterations': 10000,
            'keySize': 256,
            'algorithm': 'AES-CBC'
        }
        print(f"\nUsing default encryption config")

    # Save hourly metadata (non-sensitive, for overview)
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

    with open(OUTPUT_PATH / "hourly_metadata.json", 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"\nSaved hourly_metadata.json ({len(metadata)} cases)")

    # Encrypt full case data
    print("\nEncrypting case data...")
    encrypted = encrypt_data(cases, args.password, config)

    with open(OUTPUT_PATH / "hourly_cases.encrypted", 'w', encoding='utf-8') as f:
        json.dump(encrypted, f)
    print("  Saved hourly_cases.encrypted")

    # Also save hourly top 20 summary for table display
    hourly_top20 = []
    for case in cases:
        hourly_top20.append({
            'rank': case['rank'],
            'post_id': case['post_id'],
            'title': case['title'],
            'B': case['B'],
            'tm': case['tm'],
            'category': case['category'],
            'mechanism': case['mechanism'],
            'confidence': case['confidence']
        })

    with open(OUTPUT_PATH / "hourly_top20.json", 'w', encoding='utf-8') as f:
        json.dump(hourly_top20, f, indent=2, ensure_ascii=False)
    print("  Saved hourly_top20.json")

    print("\n" + "=" * 60)
    print("HOURLY DEDUP DATA CONVERSION COMPLETE")
    print("=" * 60)
    print(f"\nOutput files in: {OUTPUT_PATH}")
    print("  - hourly_metadata.json (public overview)")
    print("  - hourly_cases.encrypted (encrypted full data)")
    print("  - hourly_top20.json (top 20 summary)")


if __name__ == "__main__":
    main()
