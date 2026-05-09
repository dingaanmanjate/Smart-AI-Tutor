#!/usr/bin/env python3
"""
Update the EXISTING Grade 11 Mathematics curriculum with refined data.
Target ID: CAPS#Grade 11#Mathematics
Clean up the duplicate 'CAPS#11#Mathematics' if it exists.
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

# Target ID to UPDATE (The "Old" one)
TARGET_CURRICULUM_ID = "CAPS#Grade 11#Mathematics"

# Wrong ID to DELETE (The "New" one I accidentally created)
WRONG_CURRICULUM_ID = "CAPS#11#Mathematics"

def get_dynamodb_resource():
    session = boto3.Session(profile_name=AWS_PROFILE)
    config = Config(region_name=AWS_REGION)
    return session.resource('dynamodb', config=config)

def delete_curriculum_data(dynamodb, curriculum_id):
    """Deletes all topics and subtopics for a given curriculum ID."""
    print(f"Deleting data for {curriculum_id}...")
    
    # 1. Provide info about deletion
    topic_table = dynamodb.Table(TOPICS_TABLE)
    subtopic_table = dynamodb.Table(SUBTOPICS_TABLE)
    curr_table = dynamodb.Table(CURRICULUM_TABLE)
    
    # scan for topics to delete (or query via GSI)
    # Using Scan for thoroughness in cleanup script, but query is better if index exists
    # CurriculumTermIndex: PK=curriculumId
    
    try:
        response = topic_table.query(
            IndexName='CurriculumTermIndex',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('curriculumId').eq(curriculum_id)
        )
        topics = response['Items']
    except Exception:
        # Fallback scan filter if index issue
        scan_resp = topic_table.scan(
             FilterExpression=boto3.dynamodb.conditions.Key('curriculumId').eq(curriculum_id)
        )
        topics = scan_resp['Items']

    print(f"  Found {len(topics)} topics to delete.")
    
    # Delete Subtopics first (cascade)
    count_sub = 0
    with subtopic_table.batch_writer() as batch:
        for topic in topics:
            t_id = topic['topicId']
            # Find subtopics
            st_resp = subtopic_table.query(
                IndexName='TopicOrderIndex',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('topicId').eq(t_id)
            )
            for st in st_resp['Items']:
                batch.delete_item(Key={'subtopicId': st['subtopicId']})
                count_sub += 1
    
    print(f"  Deleted {count_sub} subtopics.")
    
    # Delete Topics
    with topic_table.batch_writer() as batch:
        for topic in topics:
            batch.delete_item(Key={'topicId': topic['topicId']})
    
    print(f"  Deleted {len(topics)} topics.")
    
    # Delete Curriculum Entry if it's the WRONG one
    if curriculum_id == WRONG_CURRICULUM_ID:
        curr_table.delete_item(Key={'curriculumId': curriculum_id})
        print(f"  Deleted curriculum entry: {curriculum_id}")

def batch_write_items(table, items: list, batch_size: int = 25):
    total = len(items)
    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        with table.batch_writer() as writer:
            for item in batch:
                writer.put_item(Item=item)
    print(f"  Written {len(items)} items")

def update_grade_11_math():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(script_dir, "grade_11_math_data_v5.json")
    
    if not os.path.exists(data_file):
        print(f"Data file not found: {data_file}")
        return

    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    dynamodb = get_dynamodb_resource()
    
    # 1. CLEANUP
    print("--- 1. Cleanup Phase ---")
    # Remove the accidentally created new one
    delete_curriculum_data(dynamodb, WRONG_CURRICULUM_ID)
    
    # Remove OLD data from the TARGET (so we can replace it with refining scraping)
    delete_curriculum_data(dynamodb, TARGET_CURRICULUM_ID)
    
    # 2. SEEDING
    print("\n--- 2. Seeding Phase ---")
    # We don't create the curriculum item for TARGET, it presumably exists or we just want to update content?
    # Actually, we should check if it exists or ensure it exists.
    # The user said "update the old", so it exists.
    
    # Prepare Items
    topic_items = []
    subtopic_items = []

    print(f"Preparing data for {TARGET_CURRICULUM_ID}...")
    for t_idx, topic in enumerate(data.get("topics", [])):
        topic_name = topic.get("topic_name")
        clean_name = "".join(x for x in topic_name if x.isalnum())
        
        # Use TARGET ID as prefix
        # ID Format: CAPS#Grade 11#Mathematics#TOPIC_...
        topic_id = f"{TARGET_CURRICULUM_ID}#TOPIC_{t_idx+1}_{clean_name[:15]}"
        
        t_item = {
            "topicId": topic_id,
            "curriculumId": TARGET_CURRICULUM_ID,
            "term": topic.get("term", 1), 
            "mainTopic": topic_name, # CHANGED from 'name' to 'mainTopic' to match App Schema
            "orderIndex": t_idx + 1
        }
        topic_items.append(t_item)
        
        # Subtopics
        for s_idx, sub in enumerate(topic.get("subtopics", [])):
            sub_title = sub.get("title", "")
            sub_number = sub.get("number", "")
            bullets = sub.get("context_bullets", [])
            
            subtopic_id = f"{topic_id}#SUB_{s_idx+1}"
            
            # Combine Number + Title for the 'content' field if that's what's displayed
            # Or just Title? seed_curriculum used just the text.
            # let's use Title as 'content'.
            
            s_item = {
                "subtopicId": subtopic_id,
                "topicId": topic_id,
                "orderIndex": s_idx + 1,
                "number": sub_number,
                "content": sub_title, # CHANGED from 'title' to 'content' to match App Schema
                "context": bullets 
            }
            subtopic_items.append(s_item)

    print(f"Writing {len(topic_items)} Topics and {len(subtopic_items)} Subtopics...")
    
    if topic_items:
        batch_write_items(dynamodb.Table(TOPICS_TABLE), topic_items)
        
    if subtopic_items:
        batch_write_items(dynamodb.Table(SUBTOPICS_TABLE), subtopic_items)

    print("Update Complete.")

if __name__ == "__main__":
    update_grade_11_math()
