# SPECTRUM AI Tutor

> **A secure, serverless AI-powered learning management platform built with security-first principles.**

SPECTRUM AI Tutor is a high-performance, 100% serverless educational platform that leverages Google's Gemini AI for real-time, personalized tutoring. It combines enterprise-grade AWS security with an intuitive learning experience.

---

## 🔐 Security Architecture (Best Practices)

Security is the cornerstone of this application. Every layer—from authentication to data storage—implements AWS-recommended best practices.

### 1. Secret Management (Zero Hardcoding)

| Principle | Implementation |
| :--- | :--- |
| **No Secrets in Code** | The Gemini API key is **never** stored in source code. It's securely held in **AWS Systems Manager Parameter Store** as a `SecureString`. |
| **Runtime Retrieval** | The Lambda function fetches the key at runtime using `ssm.get_parameter(WithDecryption=True)`, decrypting it only when needed. |
| **IAM Scoped Access** | The Lambda execution role has a tightly scoped policy granting access *only* to `/smart-ai-tutor/*` parameters. |

```terraform
# Secure parameter storage (lambda.tf)
resource "aws_ssm_parameter" "gemini_key" {
  name  = "/smart-ai-tutor/gemini-api-key"
  type  = "SecureString"            # Encrypted at rest with AWS KMS
  value = var.gemini_api_key        # Injected via terraform.tfvars (gitignored)
}
```

### 2. Authentication & Authorization

The application uses **AWS Cognito** for user identity, configured with enterprise-grade policies:

| Security Feature | Configuration |
| :--- | :--- |
| **Strong Password Policy** | Min 12 chars, requires uppercase, lowercase, numbers, AND symbols |
| **Email Verification** | Mandatory email confirmation via one-time code before account activation |
| **Token Expiration** | Access tokens expire in **1 hour**; ID tokens in **1 hour**; Refresh tokens in **30 days** |
| **User Existence Errors** | `prevent_user_existence_errors = "ENABLED"` - Attackers cannot enumerate valid emails |
| **Role-Based Access Control** | `custom:job_title` attribute separates Learners from Tutors; verified on every login |

```javascript
// Role verification at login (auth.js)
if (userJob !== selectedJob) {
    cognitoUser.signOut();
    return alert(`Access Denied`);
}
```

### 3. Infrastructure Security (Terraform IaC)

- **No Hardcoded Credentials**: AWS access relies on named profiles (e.g., `capaciti`), not embedded access keys.
- **Least Privilege IAM**: Lambda roles are granted the minimum permissions required (DynamoDB CRUD, SSM read).
- **Environment Parity**: All infrastructure is defined as code, ensuring consistent and auditable deployments.

### 4. Data Protection

- **DynamoDB On-Demand**: Pay-per-request mode eliminates over-provisioning while maintaining encryption at rest by default.
- **Client-Agnostic CORS**: API Gateway and Lambda Function URLs are configured with explicit CORS headers.

---

## 🏗 System Architecture

```mermaid
graph TD
    User([User / Browser]) -->|Static Assets| S3[Amazon S3 / CloudFront]
    User -->|Sign-up/Login| Cognito{AWS Cognito}
    User -->|API Requests| APIGateway[AWS API Gateway]
    User -->|AI Streaming| GeminiLambda[Gemini Lambda URL]
    APIGateway -->|Proxies to| ProfileLambda[Profile API Lambda]
    ProfileLambda -->|Reads/Writes| DynamoDB[(Amazon DynamoDB)]
    GeminiLambda -->|Reads/Writes| DynamoDB
    GeminiLambda -->|Fetches Secret| SSM[AWS SSM Parameter Store]
    Cognito -->|Post-Confirmation Trigger| SyncLambda[Sync User Lambda]
    SyncLambda -->|Creates Profile| DynamoDB
```

### Resource Communication Flow

1.  **Identity**: Users authenticate via **AWS Cognito**. Upon successful sign-up, a **Post-Confirmation Lambda** trigger automatically initializes their profile in DynamoDB.
2.  **Profile & Data**: The **Profile API Lambda** handles all CRUD operations for user profiles, subjects, lessons, and enrollments via **API Gateway**.
3.  **AI Tutoring**: The **Gemini Lambda** (FastAPI + Mangum) provides real-time streaming chat, quiz generation, and assessment grading via a **Lambda Function URL**.
4.  **Storage**: **Amazon DynamoDB** (3 tables: `UserProfiles`, `Subjects`, `Lessons`) serves as the persistent NoSQL data layer.

---

## ✨ Application Features

### ATP Curriculum Integration (NEW)

The platform now integrates **69 official CAPS Annual Teaching Plans** covering Grades 7-12 across all major subjects.

| Feature | Description |
| :--- | :--- |
| **Read-Only ATP** | Standardized CAPS curriculum - learners cannot create custom topics |
| **Term-Based Navigation** | Topics organized by term (1-4) for easy browsing |
| **Context-Aware AI** | Gemini receives topic context as system prompt for better tutoring |
| **Learning Objectives** | Each lesson starts with clear objectives and focus questions |

**Data Statistics:**
- 128 curriculum entries (subject + grade combinations)
- 975 topics with term assignments
- Covers Mathematics, Sciences, Languages, Commerce, and Technical subjects

### AI-Powered Learning

| Feature | Description | Endpoint |
| :--- | :--- | :--- |
| **Real-Time AI Chat** | Gemini 2.5 Flash provides streaming, context-aware tutoring | `POST /chat-stream` |
| **CAPS-Aligned Teaching** | AI uses South African context and introduces key definitions naturally | (via system prompt) |
| **Multimodal Input** | Learners can attach images (e.g., a photo of a problem) for AI analysis | (via chat) |
| **Quiz Generation** | AI generates a 5-question MCQ quiz based on the lesson conversation | `POST /generate-quiz` |
| **Automated Grading** | AI grades quiz attempts and provides detailed feedback | `POST /grade-quiz` |
| **Session Persistence** | Chat history is stored in DynamoDB, eliminating "AI amnesia" across sessions | (automatic) |

### User Management

| Feature | Description | Endpoint |
| :--- | :--- | :--- |
| **Profile Management** | Learners set name, surname, grade, and curriculum (CAPS/IEB) | `GET/POST /profile` |
| **Subject Enrollment** | Browse available subjects and enroll with a single click | `POST /enroll` |
| **ATP Subjects by Grade** | Fetch available ATP subjects for a specific grade | `GET /curriculum` |
| **ATP Topics** | Fetch topics by curriculum ID, sorted by term | `GET /curriculum/topics` |
| **Learning Statistics** | Aggregate quiz scores per subject to track progress | `GET /stats` |

### Lesson Lifecycle

| Feature | Description | Endpoint |
| :--- | :--- | :--- |
| **Start Lesson** | Creates lesson with ATP context, welcome message, and learning objectives | `POST /lessons/start` |
| **Chat & Learn** | Persist user messages during the AI conversation | `POST /lessons/chat` |
| **Finish Lesson** | Marks lesson ready for assessment | `POST /lessons/finish` |
| **Complete Lesson** | Marks lesson as fully completed | `POST /lessons/complete` |
| **Review Past Lessons** | Fetch completed lessons by topic or individual lesson ID | `GET /lessons` |

### Frontend Capabilities

- **WhatsApp-Style Chat UI**: Modern, responsive chat interface with message bubbles and typing indicators.
- **Voice Input**: Speech-to-text via Web Speech API for hands-free learning.
- **Dark Mode Dashboard**: Sleek, modern learner dashboard with circular navigation and stat cards.
- **Role Selection**: Learner/Tutor toggle at login with appropriate access restrictions.

---

## 🚧 Challenges Faced (Engineering Journey)

### 1. The "Deleted URL" Incident
**Issue:** During aggressive debugging of a 403 Forbidden error on the streaming endpoint, the Lambda Function URL was manually deleted and recreated via CLI. This generated a completely new URL (`wzbegjfl...`), but the frontend (`app.js`) remained hardcoded to the old, now deleted URL (`de7hbdd...`).
**Resolution:** This mismatch caused persistent 403 errors (Resource Not Found on the old URL), mistakenly attributed to IAM permissions. The fix involved manually updating the frontend with the active URL and implementing a more robust sync script (`sync-api.sh`) to automate this link.

### 2. Streaming vs. Buffer
**Issue:** Enabling `RESPONSE_STREAM` invoke mode for real-time AI responses caused friction with the `Mangum` ASGI adapter on AWS Lambda.
**Resolution:** We confirmed that proper streaming requires specific configuration in both Terraform (`invoke_mode = "RESPONSE_STREAM"`) and the Lambda handler. The debugging process involved isolating the issue by toggling between `BUFFERED` and `RESPONSE_STREAM` modes to differentiate between configuration errors and permission errors.

### 3. Model Versioning (2026 Context)
**Issue:** The codebase initially referenced `gemini-1.5-flash`, which was outdated for the current (2026) context, leading to potential "Model Not Found" exceptions.
**Resolution:** Updated all backend handlers to use the standardized `gemini-2.5-flash` model.

---

## 🔮 Future Improvements

### 1. VPC Integration for Enhanced Security
Currently, our Lambda functions run in the default Lambda VPC (public internet access). To enhance security, especially for enterprise deployments:
- **Private Subnets:** Move Lambdas into a private subnet within a custom VPC.
- **VPC Endpoints:** Use VPC Endpoints (PrivateLink) to securely access DynamoDB, S3, and SSM without traffic effectively traversing the public internet.
- **NAT Gateway:** Deploy a NAT Gateway to allow the private Lambdas to still reach the external Gemini API while remaining unaddressable from the outside world.

### 2. Advanced Analytics
- Implement QuickSight dashboards drawing from DynamoDB streams to give educators deep insights into learner performance across the entire ATP curriculum.

### 3. Offline Support
- Implement PWA (Progressive Web App) features with local caching to support learners with intermittent internet connectivity.

---

## 💰 AWS Cost Breakdown (Free Tier Optimized)

All services are configured to stay within AWS Free Tier limits for typical usage:

| Service | Component | Free Tier Limit | Estimated Cost ($/mo) |
| :--- | :--- | :--- | :--- |
| **Cognito** | User Pool | 50,000 MAUs | **$0.00** |
| **Lambda** | Logic Processing | 1 Million requests / mo | **$0.00** |
| **DynamoDB** | Data Storage | 25 GB Storage, 25 WCU/RCU | **$0.00** |
| **API Gateway** | HTTP/REST API | 1 Million calls / mo | **$0.00** |
| **SSM Parameter Store** | Secret Storage | 10,000 standard parameters | **$0.00** |
| **S3/CloudFront** | Hosting | 1 TB Data Transfer Out | **$0.00** |

---

## 🚀 Deployment Guide

### Prerequisites

- AWS CLI configured with a profile (e.g., `default` or `capaciti`)
- Terraform >= 1.0
- Python 3.12
- A valid **Gemini API Key** from Google AI Studio

### 1. Clone and Configure Secrets

```bash
git clone https://github.com/dingaanmanjate/Smart-AI-Tutor.git
cd Smart-AI-Tutor

# Create your secrets file (NEVER commit this)
echo 'gemini_api_key = "YOUR_GEMINI_API_KEY"' > terraform.tfvars
echo 'aws_profile = "your-profile-name"' >> terraform.tfvars
echo 'aws_region = "af-south-1"' >> terraform.tfvars
```

### 2. Deploy Infrastructure

```bash
terraform init
terraform apply
```

### 3. Sync Frontend Configuration

After deployment, update the frontend with the generated API endpoints:

```bash
./sync-api.sh
```

### 4. Serve Locally

Open `index.html` in a browser or use a local HTTP server:

```bash
python3 -m http.server 8888
# Navigate to http://localhost:8888
```

---

## 📁 Project Structure

```
Smart-AI-Tutor/
├── index.html              # Login page
├── dashboard.html          # Learner dashboard
├── subject-portal.html     # ATP subject portal (read-only topics)
├── chat-room.html          # AI chat interface
├── assessment.html         # Test/assessment page
├── style.css               # UI styles (dark theme)
├── app.js                  # Core frontend logic
├── auth.js                 # Cognito authentication
│
├── gemini_handler.py       # AI streaming Lambda (FastAPI + ATP context)
├── profile_handler.py      # Profile/Subjects/Lessons/Curriculum Lambda
├── process_user.py         # Cognito post-confirmation sync
│
├── atp_parser.py           # Extracts curriculum from PPTX files
├── seed_curriculum.py      # Seeds DynamoDB with ATP data
│
├── cognito.tf              # Cognito User Pool config
├── lambda.tf               # Lambda + API Gateway + SSM
├── dynamo.tf               # DynamoDB tables (6 tables)
├── frontend.tf             # S3/CloudFront
├── providers.tf            # AWS provider config
│
├── sync-api.sh             # Script to inject API URLs
├── package_gemini.py       # Builds Gemini Lambda zip
├── requirements.txt        # Python dependencies
└── .gitignore              # Excludes secrets, .terraform, etc.
```

### DynamoDB Tables

| Table | Purpose |
| :--- | :--- |
| `UserProfiles` | Learner profiles (email, name, grade, subjects) |
| `Subjects` | Subject metadata and enrollments |
| `Lessons` | Lesson history, scores, and ATP context |
| `Curriculum` | ATP subject + grade combinations |
| `Topics` | ATP topics with term and context |
| `Subtopics` | Detailed subtopics (future use) |

---

## 🛡️ Security Checklist (Implemented)

- [x] Passwords require 12+ characters with mixed case, numbers, and symbols
- [x] Email verification required before account activation
- [x] API keys stored in SSM Parameter Store (SecureString)
- [x] Lambda IAM roles follow least-privilege principle
- [x] No secrets or credentials in source code
- [x] Terraform state excluded from version control
- [x] User enumeration protection enabled on Cognito
- [x] Short-lived access tokens (1 hour expiry)
- [x] CORS explicitly configured per endpoint

---

**SPECTRUM AI Tutor** — *Secure, Scalable, and Serverless.*
