import boto3
import sys
import os

EMAIL = "kamogelolethabo2001@gmail.com"
NEW_PASSWORD = "Password123!" 
REGION = "af-south-1"
PROFILE = "capaciti"

def reset_password():
    try:
        session = boto3.Session(profile_name=PROFILE, region_name=REGION)
        cognito = session.client('cognito-idp')
    except Exception as e:
        print(f"Failed to create session: {e}")
        # Fallback to default if profile fails
        session = boto3.Session(region_name=REGION)
        cognito = session.client('cognito-idp')

    # 1. List User Pools to find the right one
    print("Listing user pools...")
    try:
        pools = cognito.list_user_pools(MaxResults=10)
    except Exception as e:
        print(f"Error listing pools: {e}")
        return

    user_pool_id = None
    target_pool_id = "af-south-1_LWPYqAkNt" # From previous context
    
    found_pools = pools.get('UserPools', [])
    for p in found_pools:
        print(f"Found Pool: {p['Name']} ({p['Id']})")
        if p['Id'] == target_pool_id:
            user_pool_id = p['Id']
    
    if not user_pool_id:
        if found_pools:
            print(f"Target pool {target_pool_id} not found in list. Using first available: {found_pools[0]['Id']}")
            user_pool_id = found_pools[0]['Id']
        else:
            print("No user pools found.")
            return

    print(f"Using User Pool ID: {user_pool_id}")

    # 2. Find User
    print(f"Searching for user: {EMAIL}")
    try:
        response = cognito.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{EMAIL}"'
        )
    except Exception as e:
        print(f"Error listing users: {e}")
        return

    if not response['Users']:
        print(f"User with email {EMAIL} not found in pool {user_pool_id}.")
        return

    user = response['Users'][0]
    username = user['Username']
    print(f"Found user: {username} (Status: {user['UserStatus']})")

    # 3. Reset Password
    print(f"Resetting password to: {NEW_PASSWORD}")
    try:
        cognito.admin_set_user_password(
            UserPoolId=user_pool_id,
            Username=username,
            Password=NEW_PASSWORD,
            Permanent=True
        )
        print("Password reset successfully.")
    except Exception as e:
        print(f"Error resetting password: {e}")

if __name__ == "__main__":
    reset_password()
