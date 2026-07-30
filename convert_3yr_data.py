"""
Data Conversion Script for 3-Year Late Awakening Posts

Generates case data for late-awakening posts (tm > 365 days).
These posts don't have mechanism analysis yet, but can be browsed.

Usage:
    python convert_3yr_data.py --password YOUR_PASSWORD
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

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_PATH = PROJECT_ROOT / "data"
RESULTS_PATH = DATA_PATH / "results"
RESULTS_3YR = RESULTS_PATH / "robust_3yr"
OUTPUT_PATH = SCRIPT_DIR / "data"


def load_source_data():
    """Load source data for 3-year late awakening posts."""
    print("Loading source data...")

    # Late awakening posts (top 20)
    late_posts = pd.read_csv(RESULTS_3YR / "late_awakening_posts.csv")
    late_posts = late_posts.nlargest(20, 'B_modified')
    print(f"  Late awakening posts: {len(late_posts)} cases")

    # Daily views for 3-year window
    daily_views = pd.read_csv(RESULTS_3YR / "sb_post_daily_views_3yr.csv")
    print(f"  Daily views (3yr): {len(daily_views)} records")

    # Raw posts
    raw_posts = pd.read_csv(DATA_PATH / "raw" / "posts_combined.csv", encoding='utf-8')
    print(f"  Raw posts: {len(raw_posts)} total")

    # Superusers
    superusers_file = DATA_PATH / "processed" / "superusers_top1pct.csv"
    if superusers_file.exists():
        superusers = pd.read_csv(superusers_file)
        superuser_ids = set(superusers['simplified_user_id'].tolist())
        print(f"  Superusers: {len(superuser_ids)} users")
    else:
        superuser_ids = set()

    # Posts cleaned (for titles)
    posts_cleaned = pd.read_csv(DATA_PATH / "processed" / "posts_cleaned.csv")
    posts_cleaned = posts_cleaned.rename(columns={'postid': 'post_id'})
    print(f"  Posts cleaned: {len(posts_cleaned)} posts")

    return late_posts, daily_views, raw_posts, posts_cleaned, superuser_ids


def prepare_case_data(late_posts, daily_views, raw_posts, posts_cleaned, superuser_ids):
    """Prepare case data for late awakening posts."""
    cases = []

    for rank, (_, row) in enumerate(late_posts.iterrows(), 1):
        post_id = int(row['post_id'])

        # Get post info
        post_info = posts_cleaned[posts_cleaned['post_id'] == post_id]
        title = post_info.iloc[0]['title'] if len(post_info) > 0 else f"Post {post_id}"

        # Get main post content
        main_post = raw_posts[raw_posts['postid'] == post_id]
        main_post_data = None
        if len(main_post) > 0:
            mp = main_post.iloc[0]
            author_id = mp['simplified_user_id'] if pd.notna(mp.get('simplified_user_id')) else 0
            main_post_data = {
                'title': str(mp['title']) if pd.notna(mp['title']) else title,
                'body': str(mp['body']) if pd.notna(mp['body']) else '',
                'author_id': int(author_id) if pd.notna(author_id) else 0,
                'is_superuser': author_id in superuser_ids if pd.notna(author_id) else False,
                'date': str(mp['datecreated']) if pd.notna(mp['datecreated']) else '',
                'category': row['category']
            }

        # Get comments
        comments = raw_posts[raw_posts['superparentid'] == post_id].copy()
        comments = comments.sort_values('datecreated')
        comments_data = []
        for _, c in comments.iterrows():
            comments_data.append({
                'user_id': int(c['simplified_user_id']) if pd.notna(c['simplified_user_id']) else 0,
                'body': str(c['body']) if pd.notna(c['body']) else '',
                'date': str(c['datecreated']) if pd.notna(c['datecreated']) else ''
            })

        # Get daily views
        post_views = daily_views[daily_views['post_id'] == post_id].copy()
        post_views = post_views.sort_values('post_age_days')
        views_data = post_views[['post_age_days', 'daily_views']].to_dict('records')

        # Calculate sleep duration
        sleep_duration = int(row['tm'] - row['t0'])

        case = {
            'rank': rank,
            'post_id': post_id,
            'title': title,
            'B': float(row['B_modified']),
            'tm': int(row['tm']),
            't0': int(row['t0']),
            'sleep_duration': sleep_duration,
            'created_date': main_post_data['date'] if main_post_data else '',
            'category': row['category'],
            'mechanism': 'Late Awakening (Under Investigation)',
            'confidence': 'N/A',
            'evidence': f'This post awoke after {sleep_duration} days of dormancy (peak at day {int(row["tm"])}). Mechanism analysis pending.',
            'main_post': main_post_data,
            'comments': comments_data,
            'daily_views': views_data,
            'prince_post': None,
            'exploration': {
                'author_posts': [],
                'author_comments_elsewhere': [],
                'peak_commenters': [],
                'commenter_activity': []
            },
            'is_late_awakening': True
        }
        cases.append(case)

        # Handle potential Unicode encoding issues on Windows console
        try:
            print(f"  Case {rank}: {title[:50]}... (B={row['B_modified']:.1f}, tm={row['tm']})")
        except UnicodeEncodeError:
            print(f"  Case {rank}: [title has special chars] (B={row['B_modified']:.1f}, tm={row['tm']})")

    return cases


def pad(data):
    """PKCS7 padding."""
    block_size = 16
    padding_len = block_size - (len(data) % block_size)
    return data + bytes([padding_len] * padding_len)


def convert_to_serializable(obj):
    """Convert numpy types to Python native types."""
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
    """Encrypt data using AES-256-CBC."""
    if not HAS_CRYPTO:
        raise ImportError("cryptography package required")

    data = convert_to_serializable(data)
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(16)
    iterations = 10000
    key = pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=32)

    json_data = json.dumps(data, ensure_ascii=False)
    padded_data = pad(json_data.encode('utf-8'))

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded_data) + encryptor.finalize()

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
    parser = argparse.ArgumentParser(description='Convert 3-year late awakening data')
    parser.add_argument('--password', type=str, required=True, help='Encryption password')
    args = parser.parse_args()

    print("=" * 60)
    print("3-YEAR LATE AWAKENING DATA CONVERTER")
    print("=" * 60)

    # Load data
    late_posts, daily_views, raw_posts, posts_cleaned, superuser_ids = load_source_data()

    # Prepare case data
    print("\nPreparing case data...")
    cases = prepare_case_data(late_posts, daily_views, raw_posts, posts_cleaned, superuser_ids)
    print(f"\n  Prepared {len(cases)} cases")

    # Create output directory
    OUTPUT_PATH.mkdir(exist_ok=True)

    # Save metadata
    metadata = []
    for case in cases:
        metadata.append({
            'rank': case['rank'],
            'post_id': case['post_id'],
            'title': case['title'],
            'B': case['B'],
            'tm': case['tm'],
            't0': case['t0'],
            'sleep_duration': case['sleep_duration'],
            'category': case['category'],
            'mechanism': case['mechanism'],
            'confidence': case['confidence'],
            'comments_count': len(case['comments']),
            'has_prince': False
        })

    with open(OUTPUT_PATH / "late_awakening_metadata.json", 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"\nSaved late_awakening_metadata.json ({len(metadata)} cases)")

    # Encrypt case data
    print("\nEncrypting case data...")
    encrypted, config = encrypt_data(cases, args.password)

    with open(OUTPUT_PATH / "late_awakening_cases.encrypted", 'w', encoding='utf-8') as f:
        json.dump(encrypted, f)
    print("  Saved late_awakening_cases.encrypted")

    # Use same config as main cases
    print("\n" + "=" * 60)
    print("CONVERSION COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
