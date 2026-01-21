import boto3
import json
import os
from decimal import Decimal

# Helper for JSON serialization of DynamoDB numbers
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
user_table = dynamodb.Table('UserProfiles')
subject_table = dynamodb.Table('Subjects')
lesson_table = dynamodb.Table('Lessons')

def lambda_handler(event, context):
    method = str(event.get('httpMethod', '')).upper()
    path = str(event.get('path', '')).lower()
    query_params = event.get('queryStringParameters') or {}
    
    if method == 'OPTIONS':
        return build_response(200, {"message": "CORS preflight successful"})
    
    # GET Profile
    if method == 'GET' and (path.endswith('/profile') or path == 'profile'):
        email = query_params.get('email')
        response = user_table.get_item(Key={'email': email})
        return build_response(200, response.get('Item', {}))

    # UPDATE Profile
    elif method == 'POST' and (path.endswith('/profile') or path == 'profile'):
        body = json.loads(event.get('body', '{}'))
        email = body.get('email')
        user_table.update_item(
            Key={'email': email},
            UpdateExpression="SET #n = :n, surname = :s, grade = :g, curriculum = :c",
            ExpressionAttributeNames={'#n': 'name'},
            ExpressionAttributeValues={
                ':n': body.get('name'),
                ':s': body.get('surname'),
                ':g': body.get('grade'),
                ':c': body.get('curriculum')
            }
        )
        return build_response(200, {"message": "Profile updated"})

    # GET Subjects for Curriculum
    elif method == 'GET' and (path.endswith('/subjects') or path == 'subjects'):
        curr = query_params.get('curriculum')
        response = subject_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('curriculum').eq(curr)
        )
        return build_response(200, response.get('Items', []))

    # GET Specific Subject Details
    elif method == 'GET' and (path.endswith('/subject-details') or path == 'subject-details'):
        curr = query_params.get('curriculum')
        subj = query_params.get('subjectName')
        response = subject_table.get_item(Key={'curriculum': curr, 'subjectName': subj})
        return build_response(200, response.get('Item', {}))

    # ADD Topic
    elif method == 'POST' and (path.endswith('/topics') or path == 'topics'):
        body = json.loads(event.get('body', '{}'))
        curr = body.get('curriculum')
        subj = body.get('subjectName')
        topic = {
            'term': body.get('term'),
            'topicName': body.get('topicName'),
            'description': body.get('description'),
            'id': f"topic_{event.get('requestContext', {}).get('requestId', 'manual')}_{body.get('topicName')[:10]}"
        }

        subject_table.update_item(
            Key={'curriculum': curr, 'subjectName': subj},
            UpdateExpression="SET topics = list_append(if_not_exists(topics, :empty_list), :t)",
            ExpressionAttributeValues={
                ':t': [topic],
                ':empty_list': []
            }
        )
        return build_response(200, {"message": "Topic added"})

    # ENROLL
    elif method == 'POST' and (path.endswith('/enroll') or path == 'enroll'):
        body = json.loads(event.get('body', '{}'))
        email = body.get('email')
        subj = body.get('subjectName')
        curr = body.get('curriculum')

        user_res = user_table.get_item(Key={'email': email})
        user = user_res.get('Item', {})
        if subj in user.get('subjects', []):
            return build_response(400, {"error": "Already enrolled in this subject"})

        user_table.update_item(
            Key={'email': email},
            UpdateExpression="SET subjects = list_append(if_not_exists(subjects, :empty_list), :s)",
            ExpressionAttributeValues={
                ':s': [subj],
                ':empty_list': []
            }
        )
        
        subject_table.update_item(
            Key={'curriculum': curr, 'subjectName': subj},
            UpdateExpression="ADD studentCount :inc",
            ExpressionAttributeValues={':inc': 1}
        )
        
        return build_response(200, {"message": "Enrolled successfully"})

    # LESSONS
    elif method == 'GET' and (path.endswith('/lessons') or path == 'lessons'):
        lesson_id = query_params.get('lessonId')
        if lesson_id:
            response = lesson_table.get_item(Key={'lessonId': lesson_id})
            return build_response(200, response.get('Item', {}))

        email = query_params.get('email')
        topic_id = query_params.get('topicId')
        response = lesson_table.query(
            IndexName='UserTopicIndex',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('email').eq(email) & boto3.dynamodb.conditions.Key('topicId').eq(topic_id)
        )
        return build_response(200, response.get('Items', []))

    # STATS - Include both quiz and assessment scores
    elif method == 'GET' and (path.endswith('/stats') or path == 'stats'):
        email = query_params.get('email')
        response = lesson_table.query(
            IndexName='UserTopicIndex',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('email').eq(email)
        )
        items = response.get('Items', [])
        
        stats = {}
        for item in items:
            subj = item.get('subjectName', 'General')
            if subj not in stats:
                stats[subj] = {'total': 0, 'count': 0}
            
            # Include quiz scores
            quiz_score = item.get('quizScore')
            if quiz_score is not None:
                stats[subj]['total'] += float(quiz_score)
                stats[subj]['count'] += 1
            
            # Include assessment scores
            assessment_score = item.get('assessmentScore')
            if assessment_score is not None:
                stats[subj]['total'] += float(assessment_score)
                stats[subj]['count'] += 1
        
        result = []
        for subj, data in stats.items():
            result.append({
                'subjectName': subj,
                'average': round(data['total'] / data['count'], 1) if data['count'] > 0 else 0
            })
        return build_response(200, result)

    # POST LESSONS
    elif method == 'POST' and ('/lessons/' in path):
        body = json.loads(event.get('body', '{}'))
        
        if path.endswith('/start'):
            lesson = {
                'lessonId': f"L_{os.urandom(4).hex()}",
                'email': body.get('email'),
                'topicId': body.get('topicId'),
                'subjectName': body.get('subjectName'),
                'status': 'teaching',
                'history': [{'role': 'ai', 'content': "Hello! I'm your AI tutor. Let's explore this topic together. What do you already know about it?"}]
            }
            lesson_table.put_item(Item=lesson)
            return build_response(200, lesson)

        elif path.endswith('/chat'):
            l_id = body.get('lessonId')
            user_msg = body.get('message')
            ai_response = body.get('aiResponse')
            
            messages = [{'role': 'user', 'content': user_msg}]
            if ai_response:
                messages.append({'role': 'ai', 'content': ai_response})
            
            lesson_table.update_item(
                Key={'lessonId': l_id},
                UpdateExpression="SET history = list_append(history, :m)",
                ExpressionAttributeValues={':m': messages}
            )
            return build_response(200, {"message": "Stored"})

        elif path.endswith('/finish'):
            # Mark lesson as finished with goodbye message
            l_id = body.get('lessonId')
            goodbye_msg = "Great work on this lesson! You've completed the teaching session. When you're ready, exit the chat and click 'TAKE TEST' to test your knowledge. Good luck! 🎓"
            
            lesson_table.update_item(
                Key={'lessonId': l_id},
                UpdateExpression="SET #s = :s, history = list_append(history, :m)",
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={
                    ':s': 'finished',
                    ':m': [{'role': 'ai', 'content': goodbye_msg}]
                }
            )
            return build_response(200, {"message": "Lesson finished", "goodbye": goodbye_msg})

        elif path.endswith('/complete'):
            l_id = body.get('lessonId')
            lesson_table.update_item(
                Key={'lessonId': l_id},
                UpdateExpression="SET #s = :s",
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={':s': 'completed'}
            )
            return build_response(200, {"message": "Lesson completed"})

        elif path.endswith('/score'):
            # Save assessment score
            l_id = body.get('lessonId')
            score = body.get('score')
            feedback = body.get('feedback', '')
            solution = body.get('solution', '')
            
            lesson_table.update_item(
                Key={'lessonId': l_id},
                UpdateExpression="SET assessmentScore = :s, assessmentFeedback = :f, assessmentSolution = :sol, #st = :st",
                ExpressionAttributeNames={'#st': 'status'},
                ExpressionAttributeValues={
                    ':s': Decimal(str(score)),
                    ':f': feedback,
                    ':sol': solution,
                    ':st': 'completed'
                }
            )
            return build_response(200, {"message": "Score saved"})

    return build_response(404, {"error": "Not Found"})

def build_response(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }
