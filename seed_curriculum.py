#!/usr/bin/env python3
"""
Seed DynamoDB tables with extracted ATP curriculum data.
Requires AWS credentials configured (uses 'capaciti' profile by default).
"""

import os
import json
import boto3
from botocore.config import Config

# AWS Configuration
AWS_PROFILE = os.environ.get("AWS_PROFILE", "capaciti")
AWS_REGION = os.environ.get("AWS_REGION", "af-south-1")

# Table names
CURRICULUM_TABLE = "Curriculum"
TOPICS_TABLE = "Topics"
SUBTOPICS_TABLE = "Subtopics"


def get_dynamodb_client():
    """Get DynamoDB client with configured profile."""
    session = boto3.Session(profile_name=AWS_PROFILE)
    config = Config(
        region_name=AWS_REGION,
        retries={'max_attempts': 3}
    )
    return session.resource('dynamodb', config=config)


def batch_write_items(table, items: list, batch_size: int = 25):
    """Write items to DynamoDB in batches."""
    total = len(items)
    written = 0
    
    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        
        with table.batch_writer() as writer:
            for item in batch:
                writer.put_item(Item=item)
        
        written += len(batch)
        print(f"  Written {written}/{total} items")
    
    return written


def seed_curriculum_table(dynamodb, curriculum_items: list):
    """Seed the Curriculum table."""
    print(f"\nSeeding Curriculum table with {len(curriculum_items)} items...")
    table = dynamodb.Table(CURRICULUM_TABLE)
    
    # De-duplicate by curriculumId
    seen = set()
    unique_items = []
    for item in curriculum_items:
        if item["curriculumId"] not in seen:
            seen.add(item["curriculumId"])
            unique_items.append(item)
    
    print(f"  (Reduced to {len(unique_items)} unique entries after de-duplication)")
    return batch_write_items(table, unique_items)


def seed_topics_table(dynamodb, topic_items: list):
    """Seed the Topics table."""
    print(f"\nSeeding Topics table with {len(topic_items)} items...")
    table = dynamodb.Table(TOPICS_TABLE)
    return batch_write_items(table, topic_items)


def seed_subtopics_table(dynamodb, subtopic_items: list):
    """Seed the Subtopics table."""
    if not subtopic_items:
        print("\nNo subtopics to seed (will be populated later)")
        return 0
    
    print(f"\nSeeding Subtopics table with {len(subtopic_items)} items...")
    table = dynamodb.Table(SUBTOPICS_TABLE)
    return batch_write_items(table, subtopic_items)


def verify_tables_exist(dynamodb):
    """Verify that all required tables exist."""
    client = dynamodb.meta.client
    existing_tables = client.list_tables()['TableNames']
    
    required_tables = [CURRICULUM_TABLE, TOPICS_TABLE, SUBTOPICS_TABLE]
    missing = [t for t in required_tables if t not in existing_tables]
    
    if missing:
        print(f"ERROR: Missing tables: {missing}")
        print("Please run 'terraform apply' first to create the tables.")
        return False
    
    print(f"✓ All required tables exist: {required_tables}")
    return True


def main():
    """Main entry point."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(script_dir, "curriculum_data.json")
    
    print("="*60)
    print("Curriculum Data Seeder")
    print("="*60)
    print(f"Profile: {AWS_PROFILE}")
    print(f"Region: {AWS_REGION}")
    
    # Load extracted data
    if not os.path.exists(data_file):
        print(f"\nERROR: Data file not found: {data_file}")
        print("Please run atp_parser.py first to extract the data.")
        return
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"\nLoaded data:")
    print(f"  - Curriculum entries: {len(data['curriculum'])}")
    print(f"  - Topic entries: {len(data['topics'])}")
    print(f"  - Subtopic entries: {len(data['subtopics'])}")
    
    # Connect to DynamoDB
    print("\nConnecting to DynamoDB...")
    dynamodb = get_dynamodb_client()
    
    # Verify tables exist
    if not verify_tables_exist(dynamodb):
        return
    
    # Seed tables
    curriculum_count = seed_curriculum_table(dynamodb, data['curriculum'])
    topics_count = seed_topics_table(dynamodb, data['topics'])
    subtopics_count = seed_subtopics_table(dynamodb, data['subtopics'])
    
    print("\n" + "="*60)
    print("Seeding Complete!")
    print("="*60)
    print(f"  Curriculum entries: {curriculum_count}")
    print(f"  Topic entries: {topics_count}")
    print(f"  Subtopic entries: {subtopics_count}")


if __name__ == "__main__":
    main()
