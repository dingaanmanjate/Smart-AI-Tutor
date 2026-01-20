resource "aws_cognito_user_pool" "pool" {
  name = "smart-ai-tutor-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  mfa_configuration = "OFF"

  schema {
    attribute_data_type      = "String"
    name                     = "job_title"
    mutable                  = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  lambda_config {
    post_confirmation = aws_lambda_function.sync_user.arn
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "web-app-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  refresh_token_validity = 30
  access_token_validity  = 1
  id_token_validity      = 1

  token_validity_units {
    refresh_token = "days"
    access_token  = "hours"
    id_token      = "hours"
  }

  prevent_user_existence_errors = "ENABLED"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.pool.id
}

output "client_id" {
  value = aws_cognito_user_pool_client.client.id
}