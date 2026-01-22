import os
import json
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from mangum import Mangum
import boto3

# --- Lazy Configuration ---
GEMINI_CONFIGURED = False

# AWS Services
dynamodb = boto3.resource('dynamodb')
lesson_table = dynamodb.Table('Lessons')
topics_table = dynamodb.Table('Topics')

def ensure_config():
    global GEMINI_CONFIGURED
    if not GEMINI_CONFIGURED:
        param_name = os.environ.get("SSM_PARAMETER_NAME", "/smart-ai-tutor/gemini-api-key")
        try:
            ssm = boto3.client('ssm')
            response = ssm.get_parameter(Name=param_name, WithDecryption=True)
            key = response['Parameter']['Value']
            genai.configure(api_key=key)
            GEMINI_CONFIGURED = True
            print("INFO: Gemini Configured Successfully.")
        except Exception as e:
            print(f"ERROR: Failed to configure Gemini. {e}")
            raise e

app = FastAPI()

# Enable CORS
# CORS is handled by AWS Lambda Function URL configuration
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"], 
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

@app.get("/")
async def root():
    return {"status": "ok", "message": "Gemini Streaming API is live"}

# --- Memory-Efficient Session Handling ---
sessions = {}

def get_chat_session(session_id: str, history=None, system_instruction=None):
    ensure_config()
    if session_id not in sessions:
        model = genai.GenerativeModel(
            'gemini-2.0-flash',
            system_instruction=system_instruction
        )
        formatted_history = history or []
        sessions[session_id] = model.start_chat(history=formatted_history)
    return sessions[session_id]

@app.post("/chat-stream")
async def chat_stream(request: Request):
    try:
        data = await request.json()
        user_message = data.get("message")
        lesson_id = data.get("lesson_id")
        
        if not user_message or not lesson_id:
            raise HTTPException(status_code=400, detail="message and lesson_id are required")

        # Persistence: Solve the 'Amnesia' failure
        db_history = []
        topic_context = ""
        topic_name = ""
        subject_name = ""
        grade = ""
        
        if lesson_id not in sessions:
            res = lesson_table.get_item(Key={'lessonId': lesson_id})
            item = res.get('Item', {})
            raw_history = item.get('history', [])
            topic_context = item.get('topicContext', '')
            topic_name = item.get('topicName', '')
            subject_name = item.get('subjectName', '')
            grade = item.get('grade', '')
            
            for h in raw_history:
                role = 'user' if h['role'] == 'user' else 'model'
                db_history.append({'role': role, 'parts': [h['content']]})
        
        # Build ATP-aware system instruction
        system_instruction = f"""You are a South African CAPS-aligned AI tutor teaching {subject_name} to Grade {grade} learners.

CURRENT TOPIC: {topic_name}

TEACHING CONTEXT:
{topic_context}

TEACHING APPROACH:
1. Be warm, encouraging, and patient with learners
2. Use examples relevant to South African context when possible
3. Introduce key definitions naturally as concepts come up
4. Break down complex concepts into digestible parts
5. Ask follow-up questions to check understanding
6. Suggest related topics when appropriate for enrichment
7. Use proper formatting: **bold** for emphasis, bullet points for lists
8. For math/science, use LaTeX notation ($inline$ or $$block$$)

Remember: Your goal is to help the learner truly understand, not just memorize."""

        chat = get_chat_session(lesson_id, history=db_history, system_instruction=system_instruction)
        
        message_parts = [user_message]
        image_data = data.get("image")
        if image_data:
            import base64
            if "," in image_data:
                image_data = image_data.split(",")[1]
            
            message_parts.append({
                "mime_type": "image/jpeg",
                "data": base64.b64decode(image_data)
            })

        async def generate():
            full_ai_response = ""  # Accumulate full response for DB storage
            try:
                # 1. Connection established probe
                yield f"data: {json.dumps({'text': 'Reflecting...'})}\n\n"
                await asyncio.sleep(0.1)

                # Gemini 1.5 Flash supports streaming
                response = chat.send_message(message_parts, stream=True)
                for chunk in response:
                    try:
                        if chunk.text:
                            full_ai_response += chunk.text  # Accumulate
                            yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                            await asyncio.sleep(0.01) # Small buffer
                    except ValueError:
                        # Safety filter blocked this chunk
                        msg = " [Content Blocked by Safety Filters] "
                        full_ai_response += msg
                        yield f"data: {json.dumps({'text': msg})}\n\n"
                
                # Sync back to DynamoDB with FULL AI response
                try:
                    new_msgs = [
                        {'role': 'user', 'content': user_message + (" [Image Attached]" if image_data else "")},
                        {'role': 'ai', 'content': full_ai_response}  # Save full response
                    ]
                    lesson_table.update_item(
                        Key={'lessonId': lesson_id},
                        UpdateExpression="SET history = list_append(if_not_exists(history, :empty), :m)",
                        ExpressionAttributeValues={':m': new_msgs, ':empty': []}
                    )
                except Exception as db_err:
                     print(f"DB Error: {db_err}")

                yield "data: [DONE]\n\n"

            except Exception as e:
                print(f"Stream Critical Error: {e}")
                import traceback
                trace = traceback.format_exc()
                
                # Probe available models
                model_list_str = "Could not list models."
                try:
                    models = []
                    for m in genai.list_models():
                        if 'generateContent' in m.supported_generation_methods:
                            models.append(m.name)
                    model_list_str = "\\n".join(models)
                except Exception as list_err:
                    model_list_str = f"List failed: {list_err}"

                # Yield the actual error to the client for debugging
                yield f"data: {json.dumps({'text': f' [Error: {str(e)}] \\n\\n--- AVAILABLE MODELS ---\\n{model_list_str}'})}\n\n"
                yield f"data: {json.dumps({'debug': trace})}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")
    except Exception as e:
        print(f"API Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate-quiz")
async def generate_quiz(request: Request):
    ensure_config()
    try:
        data = await request.json()
        lesson_id = data.get("lesson_id")
        
        res = lesson_table.get_item(Key={'lessonId': lesson_id})
        item = res.get('Item', {})
        history = item.get('history', [])
        
        context = "\n".join([f"{h['role']}: {h['content']}" for h in history])
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        Based on the following lesson conversation, generate a 5-question multiple choice quiz.
        Return ONLY a JSON array of objects with the following structure:
        {{
            "id": "q1",
            "question": "...",
            "options": ["...", "...", "...", "..."],
            "correctAnswer": 0
        }}
        
        Context:
        {context}
        """
        
        response = model.generate_content(prompt)
        json_text = response.text.strip()
        if json_text.startswith("```json"):
            json_text = json_text[7:-3].strip()
        elif json_text.startswith("```"):
            json_text = json_text[3:-3].strip()
            
        quiz = json.loads(json_text)
        return {"quiz": quiz}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/grade-quiz")
async def grade_quiz(request: Request):
    ensure_config()
    try:
        data = await request.json()
        lesson_id = data.get("lesson_id")
        answers = data.get("answers")
        quiz = data.get("quiz")
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        Grade this quiz attempt.
        Original Quiz: {json.dumps(quiz)}
        User Answers: {json.dumps(answers)}
        
        Return a JSON object:
        {{
            "score": number (0-100),
            "feedback": "...",
            "detailedAnalysis": "..."
        }}
        """
        
        response = model.generate_content(prompt)
        json_text = response.text.strip()
        if json_text.startswith("```json"):
            json_text = json_text[7:-3].strip()
        
        result = json.loads(json_text)
        
        lesson_table.update_item(
            Key={'lessonId': lesson_id},
            UpdateExpression="SET quizScore = :s, quizResult = :r",
            ExpressionAttributeValues={
                ':s': result['score'],
                ':r': result
            }
        )
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate-test")
async def generate_test(request: Request):
    """Generate a structured test based on lesson conversation"""
    ensure_config()
    try:
        data = await request.json()
        lesson_id = data.get("lesson_id")
        
        res = lesson_table.get_item(Key={'lessonId': lesson_id})
        item = res.get('Item', {})
        history = item.get('history', [])
        subject_name = item.get('subjectName', 'General')
        
        context = "\n".join([f"{h['role']}: {h['content']}" for h in history])
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        Based on the following {subject_name} lesson conversation, generate a structured test.
        
        Create 3 questions that test understanding of the concepts discussed.
        For Mathematics/Science subjects, include equations using LaTeX format (wrap in $ for inline, $$ for block).
        
        Return ONLY a JSON object with this structure:
        {{
            "subject": "{subject_name}",
            "questions": [
                {{
                    "id": "q1",
                    "question": "Question text with $LaTeX$ if needed",
                    "type": "open_ended",
                    "marks": 10,
                    "expectedAnswer": "The model answer with proper formatting and $equations$ if applicable"
                }}
            ],
            "totalMarks": 30,
            "instructions": "Answer all questions. Show your working where applicable."
        }}
        
        Context:
        {context}
        """
        
        response = model.generate_content(prompt)
        
        # Robust JSON extraction using Regex
        import re
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            json_text = match.group(0)
            test = json.loads(json_text)
        else:
             raise ValueError(f"No JSON found in response: {response.text}")
        
        # Store test in lesson record
        lesson_table.update_item(
            Key={'lessonId': lesson_id},
            UpdateExpression="SET generatedTest = :t",
            ExpressionAttributeValues={':t': test}
        )
        
        return {"test": test}
    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={"error": str(e), "trace": traceback.format_exc()})

@app.post("/grade-image")
async def grade_image(request: Request):
    """Grade student's uploaded work using Gemini Vision"""
    ensure_config()
    try:
        import base64
        data = await request.json()
        lesson_id = data.get("lesson_id")
        image_data = data.get("image")
        
        if not image_data:
            raise HTTPException(status_code=400, detail="Image is required")
        
        # Get lesson context and test
        res = lesson_table.get_item(Key={'lessonId': lesson_id})
        item = res.get('Item', {})
        subject_name = item.get('subjectName', 'General')
        test = item.get('generatedTest', {})
        
        # Prepare image for Gemini
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        image_bytes = base64.b64decode(image_data)
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        You are grading a {{subject_name}} test. Analyze this student's handwritten/typed work.
        
        The test questions were:
        {{json.dumps(test.get('questions', []), indent=2)}}
        
        Total marks: {{test.get('totalMarks', 30)}}
        
        Please:
        1. Identify each answer the student provided
        2. Compare with expected answers
        3. Award marks fairly
        4. Provide constructive feedback
        
        Return ONLY a JSON object:
        {{
            "score": number (0-100 percentage),
            "marksAwarded": number,
            "totalMarks": number,
            "feedback": "Overall feedback on performance",
            "questionResults": [
                {{
                    "questionId": "q1",
                    "marksAwarded": number,
                    "marksAvailable": number,
                    "feedback": "Specific feedback for this question"
                }}
            ],
            "modelSolution": "Complete worked solution with proper formatting using $LaTeX$ for equations"
        }}
        """
        
        response = model.generate_content([
            prompt,
            {"mime_type": "image/jpeg", "data": image_bytes}
        ])
        
        import re
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            json_text = match.group(0)
            result = json.loads(json_text)
        else:
             raise ValueError(f"No JSON found in response: {response.text}")
        
        # Save score to lesson
        lesson_table.update_item(
        # ... logic continues
            Key={'lessonId': lesson_id},
            UpdateExpression="SET assessmentScore = :s, assessmentResult = :r, #st = :st",
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={
                ':s': result['score'],
                ':r': result,
                ':st': 'completed'
            }
        )
        
        return result
    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={"error": str(e), "trace": traceback.format_exc()})

# Bridge for AWS Lambda
handler = Mangum(app, lifespan="off")

