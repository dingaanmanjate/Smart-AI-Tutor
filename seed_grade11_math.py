#!/usr/bin/env python3
"""
Seed DynamoDB tables with Grade 11 Mathematics ATP data.
Data Source: grade_11_math_data_v5.json
"""

import os
import json
import boto3
from botocore.config import Config
import uuid

# AWS Configuration
AWS_PROFILE = os.environ.get("AWS_PROFILE", "capaciti")
AWS_REGION = os.environ.get("AWS_REGION", "af-south-1")

# Table names
CURRICULUM_TABLE = "Curriculum"
TOPICS_TABLE = "Topics"
SUBTOPICS_TABLE = "Subtopics"

def get_dynamodb_client():
    session = boto3.Session(profile_name=AWS_PROFILE)
    config = Config(
        region_name=AWS_REGION,
        retries={'max_attempts': 3}
    )
    return session.resource('dynamodb', config=config)

def batch_write_items(table, items: list, batch_size: int = 25):
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

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(script_dir, "grade_11_math_data_v5.json")
    
    if not os.path.exists(data_file):
        print(f"Data file not found: {data_file}")
        return

    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    dynamodb = get_dynamodb_client()
    
    # 1. Seed Curriculum
    grade = data.get("grade", "11")
    subject = data.get("subject", "Mathematics")
    curriculum_id = f"CAPS#{grade}#{subject}"
    
    curr_item = {
        "curriculumId": curriculum_id,
        "grade": grade,
        "subjectName": subject,
        "curriculumType": "CAPS"
    }
    
    print(f"Seeding Curriculum: {curriculum_id}")
    curriculum_table = dynamodb.Table(CURRICULUM_TABLE)
    curriculum_table.put_item(Item=curr_item)

    # 2. Seed Topics and Subtopics
    topic_items = []
    subtopic_items = []

    print("Processing Topics...")
    for t_idx, topic in enumerate(data.get("topics", [])):
        topic_name = topic.get("topic_name")
        # Generate Topic ID
        # Clean name for ID readability
        clean_name = "".join(x for x in topic_name if x.isalnum())
        topic_id = f"{curriculum_id}#TOPIC_{t_idx+1}_{clean_name[:20]}"
        
        t_item = {
            "topicId": topic_id,
            "curriculumId": curriculum_id,
            "term": 1, # Default as we don't have explicit terms in scraped data
            "name": topic_name,
            "orderIndex": t_idx + 1
        }
        topic_items.append(t_item)
        
        # Subtopics
        for s_idx, sub in enumerate(topic.get("subtopics", [])):
            sub_title = sub.get("title", "")
            sub_number = sub.get("number", "")
            bullets = sub.get("context_bullets", [])
            
            subtopic_id = f"{topic_id}#SUB_{s_idx+1}"
            
            s_item = {
                "subtopicId": subtopic_id,
                "topicId": topic_id,
                "orderIndex": s_idx + 1,
                "number": sub_number,
                "title": sub_title,
                "context": bullets # The requested "space for context"
            }
            subtopic_items.append(s_item)

    print(f"Prepared {len(topic_items)} Topics and {len(subtopic_items)} Subtopics.")
    
    if topic_items:
        print("Writing Topics to DynamoDB...")
        batch_write_items(dynamodb.Table(TOPICS_TABLE), topic_items)
        
    if subtopic_items:
        print("Writing Subtopics to DynamoDB...")
        batch_write_items(dynamodb.Table(SUBTOPICS_TABLE), subtopic_items)

    print("Seeding Logic Complete.")

if __name__ == "__main__":
    main()
