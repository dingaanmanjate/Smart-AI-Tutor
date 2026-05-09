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

# =============================================================================
# ATP CURRICULUM TABLES
# =============================================================================

resource "aws_dynamodb_table" "curriculum" {
  name           = "Curriculum"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "curriculumId"

  attribute {
    name = "curriculumId"
    type = "S"
  }

  attribute {
    name = "subjectName"
    type = "S"
  }

  attribute {
    name = "grade"
    type = "S"
  }

  global_secondary_index {
    name               = "SubjectGradeIndex"
    hash_key           = "grade"
    range_key          = "subjectName"
    projection_type    = "ALL"
  }

  tags = {
    Environment = "production"
  }
}

resource "aws_dynamodb_table" "topics" {
  name           = "Topics"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "topicId"

  attribute {
    name = "topicId"
    type = "S"
  }

  attribute {
    name = "curriculumId"
    type = "S"
  }

  attribute {
    name = "term"
    type = "N"
  }

  global_secondary_index {
    name               = "CurriculumTermIndex"
    hash_key           = "curriculumId"
    range_key          = "term"
    projection_type    = "ALL"
  }

  tags = {
    Environment = "production"
  }
}

resource "aws_dynamodb_table" "subtopics" {
  name           = "Subtopics"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "subtopicId"

  attribute {
    name = "subtopicId"
    type = "S"
  }

  attribute {
    name = "topicId"
    type = "S"
  }

  attribute {
    name = "orderIndex"
    type = "N"
  }

  global_secondary_index {
    name               = "TopicOrderIndex"
    hash_key           = "topicId"
    range_key          = "orderIndex"
    projection_type    = "ALL"
  }

  tags = {
    Environment = "production"
  }
}
