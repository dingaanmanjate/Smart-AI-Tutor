variable "aws_profile" {
  description = "AWS CLI profile to use"
  default     = "capaciti"
}

variable "aws_region" {
  description = "AWS region to deploy to"
  default     = "af-south-1"
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}