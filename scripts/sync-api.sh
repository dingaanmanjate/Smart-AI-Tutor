#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( dirname "$SCRIPT_DIR" )"

# 1. Get the values from terraform output
pushd "$ROOT_DIR/terraform" > /dev/null
API_URL=$(terraform output -raw api_url)
GEMINI_URL=$(terraform output -raw gemini_service_url)
USER_POOL_ID=$(terraform output -raw user_pool_id)
CLIENT_ID=$(terraform output -raw client_id)
S3_BUCKET=$(terraform output -raw s3_bucket_name)
DIST_ID=$(terraform output -raw cloudfront_distribution_id)
popd > /dev/null

if [ -z "$API_URL" ] || [ "$API_URL" == "null" ]; then
  echo "Error: Could not find outputs in terraform."
  exit 1
fi

# 2. Update the constants in src/config/constants.ts
GEMINI_URL_CLEAN=${GEMINI_URL%/}
API_URL_CLEAN=${API_URL%/}

cat <<EOF > "$ROOT_DIR/frontend/src/config/constants.ts"
export const API_BASE = "$API_URL_CLEAN";
export const GEMINI_API_URL = "$GEMINI_URL_CLEAN";
export const COGNITO_USER_POOL_ID = "$USER_POOL_ID";
export const COGNITO_CLIENT_ID = "$CLIENT_ID";
EOF

echo "✅ Frontend constants synchronized with Terraform outputs."

# 3. Build the Qwik Application
pushd "$ROOT_DIR/frontend" > /dev/null
echo "📦 Installing frontend dependencies..."
npm install --silent
echo "🏗 Building Qwik SSG application..."
npm run build
popd > /dev/null

# 4. Sync to S3
if [ ! -z "$S3_BUCKET" ] && [ "$S3_BUCKET" != "null" ]; then
    echo "🚀 Syncing build output to S3..."
    # Qwik SSG output is in dist/
    aws s3 sync "$ROOT_DIR/frontend/dist" s3://$S3_BUCKET \
        --profile capaciti \
        --delete
    echo "✅ S3 Sync Complete."

    if [ ! -z "$DIST_ID" ] && [ "$DIST_ID" != "null" ]; then
        echo "🧹 Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$DIST_ID" \
            --paths "/*" \
            --profile capaciti > /dev/null
        echo "✅ CloudFront Invalidation Started."
    fi
else
    echo "⚠️  S3 Bucket not found, skipping sync."
fi
