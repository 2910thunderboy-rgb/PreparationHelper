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
from typing import Optional
from datetime import datetime
import google.generativeai as genai

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

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

# LinkedIn scraping route
LINKEDIN_USERNAME = os.getenv("LINKEDIN_USERNAME")
LINKEDIN_PASSWORD = os.getenv("LINKEDIN_PASSWORD")


@app.post("/job-recommendations/linkedin")
async def get_linkedin_jobs(
    linkedin_username: Optional[str] = Form(None),
    linkedin_password: Optional[str] = Form(None),
    keywords: str = Form("Software Engineer"),
    location: str = Form("India"),
):
    username = linkedin_username or LINKEDIN_USERNAME
    password = linkedin_password or LINKEDIN_PASSWORD
    # keep keywords/location from form or defaults

    if not username or not password:
        return {"error": "LinkedIn credentials not configured; set LINKEDIN_USERNAME and LINKEDIN_PASSWORD environment variables."}

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.service import Service
        from webdriver_manager.chrome import ChromeDriverManager
        import time

        options = webdriver.ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")

        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        driver.get("https://www.linkedin.com/login")
        time.sleep(2)

        username_el = driver.find_element(By.ID, "username")
        password_el = driver.find_element(By.ID, "password")
        username_el.send_keys(username)
        password_el.send_keys(password)
        driver.find_element(By.XPATH, "//button[@type='submit']").click()
        time.sleep(5)

        search_url = f"https://www.linkedin.com/jobs/search/?keywords={keywords.replace(' ', '%20')}&location={location.replace(' ', '%20')}"
        driver.get(search_url)
        time.sleep(5)
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)

        job_cards = driver.find_elements(By.XPATH, "//ul//li[contains(@class,'jobs-search-results__list-item') or contains(@class,'job-card-container')]")
        jobs = []

        for card in job_cards[:15]:
            try:
                link_el = card.find_element(By.XPATH, ".//a[contains(@href,'/jobs/view')]")
                title_el = card.find_elements(By.XPATH, ".//h3[contains(@class,'job-card-list__title') or contains(@class,'job-card__title') or contains(@class,'artdeco-entity-lockup__title')]")
                company_el = card.find_elements(By.XPATH, ".//h4[contains(@class,'job-card-container__company-name') or contains(@class,'job-card-list__company-name') or contains(@class,'artdeco-entity-lockup__subtitle')]")
                title = title_el[0].text.strip() if title_el else ""
                company = company_el[0].text.strip() if company_el else ""
                jobs.append({
                    "job_title": title,
                    "employer_name": company,
                    "job_city": "",
                    "job_country": "",
                    "job_employment_type": "",
                    "job_posted_at_datetime_utc": datetime.utcnow().isoformat() + "Z",
                    "job_apply_link": link_el.get_attribute('href'),
                })
            except Exception:
                continue

        driver.quit()
        return {"jobs": jobs}
    except Exception as e:
        return {"error": f"LinkedIn scraping failed: {str(e)}"}

# Optional: Run server directly
if __name__ == "__main__":
    app.run(debug=True)
        