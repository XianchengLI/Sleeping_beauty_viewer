"""
Generate 3-Year Window Top Posts Data for SB Viewer

Creates metadata for top 20 late-awakening posts from 3-year analysis
with their corresponding ranks in the 1-year analysis.
"""

import pandas as pd
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "results"

def main():
    print("Loading results...")

    # Load 1-year results
    results_1yr = pd.read_csv(DATA_PATH / "sb_modified_framework_hierarchical.csv")
    results_1yr['rank_1yr'] = results_1yr['B_modified'].rank(ascending=False).astype(int)
    print(f"  1-year: {len(results_1yr):,} posts")

    # Load 3-year results
    results_3yr = pd.read_csv(DATA_PATH / "robust_3yr" / "sb_modified_framework_3yr_hierarchical.csv")
    results_3yr['rank_3yr'] = results_3yr['B_modified'].rank(ascending=False).astype(int)
    print(f"  3-year: {len(results_3yr):,} posts")

    # Load late awakening posts
    late_posts = pd.read_csv(DATA_PATH / "robust_3yr" / "late_awakening_posts.csv")
    print(f"  Late awakening: {len(late_posts):,} posts")

    # Get top 20 late awakening by B
    top_20_late = late_posts.nlargest(20, 'B_modified').copy()

    # Merge with 1-year ranks
    top_20_late = top_20_late.merge(
        results_1yr[['post_id', 'rank_1yr', 'B_modified']].rename(columns={'B_modified': 'B_1yr'}),
        on='post_id',
        how='left'
    )

    # Add 3-year rank
    top_20_late = top_20_late.merge(
        results_3yr[['post_id', 'rank_3yr']],
        on='post_id',
        how='left'
    )

    # Load posts info for titles
    posts_info = pd.read_csv(PROJECT_ROOT / "data" / "processed" / "posts_cleaned.csv")
    posts_info = posts_info.rename(columns={'postid': 'post_id', 'title': 'post_title'})
    top_20_late = top_20_late.merge(
        posts_info[['post_id', 'post_title']],
        on='post_id',
        how='left'
    )

    # Calculate sleep duration
    top_20_late['sleep_duration'] = top_20_late['tm'] - top_20_late['t0']

    # Prepare output data
    output_data = []
    for i, row in enumerate(top_20_late.iterrows(), 1):
        idx, data = row
        output_data.append({
            'rank_3yr': int(data['rank_3yr']) if pd.notna(data['rank_3yr']) else i,
            'rank_1yr': int(data['rank_1yr']) if pd.notna(data['rank_1yr']) else None,
            'post_id': int(data['post_id']),
            'title': str(data['post_title'])[:80] if pd.notna(data['post_title']) else f"Post {data['post_id']}",
            'category': data['category'],
            'B_3yr': round(data['B_modified'], 1),
            'B_1yr': round(data['B_1yr'], 1) if pd.notna(data['B_1yr']) else None,
            't0': int(data['t0']),
            'tm': int(data['tm']),
            'sleep_duration': int(data['sleep_duration'])
        })

    # Save to viewer data folder
    output_path = Path(__file__).parent / "data" / "late_awakening_top20.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"\nSaved top 20 late-awakening posts to: {output_path}")

    # Print summary
    print("\nTop 20 Late-Awakening Sleeping Beauties:")
    print("-" * 100)
    print(f"{'#3yr':<6} {'#1yr':<8} {'B(3yr)':<10} {'B(1yr)':<10} {'Sleep':<8} {'tm':<8} {'Category':<12} {'Title':<40}")
    print("-" * 100)
    for item in output_data:
        rank_1yr_str = str(item['rank_1yr']) if item['rank_1yr'] else 'N/A'
        b_1yr_str = f"{item['B_1yr']:.1f}" if item['B_1yr'] else 'N/A'
        title_short = item['title'][:38] + '..' if len(item['title']) > 40 else item['title']
        print(f"{item['rank_3yr']:<6} {rank_1yr_str:<8} {item['B_3yr']:<10.1f} {b_1yr_str:<10} {item['sleep_duration']:<8} {item['tm']:<8} {item['category']:<12} {title_short}")

if __name__ == "__main__":
    main()
