resource "aws_dynamodb_table" "user_profiles" {
  name           = "UserProfiles"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "email" # Changed to email per request

  attribute {
    name = "email"
    type = "S"
  }

  tags = {
    Environment = "production"
  }
}

resource "aws_dynamodb_table" "subjects" {
  name           = "Subjects"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "curriculum"
  range_key      = "subjectName"

  attribute {
    name = "curriculum"
    type = "S"
  }

  attribute {
    name = "subjectName"
    type = "S"
  }

  tags = {
    Environment = "production"
  }
}
resource "aws_dynamodb_table" "lessons" {
  name           = "Lessons"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "lessonId"

  attribute {
    name = "lessonId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "topicId"
    type = "S"
  }

  global_secondary_index {
    name               = "UserTopicIndex"
    hash_key           = "email"
    range_key          = "topicId"
    projection_type    = "ALL"
  }

  tags = {
    Environment = "production"
  }
}
