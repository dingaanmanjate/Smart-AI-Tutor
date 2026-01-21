variable "gemini_api_key" {
  description = "The Gemini API Key (provide via terraform.tfvars or -var flag)"
  type        = string
  sensitive   = true
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "process_user.py"
  output_path = "process_user.zip"
}

# Build Gemini Lambda ensuring dependencies are packaged
resource "null_resource" "build_gemini_lambda" {
  triggers = {
    handler_hash = filebase64sha256("gemini_handler.py")
    req_hash     = filebase64sha256("requirements.txt")
    script_hash  = filebase64sha256("package_gemini.py")
  }

  provisioner "local-exec" {
    command = "python3 package_gemini.py"
  }
}

# Create the Lambda
resource "aws_lambda_function" "sync_user" {
  filename      = "process_user.zip"
  function_name = "PostConfirmationSync"
  role          = aws_iam_role.lambda_role.arn
  handler       = "process_user.lambda_handler"
  runtime       = "python3.12"

  memory_size = 512
  timeout     = 30
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = "production"
    }
  }
}

# Grant Cognito permission to run the Lambda
resource "aws_lambda_permission" "allow_cognito" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_user.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pool.arn
}

resource "aws_iam_role" "lambda_role" {
  name = "post_confirmation_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda_policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ]
      Effect   = "Allow"
      Resource = "*"
    },
    {
      Action = [
        "ssm:GetParameter"
      ]
      Effect   = "Allow"
      Resource = "arn:aws:ssm:*:*:parameter/smart-ai-tutor/*"
    }]
  })
}

data "archive_file" "profile_zip" {
  type        = "zip"
  source_file = "profile_handler.py"
  output_path = "profile_handler.zip"
}

resource "aws_lambda_function" "profile_api" {
  filename      = "profile_handler.zip"
  function_name = "ProfileAPI"
  role          = aws_iam_role.lambda_role.arn
  handler       = "profile_handler.lambda_handler"
  runtime       = "python3.12"
  memory_size   = 512
  timeout       = 30
  source_code_hash = data.archive_file.profile_zip.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = "production"
    }
  }
}

resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.profile_api.function_name
  principal     = "apigateway.amazonaws.com"
}

# API Gateway
resource "aws_api_gateway_rest_api" "tutor_api" {
  name = "TutorAPI"
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.tutor_api.id
  parent_id   = aws_api_gateway_rest_api.tutor_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy_method" {
  rest_api_id   = aws_api_gateway_rest_api.tutor_api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "root_method" {
  rest_api_id   = aws_api_gateway_rest_api.tutor_api.id
  resource_id   = aws_api_gateway_rest_api.tutor_api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "root_lambda" {
  rest_api_id = aws_api_gateway_rest_api.tutor_api.id
  resource_id = aws_api_gateway_rest_api.tutor_api.root_resource_id
  http_method = aws_api_gateway_method.root_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.profile_api.invoke_arn
}


resource "aws_api_gateway_integration" "lambda_proxy" {
  rest_api_id = aws_api_gateway_rest_api.tutor_api.id
  resource_id = aws_api_gateway_method.proxy_method.resource_id
  http_method = aws_api_gateway_method.proxy_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.profile_api.invoke_arn
}

resource "aws_api_gateway_deployment" "prod" {
  depends_on  = [aws_api_gateway_integration.lambda_proxy, aws_api_gateway_integration.root_lambda]
  rest_api_id = aws_api_gateway_rest_api.tutor_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy_method.id,
      aws_api_gateway_integration.lambda_proxy.id,
      aws_api_gateway_method.root_method.id,
      aws_api_gateway_integration.root_lambda.id,
    ]))
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.prod.id
  rest_api_id   = aws_api_gateway_rest_api.tutor_api.id
  stage_name    = "prod"
}

output "api_url" {
  value = "${aws_api_gateway_stage.prod.invoke_url}/"
}

# --- Gemini Streaming Lambda ---

resource "aws_lambda_function" "gemini_api" {
  depends_on    = [null_resource.build_gemini_lambda]
  filename      = "gemini_handler.zip"
  function_name = "GeminiStreamingAPI"
  role          = aws_iam_role.lambda_role.arn
  handler       = "gemini_handler.handler" # Mangum handler
  runtime       = "python3.12"
  memory_size   = 1024
  timeout       = 300 

  source_code_hash = base64encode(null_resource.build_gemini_lambda.id)

  environment {
    variables = {
      ENVIRONMENT    = "production"
      SSM_PARAMETER_NAME = "/smart-ai-tutor/gemini-api-key"
    }
  }
}

resource "aws_ssm_parameter" "gemini_key" {
  name  = "/smart-ai-tutor/gemini-api-key"
  type  = "SecureString"
  value = var.gemini_api_key
}

resource "aws_lambda_permission" "gemini_url_permission" {
  statement_id           = "AllowFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.gemini_api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_function_url" "gemini_url" {
  function_name      = aws_lambda_function.gemini_api.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["date", "keep-alive", "content-type", "authorization", "x-api-key"]
    expose_headers    = ["keep-alive", "date"]
    max_age           = 86400
  }
}

output "gemini_service_url" {
  value = aws_lambda_function_url.gemini_url.function_url
}

# Seed default data
resource "null_resource" "seed_data" {
  depends_on = [aws_dynamodb_table.subjects]

  provisioner "local-exec" {
    command = <<EOF
      aws --profile ${var.aws_profile} --region ${var.aws_region} dynamodb put-item --table-name Subjects --item '{"curriculum": {"S": "CAPS"}, "subjectName": {"S": "Mathematics"}, "studentCount": {"N": "145"}}'
      aws --profile ${var.aws_profile} --region ${var.aws_region} dynamodb put-item --table-name Subjects --item '{"curriculum": {"S": "CAPS"}, "subjectName": {"S": "Physical Science"}, "studentCount": {"N": "89"}}'
      aws --profile ${var.aws_profile} --region ${var.aws_region} dynamodb put-item --table-name Subjects --item '{"curriculum": {"S": "IEB"}, "subjectName": {"S": "Mathematics"}, "studentCount": {"N": "210"}}'
EOF
  }
}