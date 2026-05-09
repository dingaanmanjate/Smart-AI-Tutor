import boto3
from botocore.config import Config
import os

# AWS Configuration
AWS_PROFILE = os.environ.get("AWS_PROFILE", "capaciti")
AWS_REGION = os.environ.get("AWS_REGION", "af-south-1")

def get_dynamodb_resource():
    session = boto3.Session(profile_name=AWS_PROFILE)
    config = Config(region_name=AWS_REGION)
    return session.resource('dynamodb', config=config)

def list_curricula():
    dynamodb = get_dynamodb_resource()
    table = dynamodb.Table('Curriculum')
    
    print("Scanning 'Curriculum' table for IDs...")
    
    try:
        response = table.scan(ProjectionExpression='curriculumId, grade, subjectName')
        items = response['Items']
        
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                ProjectionExpression='curriculumId, grade, subjectName',
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response['Items'])
        
        print("\nFound Curriculum IDs:")
        print("-" * 50)
        for item in items:
            c_id = item.get('curriculumId')
            grade = item.get('grade')
            subject = item.get('subjectName')
            print(f"- {c_id} (Grade: {grade}, Subject: {subject})")
            
        print("-" * 50)
        print(f"Total: {len(items)}")
        
    except Exception as e:
        print(f"Error scanning table: {e}")

if __name__ == "__main__":
    list_curricula()
