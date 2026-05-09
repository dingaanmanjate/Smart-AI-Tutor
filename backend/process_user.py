import boto3
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('UserProfiles')

def lambda_handler(event, context):
    user_attrs = event.get('request', {}).get('userAttributes', {})
    email = user_attrs.get('email')
    
    if not email:
        return event

    table.put_item(
        Item={
            'email': email,
            'userId': event.get('userName'),
            'job_title': user_attrs.get('custom:job_title', 'Learner'),
            'name': '',
            'surname': '',
            'grade': '',
            'curriculum': 'CAPS', # Default
            'subjects': []
        }
    )
    return event