#!/usr/bin/env python3
"""
Seed DynamoDB tables with extracted ATP curriculum data.
Transforms extracted_atp_data.json into Curriculum, Topics, and Subtopics tables.
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

# Curriculum identifier prefix
CURRICULUM_PREFIX = "CAPS"


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


def transform_extracted_data(extracted_data: list):
    """
    Transform extracted_atp_data.json format into DynamoDB table items.
    
    Returns:
        dict with 'curriculum', 'topics', 'subtopics' lists
    """
    curriculum_items = []
    topic_items = []
    subtopic_items = []
    
    for entry in extracted_data:
        grade = entry.get("grade", "").strip()
        subject = entry.get("subject", "").strip()
        
        if not grade or not subject:
            print(f"  Skipping entry with missing grade/subject: {entry.get('grade')}, {entry.get('subject')}")
            continue
        
        # Create Curriculum record
        curriculum_id = f"{CURRICULUM_PREFIX}#{grade}#{subject}"
        curriculum_items.append({
            "curriculumId": curriculum_id,
            "grade": grade,
            "subjectName": subject,
            "curriculumType": CURRICULUM_PREFIX
        })
        
        # Process terms and weeks
        for term_data in entry.get("curriculum", []):
            term_num = term_data.get("term", 0)
            
            for week_data in term_data.get("weeks", []):
                week_num = week_data.get("week", 0)
                
                # Create Topic record (one per term+week)
                topic_id = f"{curriculum_id}#T{term_num}#W{week_num}"
                
                topic_items.append({
                    "topicId": topic_id,
                    "curriculumId": curriculum_id,
                    "term": term_num,
                    "week": week_num,
                    "mainTopic": week_data.get("main_topic", ""),
                    "formalAssessment": week_data.get("formal_assessment", ""),
                    "formulas": week_data.get("formulas", [])
                })
                
                # Create Subtopic records
                for idx, subtopic_text in enumerate(week_data.get("subtopics", [])):
                    subtopic_id = f"{topic_id}#{idx}"
                    
                    subtopic_items.append({
                        "subtopicId": subtopic_id,
                        "topicId": topic_id,
                        "orderIndex": idx,
                        "content": subtopic_text
                    })
    
    return {
        "curriculum": curriculum_items,
        "topics": topic_items,
        "subtopics": subtopic_items
    }


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
        print("\nNo subtopics to seed")
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
    data_file = os.path.join(script_dir, "extracted_atp_data.json")
    
    print("="*60)
    print("Curriculum Data Seeder")
    print("="*60)
    print(f"Profile: {AWS_PROFILE}")
    print(f"Region: {AWS_REGION}")
    
    # Load extracted data
    if not os.path.exists(data_file):
        print(f"\nERROR: Data file not found: {data_file}")
        print("Please run extract_atp_data.py first to extract the data.")
        return
    
    with open(data_file, 'r', encoding='utf-8') as f:
        extracted_data = json.load(f)
    
    print(f"\nLoaded {len(extracted_data)} grade/subject entries from extracted_atp_data.json")
    
    # Transform data into DynamoDB format
    print("\nTransforming data...")
    data = transform_extracted_data(extracted_data)
    
    print(f"\nTransformed data:")
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
