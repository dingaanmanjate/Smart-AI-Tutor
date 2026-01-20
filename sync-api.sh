#!/bin/bash

# 1. Get the values from terraform output
API_URL=$(terraform output -raw api_url)
GEMINI_URL=$(terraform output -raw gemini_service_url)
USER_POOL_ID=$(terraform output -raw user_pool_id)
CLIENT_ID=$(terraform output -raw client_id)
S3_BUCKET=$(terraform output -raw s3_bucket_name)

if [ -z "$API_URL" ] || [ "$API_URL" == "null" ]; then
  echo "Error: Could not find outputs in terraform."
  exit 1
fi

# 2. Update the API_BASE and GEMINI_API_URL constants in app.js
# Remove trailing slash from GEMINI_URL if present
GEMINI_URL_CLEAN=${GEMINI_URL%/}
sed -i "s|const API_BASE = \".*\";|const API_BASE = \"$API_URL\";|" app.js
sed -i "s|const GEMINI_API_URL = \".*\";|const GEMINI_API_URL = \"$GEMINI_URL_CLEAN/\";|" app.js

# 3. Update poolData in auth.js
sed -i "s|UserPoolId: '.*'|UserPoolId: '$USER_POOL_ID'|" auth.js
sed -i "s|ClientId: '.*'|ClientId: '$CLIENT_ID'|" auth.js

# 4. Handle Cognito Endpoint (PRODUCTION: undefined)
sed -i "s|endpoint: '.*'|endpoint: undefined|" auth.js

echo "✅ Frontend synchronized with Terraform outputs."
echo "   - API_URL: $API_URL"
echo "   - Gemini Service URL: $GEMINI_URL"
echo "   - UserPool: $USER_POOL_ID"
echo "   - ClientId: $CLIENT_ID"
echo "   - S3 Bucket: $S3_BUCKET"

# 5. Sync to S3
if [ ! -z "$S3_BUCKET" ] && [ "$S3_BUCKET" != "null" ]; then
    echo "🚀 Syncing files to S3..."
    aws s3 sync . s3://$S3_BUCKET \
        --profile capaciti \
        --exclude ".git/*" \
        --exclude ".venv/*" \
        --exclude ".terraform/*" \
        --exclude "*.tf" \
        --exclude "*.tfstate*" \
        --exclude "*.hcl" \
        --exclude "*.zip" \
        --exclude "venv/*" \
        --exclude "__pycache__/*" \
        --exclude "*.py" \
        --exclude "requirements.txt" \
        --exclude "gemini_build/*" \
        --exclude "README.md" \
        --exclude "sync-api.sh" \
        --exclude "task.md" \
        --exclude "node_modules/*" \
        --delete
    echo "✅ S3 Sync Complete."
else
    echo "⚠️  S3 Bucket not found, skipping sync."
fi
