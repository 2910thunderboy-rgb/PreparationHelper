import os
import re
import shutil
import tempfile
import requests
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Configure Gemini AI - with error handling for missing key
api_key = os.getenv("GOOGLE_API_KEY")
if api_key and api_key != "your_google_gemini_api_key_here":
    genai.configure(api_key=api_key)
else:
    print("WARNING: GOOGLE_API_KEY not set in .env - resume analysis will fail")

# Initialize FastAPI app
app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)


# ---------- Resume Analysis Logic ----------

def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print("PDFPlumber error:", e)

    if not text.strip():
        images = convert_from_path(pdf_path)
        for image in images:
            text += pytesseract.image_to_string(image) + "\n"

    return text.strip()

def clean_gemini_output(text):
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"[*•📚⚠️💼✅🔹🔸📊🛠️📝⬇️🚀🔍]+", "", text)
    text = re.sub(r"#+\s?", "", text)
    text = re.sub(r"[-–—]{1,3}\s?", "", text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    return text.strip()

def get_available_model():
    """Dynamically find the best available Gemini model for generateContent"""
    try:
        models = genai.list_models()
        # Filter models that support generateContent
        available_models = []
        for m in models:
            if "generateContent" in m.supported_generation_methods:
                available_models.append(m.name.replace("models/", ""))
        
        if available_models:
            print(f"Available Gemini models: {available_models}")
            # Prefer latest/fastest models
            priority = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.5-pro-latest"]
            for model_name in priority:
                if model_name in available_models:
                    print(f"Selected model: {model_name}")
                    return model_name
            # If no priority match, use first available
            return available_models[0]
        else:
            return None
    except Exception as e:
        print(f"Error listing models: {e}")
        return None

def analyze_resume_text(resume_text, job_description=None):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key or api_key == "your_google_gemini_api_key_here":
        return "❌ Resume analysis is not configured. Please set GOOGLE_API_KEY in .env file and restart the service."
    
    try:
        # Get the best available model dynamically
        model_name = get_available_model()
        
        if not model_name:
            return "❌ No compatible Gemini model found. Please check your API key and ensure Gemini API is enabled."
        
        model = genai.GenerativeModel(model_name)

        prompt = f"""
Assume you are a professional resume analyst and career coach.
You are tasked with analyzing a resume and providing a detailed report.

Analyze the following resume and provide report including:
- Overall profile strength
- Key skills
- Areas for improvement
- Recommended courses
- ATS Score (between 0 and 100)
- Job recommendations

give brief and concise answers.

Resume:
{resume_text}
"""

        if job_description:
            prompt += f"\n\nCompare with this job description:\n{job_description}"

        response = model.generate_content(prompt)
        return clean_gemini_output(response.text)
    except Exception as e:
        print(f"Error in analyze_resume_text: {e}")
        return f"❌ Failed to analyze resume: {str(e)}"

@app.post("/analyze-resume/")
async def analyze_resume_api(file: UploadFile = File(...), job_description: str = Form("")):
    try:
        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, file.filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        resume_text = extract_text_from_pdf(file_path)
        if not resume_text.strip():
            shutil.rmtree(temp_dir)
            return {"analysis": "❌ Could not extract text from PDF. Please ensure the file is a valid PDF with readable text."}

        analysis = analyze_resume_text(resume_text, job_description)

        shutil.rmtree(temp_dir)
        return {"analysis": analysis}
    except Exception as e:
        print(f"Error in analyze_resume_api: {e}")
        return {"analysis": f"❌ Error processing resume: {str(e)}"}

# ---------- Job Recommendations Logic ----------
# app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

@app.get("/job-recommendations")
def get_jobs():
    url = "https://jsearch.p.rapidapi.com/search"
    querystring = {"query": "developer in India", "page": "1", "num_pages": "2"}
    headers = {
        "X-RapidAPI-Key": os.getenv("RAPIDAPI_KEY"),
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
    }

    response = requests.get(url, headers=headers, params=querystring)
    data = response.json()
    return {"jobs": data.get("data", [])}

# Optional: Run server directly
if __name__ == "__main__":
    app.run(debug=True)
        