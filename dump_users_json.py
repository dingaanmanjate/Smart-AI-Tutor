import boto3
import json
import os
from decimal import Decimal

# AWS Configuration
AWS_PROFILE = os.environ.get("AWS_PROFILE", "capaciti")
AWS_REGION = os.environ.get("AWS_REGION", "af-south-1")
# Try the newer User Pool ID identified or pass it as arg. 
# I'll try to find the active one by checking the client ID used in frontend or just dump from both if needed.
# For now let's prioritize DynamoDB as the source of "Enrolled Subjects" and enrich with Cognito if needed.
USER_POOL_ID = "af-south-1_LWPYqAkNt" 

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_boto3_clients():
    session = boto3.Session(profile_name=AWS_PROFILE)
    dynamodb = session.resource('dynamodb', region_name=AWS_REGION)
    cognito = session.client('cognito-idp', region_name=AWS_REGION)
    return dynamodb, cognito

def get_all_cognito_users(cognito_client, user_pool_id):
    users = []
    try:
        paginator = cognito_client.get_paginator('list_users')
        for page in paginator.paginate(UserPoolId=user_pool_id):
            for u in page['Users']:
                email = ""
                name = ""
                surname = ""
                for att in u['Attributes']:
                    if att['Name'] == 'email':
                        email = att['Value']
                    elif att['Name'] == 'given_name':
                        name = att['Value']
                    elif att['Name'] == 'family_name':
                        surname = att['Value']
                
                users.append({
                    "email": email,
                    "cognito_sub": u['Username'],
                    "cognito_name": name,
                    "cognito_surname": surname
                })
    except Exception as e:
        print(f"Error fetching Cognito users: {e}")
    return users

def dump_users_enrolments():
    dynamodb, cognito = get_boto3_clients()
    
    # 1. Fetch DynamoDB Profiles
    print("Fetching UserProfiles from DynamoDB...")
    table = dynamodb.Table('UserProfiles')
    scan_kwargs = {}
    done = False
    start_key = None
    db_items = []
    
    while not done:
        if start_key:
            scan_kwargs['ExclusiveStartKey'] = start_key
        response = table.scan(**scan_kwargs)
        db_items.extend(response.get('Items', []))
        start_key = response.get('LastEvaluatedKey', None)
        done = start_key is None
    
    print(f"Found {len(db_items)} profiles in DynamoDB.")
    
    # 2. Fetch Cognito Users
    print(f"Fetching Cognito Users (Pool: {USER_POOL_ID})...")
    cognito_users = get_all_cognito_users(cognito, USER_POOL_ID)
    print(f"Found {len(cognito_users)} users in Cognito.")
    
    # 3. Merge Data
    merged_data = []
    
    # Index Cognito by email for fast lookup
    cognito_map = {u['email']: u for u in cognito_users if u['email']}
    
    for db_item in db_items:
        email = db_item.get('email', 'Unknown')
        
        # Merge source: DB has priority for Name/Surname usually if user updated profile
        # But User asked for name/surname etc.
        
        # Subjects: Check 'selectedSubjects' (new) or 'subjects' (old)
        subjects = db_item.get('selectedSubjects', [])
        if not subjects:
            subjects = db_item.get('subjects', [])
            
        # Ensure subjects is a list
        if isinstance(subjects, set):
            subjects = list(subjects)
        elif not isinstance(subjects, list):
            subjects = []

        cog_data = cognito_map.get(email, {})
        
        user_record = {
            "name": db_item.get('name') or cog_data.get('cognito_name', ''),
            "surname": db_item.get('surname') or cog_data.get('cognito_surname', ''),
            "email": email,
            "grade": db_item.get('grade', ''),
            "province": db_item.get('province', ''), # if exists
            "enrolled_subjects": subjects,
            "curriculumIds": db_item.get('curriculumIds', [])
        }
        merged_data.append(user_record)
        
    # 4. Save to File
    output_file = "current_users_enrolments.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(merged_data, f, cls=DecimalEncoder, indent=2, ensure_ascii=False)
        
    print(f"\nUser data saved to {output_file}")

if __name__ == "__main__":
    dump_users_enrolments()
