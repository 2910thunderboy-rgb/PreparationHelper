import os
import re
import shutil
import tempfile
import requests
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime
import google.generativeai as genai
from bs4 import BeautifulSoup

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
        time.sleep(10)  # Increased wait time for login

        # Check if login succeeded
        if "login" in driver.current_url.lower() or "checkpoint" in driver.current_url.lower():
            driver.quit()
            return {"error": "LinkedIn login failed. Check credentials or account status."}

        search_url = f"https://www.linkedin.com/jobs/search/?keywords={keywords.replace(' ', '%20')}&location={location.replace(' ', '%20')}"
        driver.get(search_url)
        time.sleep(5)

        # Explicitly click the Jobs tab to ensure all jobs are loaded
        try:
            jobs_button = driver.find_element(By.XPATH, "//a[@data-link-to='jobs']/span")
            jobs_button.click()
            time.sleep(3)
        except Exception:
            # fallback: maybe list already loaded or selector has changed
            pass

        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)

        # Repeated scroll to load more jobs in case of lazy load/pagination, up to 10 iterations.
        for _ in range(10):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)

        def extract_detail_info(detail_url):
            try:
                base_window = driver.current_window_handle
                driver.execute_script("window.open('');")
                driver.switch_to.window(driver.window_handles[-1])
                driver.get(detail_url)
                time.sleep(4)

                detail_title = ""
                detail_company = ""
                detail_location = "India"

                try:
                    detail_title_el = driver.find_elements(By.XPATH, "//h1[contains(@class,'topcard__title') or contains(@class,'jobs-unified-top-card__job-title') or contains(@class,'title')] | //span[contains(@class,'d59fd9fe')] | //div[contains(@class,'_3ac4ffe8') and contains(@class,'_9572431e')]//span")
                    if detail_title_el and detail_title_el[0].text.strip():
                        detail_title = detail_title_el[0].text.strip()
                except Exception:
                    pass

                try:
                    detail_company_el = driver.find_elements(By.XPATH, "//a[contains(@href,'/company')]/span | //span[contains(@class,'topcard__flavor--company-name') or contains(@class,'jobs-unified-top-card__company-name')] | //div[contains(@class,'_66379f73') or contains(@class,'_2f31586a')]//span")
                    if detail_company_el and detail_company_el[0].text.strip():
                        detail_company = detail_company_el[0].text.strip()
                except Exception:
                    pass

                try:
                    detail_location_el = driver.find_elements(By.XPATH, "//span[contains(@class,'topcard__flavor--bullet') or contains(@class,'jobs-unified-top-card__bullet') or contains(@class,'job-result-card__location')]")
                    if detail_location_el and detail_location_el[0].text.strip():
                        detail_location = detail_location_el[0].text.strip()
                except Exception:
                    pass

                driver.close()
                driver.switch_to.window(base_window)
                return detail_title, detail_company, detail_location
            except Exception as e:
                try:
                    driver.switch_to.window(base_window)
                except Exception:
                    pass
                print("Detail extraction failed", str(e))
                return "", "", "India"

        # try two XPath strategies to handle DOM changes
        job_cards = driver.find_elements(By.XPATH, "//ul[contains(@class,'jobs-search-results__list')]/li")
        if not job_cards:
            job_cards = driver.find_elements(By.XPATH, "//div[contains(@class,'job-card-container') or contains(@class,'jobs-search-results__list-item') or contains(@class,'jobs-search-results__list__item')]")
        if not job_cards:
            job_cards = driver.find_elements(By.XPATH, "//li[contains(@class,'job-result-card') or contains(@class,'base-card')]")

        print(f"Found {len(job_cards)} job cards (XPath fallback applied)")
        for idx, card in enumerate(job_cards):
            try:
                card_snippet = card.text[:300].replace('\n', ' | ')
                print(f"Card {idx} text: {card_snippet}")
            except Exception as e:
                print(f"Could not read card {idx} text: {e}")
        jobs = []

        for i, card in enumerate(job_cards):
            try:
                # Most LinkedIn job cards have a job URL in an <a> tag
                link_el = card.find_element(By.XPATH, ".//a[contains(@href,'/jobs/view') or contains(@href,'/jobs/details')]")
                # Job title and company can appear in different tags/classes depending on LinkedIn template version
                title_elements = card.find_elements(By.XPATH, ".//h3[contains(@class,'job-card-list__title') or contains(@class,'job-card__title') or contains(@class,'artdeco-entity-lockup__title') or contains(@class,'base-search-card__title')] | .//span[contains(@class,'screen-reader-text')]")
                company_elements = card.find_elements(By.XPATH, ".//h4[contains(@class,'job-card-container__company-name') or contains(@class,'job-card-list__company-name') or contains(@class,'artdeco-entity-lockup__subtitle') or contains(@class,'base-search-card__subtitle')] | .//span[contains(@class,'job-card-container__company-name') or contains(@class,'company-name')]")
                location_elements = card.find_elements(By.XPATH, ".//span[contains(@class,'job-card-container__metadata-item') or contains(@class,'job-card-list__location') or contains(@class,'artdeco-entity-lockup__caption') or contains(@class,'job-search-card__location')]")

                title_text = title_elements[0].text.strip() if title_elements and title_elements[0].text.strip() else ""
                company_text = company_elements[0].text.strip() if company_elements and company_elements[0].text.strip() else ""
                job_city = location_elements[0].text.strip() if location_elements and location_elements[0].text.strip() else "India"

                # Additional fallback for LinkedIn new/hashed CSS class names (e.g. .d59fd9fe) in the job list card structure
                if not title_text:
                    try:
                        alt_title = card.find_element(By.CSS_SELECTOR, ".d59fd9fe, ._3ac4ffe8 ._9572431e, .job-card-list__title, .job-card__title")
                        if alt_title.text.strip():
                            title_text = alt_title.text.strip()
                        
                    except Exception:
                        pass

                if not company_text:
                    try:
                        alt_company = card.find_element(By.CSS_SELECTOR, "._66379f73, ._2f31586a, .job-card-container__company-name, .job-card-list__company-name, .artdeco-entity-lockup__subtitle")
                        if alt_company.text.strip():
                            company_text = alt_company.text.strip()
                    except Exception:
                        pass

                # fallback to card text split if fields are missing
                if not title_text or not company_text:
                    card_text = [line.strip() for line in card.text.strip().split('\n') if line.strip()]
                    # Remove the overall search summary lines that look like "(10) Software Engineer Jobs in India"
                    card_text = [line for line in card_text if not (line.startswith('(') and 'jobs in' in line.lower())]

                    if not title_text and card_text:
                        # first non-summary candidate
                        for prospective in card_text:
                            lower = prospective.lower()
                            if 'jobs in' in lower or 'software engineer jobs' in lower or 'with verification' in lower:
                                continue
                            if 'linkedin' in lower and 'easy apply' in lower:
                                continue
                            title_text = prospective
                            break

                    if not company_text and len(card_text) > 1:
                        for prospective_company in card_text:
                            lower = prospective_company.lower()
                            if prospective_company == title_text:
                                continue
                            if 'job' in lower and 'in' in lower:
                                continue
                            if 'software engineer' in lower and 'jobs' in lower:
                                continue
                            company_text = prospective_company
                            break

                    # If still missing, fallback parsers
                    if not title_text and card_text:
                        title_text = card_text[0]
                    if not company_text and len(card_text) > 1:
                        company_text = card_text[1]

                # normalize known wrong forms
                if title_text and '(10)' in title_text:
                    title_text = title_text.replace('(10)', '').strip()
                if company_text and 'with verification' in company_text.lower():
                    company_text = ''

                # BeautifulSoup fallback: explicitly support job-card-list__title + job-card-container__company-name
                if not title_text or not company_text:
                    try:
                        card_html = card.get_attribute('innerHTML')
                        soup = BeautifulSoup(card_html, 'html.parser')

                        if not title_text:
                            # Use the logic from user request: find all matching job title anchors and pick the first non-empty one.
                            jobs_html = soup.find_all('a', {'class': 'job-card-list__title'})
                            job_titles = []
                            for title_tag in jobs_html:
                                text = title_tag.text.strip()
                                if text:
                                    job_titles.append(text)
                            if job_titles:
                                title_text = job_titles[0]
                            else:
                                # fallback to h3 variant
                                jobs_html = soup.find_all('h3', {'class': 'job-card-list__title'})
                                for title_tag in jobs_html:
                                    text = title_tag.text.strip()
                                    if text:
                                        job_titles.append(text)
                                if job_titles:
                                    title_text = job_titles[0]

                        if not company_text:
                            soup_company = soup.find('div', class_='job-card-container__company-name') or soup.find('span', class_='job-card-container__company-name')
                            if soup_company and soup_company.text.strip():
                                company_text = soup_company.text.strip()
                            else:
                                all_companies = soup.find_all('div', class_='job-card-container__company-name')
                                if not all_companies:
                                    all_companies = soup.find_all('span', class_='job-card-container__company-name')
                                if all_companies:
                                    company_text = all_companies[0].text.strip()

                        # location fallback: job-card-container__metadata-wrapper lists location text
                        if not job_city or job_city.strip() == "India":
                            location_html = soup.find_all('ul', class_='job-card-container__metadata-wrapper')
                            location_list = []
                            for loc in location_html:
                                res = re.sub(r'\n\n +', ' ', loc.text.strip())
                                if res:
                                    location_list.append(res)
                            if location_list:
                                job_city = location_list[0]
                    except Exception:
                        pass

                # last fallback: use page title for parsing like "Engineer II - Software Development | Accelya"
                parsed_company = ""
                parsed_title = ""
                if title_text and "|" in title_text:
                    parts = [p.strip() for p in title_text.split("|") if p.strip()]
                    if len(parts) >= 1:
                        parsed_title = parts[0]
                    if len(parts) >= 2:
                        parsed_company = parts[1]
                elif "|" in driver.title:
                    parts = [p.strip() for p in driver.title.split("|") if p.strip()]
                    if len(parts) >= 1:
                        parsed_title = parts[0]
                    if len(parts) >= 2:
                        parsed_company = parts[1]

                # last fallback: use page title for parsing like "Engineer II - Software Development | Accelya"
                parsed_company = ""
                parsed_title = ""
                if title_text and "|" in title_text:
                    parts = [p.strip() for p in title_text.split("|") if p.strip()]
                    if len(parts) >= 1:
                        parsed_title = parts[0]
                    if len(parts) >= 2:
                        parsed_company = parts[1]
                elif "|" in driver.title:
                    parts = [p.strip() for p in driver.title.split("|") if p.strip()]
                    if len(parts) >= 1:
                        parsed_title = parts[0]
                    if len(parts) >= 2:
                        parsed_company = parts[1]

                job_url = link_el.get_attribute('href')
                if (not parsed_title or parsed_title.lower().startswith('(') or 'jobs in' in parsed_title.lower() or 'software engineer jobs' in parsed_title.lower()) or (not company_text or company_text.lower().startswith('software engineer')):
                    detail_title, detail_company, detail_location = extract_detail_info(job_url)
                    if detail_title:
                        parsed_title = detail_title
                    if detail_company:
                        company_text = detail_company
                    if detail_location:
                        job_city = detail_location

                # apply defaults as requested
                job_title = parsed_title or title_text or "Unknown Job Title"
                employer_name = company_text or parsed_company or "Unknown"
                if job_title.lower().startswith('(') and 'software engineer jobs' in job_title.lower():
                    job_title = "Software Engineer"

                jobs.append({
                    "job_title": job_title,
                    "employer_name": employer_name,
                    "job_city": "",  # city suppressed per UI requirement
                    "job_country": "India",
                    "job_employment_type": "Full-time",
                    "job_posted_at_datetime_utc": datetime.utcnow().isoformat() + "Z",
                    "job_apply_link": job_url,
                })
                print(f"Parsed job {i}: title={job_title}, employer={employer_name}, city={job_city}, url={job_url}")
            except Exception as e:
                print(f"Job card parse failed: {e}")
                continue

        driver.quit()
        return {"jobs": jobs}
    except Exception as e:
        return {"error": f"LinkedIn scraping failed: {str(e)}"}


@app.post("/interview/evaluate")
async def evaluate_interview(request: Request):
    question = None
    answer = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data = await request.json()
        question = data.get("question")
        answer = data.get("answer")
    else:
        form = await request.form()
        question = form.get("question")
        answer = form.get("answer")

    if not question or not answer:
        return {"error": "Question and answer are required"}

    # Local fallback keyword scoring function
    def keyword_scoring(question_text, answer_text):
        # extract words from question and answer; lower-case words
        q_words = re.findall(r"[A-Za-z0-9_]+", question_text.lower())
        a_words = re.findall(r"[A-Za-z0-9_]+", answer_text.lower())
        if not q_words or not a_words:
            return 3.0, "Insufficient information to evaluate. Please provide more details."

        matches = sum(1 for w in set(q_words) if w in a_words)
        score = min(5.0, max(1.0, 1.0 + (matches / max(1, len(set(q_words)))) * 4.0))
        feedback = f"Fallback keyword-based score: {matches} keywords matched." \
                   f" Mentioned key terms from the question."
        return score, feedback

    if not api_key or api_key == "your_google_gemini_api_key_here":
        rating, feedback = keyword_scoring(question, answer)
        return {"feedback": feedback, "rating": rating}

    try:
        # Prefer a working Gemini model
        model_name = get_available_model() or "gemini-1.5"
        if not model_name:
            raise RuntimeError("No available Gemini model")

        prompt = (
            f"Evaluate the following answer to an interview question and provide a score out of 5, "
            f"a short feedback sentence, and the strengths/weaknesses."
            f"\n\nQuestion: {question}\nAnswer: {answer}\n"
        )

        model = genai.GenerativeModel(model_name)
        llm_response = model.generate_content(prompt)

        # new API returns text payload as llm_response.text
        text_output = ""
        if hasattr(llm_response, "text") and llm_response.text:
            text_output = llm_response.text
        elif hasattr(llm_response, "output"):
            text_output = "".join([o.get("text", "") for o in llm_response.output if isinstance(o, dict)])
            if not text_output and hasattr(llm_response, "output_text"):
                text_output = llm_response.output_text or ""

        rating = None
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:/|out of)?\s*5", text_output)
        if m:
            try:
                rating = float(m.group(1))
            except ValueError:
                rating = None

        if rating is None:
            rating, feedback = keyword_scoring(question, answer)
            return {"feedback": f"{feedback} (gemini fallback)", "rating": rating}

        rating = max(0, min(5, rating))
        return {"feedback": text_output.strip() or "No detailed feedback received.", "rating": rating}

    except Exception as e:
        print(f"Gemini evaluation failed: {e}")
        rating, feedback = keyword_scoring(question, answer)
        return {"feedback": f"{feedback} (auto fallback due to Gemini error: {str(e)})", "rating": rating}


# Optional: Run server directly
if __name__ == "__main__":
    app.run(debug=True)
        