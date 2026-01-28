import boto3
from botocore.config import Config
import json
import os
from decimal import Decimal

# AWS Configuration
AWS_PROFILE = os.environ.get("AWS_PROFILE", "capaciti")
AWS_REGION = os.environ.get("AWS_REGION", "af-south-1")

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_dynamodb_resource():
    session = boto3.Session(profile_name=AWS_PROFILE)
    config = Config(region_name=AWS_REGION)
    return session.resource('dynamodb', config=config)

def full_scan(table):
    response = table.scan()
    data = response['Items']
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        data.extend(response['Items'])
    return data

def dump_grade_11_math():
    dynamodb = get_dynamodb_resource()
    curriculum_id = "CAPS#11#Mathematics"
    
    # 1. Provide info
    print(f"Dumping data for Curriculum: {curriculum_id}")
    
    # 2. Get Topics using GSI
    # Since term is range key, we can query partition key only for equality
    topics_table = dynamodb.Table('Topics')
    
    # Actually, the GSI is `CurriculumTermIndex` -> PK: curriculumId (S), RK: term (N)
    # To get all topics regardless of term, we can query only PK?
    # boto3 query requires key condition. 
    # But since we have only 1 term effectively (Term 1 default in previous step), this is easy.
    # To be safe, let's just Scan and Filter or Query if we know terms.
    # Previous step set term=1 for all.
    # Let's try Query with KeyConditionExpression: curriculumId = :c
    # wait, Query requires RK if it is present? No, only PK requires equality. RK is optional for filtering/sorting.
    
    try:
        response = topics_table.query(
            IndexName='CurriculumTermIndex',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('curriculumId').eq(curriculum_id)
        )
        topics = response['Items']
    except Exception as e:
        print(f"Query failed ({e}), trying Scan...")
        topics = [item for item in full_scan(topics_table) if item.get('curriculumId') == curriculum_id]
    
    # Sort topics by orderIndex (though it's not GSI sorted unless we queried differently, orderIndex isn't in CurriculumTermIndex RK)
    # Oh wait, Topics table doesn't have orderIndex as RK.
    # We should sort in python.
    topics.sort(key=lambda x: x.get('orderIndex', 0))
    
    result_structure = {
        "curriculumId": curriculum_id,
        "grade": "11",
        "subject": "Mathematics",
        "topics": []
    }
    
    subtopics_table = dynamodb.Table('Subtopics')
    
    print(f"Found {len(topics)} topics.")
    
    for topic in topics:
        t_id = topic['topicId']
        t_name = topic.get('name', 'Unknown')
        
        # 3. Get Subtopics for this Topic
        # GSI: TopicOrderIndex -> PK: topicId, RK: orderIndex
        
        st_response = subtopics_table.query(
            IndexName='TopicOrderIndex',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('topicId').eq(t_id)
        )
        subtopics = st_response['Items']
        
        # They should come back sorted by orderIndex? Yes, DynamoDB sorts by RK.
        
        t_obj = {
            "topicId": t_id,
            "name": t_name,
            "subtopics": []
        }
        
        for st in subtopics:
            st_obj = {
                "subtopicId": st.get('subtopicId'),
                "number": st.get('number'),
                "title": st.get('title'),
                "context": st.get('context', []),
                "orderIndex": st.get('orderIndex')
            }
            t_obj["subtopics"].append(st_obj)
            
        result_structure["topics"].append(t_obj)
        print(f"  Topic '{t_name}' has {len(subtopics)} subtopics.")

    # 4. Save to File
    output_file = "grade_11_math_db_dump.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result_structure, f, cls=DecimalEncoder, indent=2, ensure_ascii=False)
        
    print(f"\nDump saved to {output_file}")

if __name__ == "__main__":
    dump_grade_11_math()
