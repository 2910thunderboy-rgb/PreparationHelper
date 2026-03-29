import os
import re
import json
import shutil
import tempfile
import requests
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, Body, Request, Query
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

def _normalize_jsearch_job(job: dict) -> dict:
    """Map JSearch payload to the shape expected by the frontend."""
    if not isinstance(job, dict):
        return {}
    title_raw = str(job.get("job_title") or job.get("title") or "Open role")
    title = title_raw.split("\n")[0].strip()
    posted = job.get("job_posted_at_datetime_utc") or job.get("job_posted_at_timestamp") or ""
    if not posted:
        posted = datetime.utcnow().isoformat() + "Z"
    elif isinstance(posted, (int, float)):
        try:
            posted = datetime.utcfromtimestamp(posted).isoformat() + "Z"
        except Exception:
            posted = datetime.utcnow().isoformat() + "Z"
    else:
        posted = str(posted)
        if "T" not in posted and " " in posted:
            posted = posted.replace(" ", "T", 1)
        if not posted.endswith("Z") and "+" not in posted[-6:]:
            posted = posted.rstrip() + ("Z" if "T" in posted else "")
    apply_link = job.get("job_apply_link") or job.get("job_google_link") or "#"
    return {
        "job_title": title,
        "employer_name": str(job.get("employer_name") or job.get("employer_company_name") or "Company"),
        "job_city": str(job.get("job_city") or ""),
        "job_country": str(job.get("job_country") or ""),
        "job_employment_type": str(job.get("job_employment_type") or "Full-time"),
        "job_posted_at_datetime_utc": posted,
        "job_apply_link": str(apply_link),
    }


@app.get("/job-recommendations")
def get_jobs(
    keywords: str = Query("Software Engineer"),
    location: str = Query("India"),
):
    """Backup job feed via JSearch (RapidAPI). Used when LinkedIn scraping fails."""
    key = os.getenv("RAPIDAPI_KEY")
    if not key:
        return {
            "jobs": [],
            "error": "RAPIDAPI_KEY is not set in backend-Py .env (optional backup for job listings).",
        }
    url = "https://jsearch.p.rapidapi.com/search"
    q = f"{keywords.strip()} in {location.strip()}".strip()
    querystring = {"query": q, "page": "1", "num_pages": "1"}
    headers = {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    try:
        response = requests.get(url, headers=headers, params=querystring, timeout=45)
        data = response.json()
        if response.status_code != 200:
            msg = data.get("message") if isinstance(data, dict) else "JSearch HTTP error"
            return {"jobs": [], "error": str(msg)}
        raw = data.get("data") if isinstance(data, dict) else []
        jobs = [_normalize_jsearch_job(j) for j in (raw or [])]
        return {"jobs": jobs}
    except Exception as e:
        return {"jobs": [], "error": str(e)}

# LinkedIn scraping route
LINKEDIN_USERNAME = os.getenv("LINKEDIN_USERNAME")
LINKEDIN_PASSWORD = os.getenv("LINKEDIN_PASSWORD")


def _linkedin_job_id_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/jobs/view/(\d+)", url)
    return m.group(1) if m else None


def _absolute_linkedin_href(href: str) -> str:
    h = (href or "").strip()
    if h.startswith("/"):
        return "https://www.linkedin.com" + h
    return h


def _looks_like_search_summary_title(text: str) -> bool:
    if not text or len(text) < 3:
        return True
    lower = text.lower()
    if lower.startswith("(") and "jobs in" in lower:
        return True
    if "software engineer jobs" in lower and "in" in lower:
        return True
    if re.match(r"^\(\d+\)\s+.+\s+jobs\s+in\s+", lower):
        return True
    return False


def _primary_job_title_line(text: str) -> str:
    """LinkedIn often concatenates a second line (e.g. 'with verification'); keep only the first line."""
    if not text:
        return ""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    first = normalized.split("\n", 1)[0].strip()
    return first


@app.post("/job-recommendations/linkedin")
async def get_linkedin_jobs(request: Request):
    linkedin_username: Optional[str] = None
    linkedin_password: Optional[str] = None
    keywords = "Software Engineer"
    location = "India"
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            data = await request.json()
            if isinstance(data, dict):
                linkedin_username = data.get("linkedin_username")
                linkedin_password = data.get("linkedin_password")
                if data.get("keywords"):
                    keywords = str(data["keywords"])
                if data.get("location"):
                    location = str(data["location"])
        else:
            form = await request.form()
            linkedin_username = form.get("linkedin_username")
            linkedin_password = form.get("linkedin_password")
            if form.get("keywords"):
                keywords = str(form.get("keywords"))
            if form.get("location"):
                location = str(form.get("location"))
    except Exception:
        pass

    username = linkedin_username or LINKEDIN_USERNAME
    password = linkedin_password or LINKEDIN_PASSWORD

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
        time.sleep(2)

        # Scroll every matching list panel (not only the first match — wrong panel can be empty and break loading).
        list_scroll_selectors = [
            "div.jobs-search-results-list",
            "div.scaffold-layout__list",
            "ul.scaffold-layout__list-container",
            "ul.jobs-search-results__list",
            "div.scaffold-layout__list-container",
        ]
        for _ in range(18):
            for sel in list_scroll_selectors:
                try:
                    for panel in driver.find_elements(By.CSS_SELECTOR, sel):
                        try:
                            driver.execute_script(
                                "arguments[0].scrollTop = arguments[0].scrollHeight", panel
                            )
                        except Exception:
                            pass
                except Exception:
                    pass
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

        def extract_detail_info(detail_url):
            try:
                base_window = driver.current_window_handle
                driver.execute_script("window.open('');")
                driver.switch_to.window(driver.window_handles[-1])
                driver.get(detail_url)
                time.sleep(3)

                detail_title = ""
                detail_company = ""
                detail_location = "India"

                try:
                    og_els = driver.find_elements(By.CSS_SELECTOR, "meta[property='og:title']")
                    if og_els:
                        raw = (og_els[0].get_attribute("content") or "").strip()
                        if raw:
                            part = raw.split(" | ")[0].strip()
                            if " at " in part:
                                part = part.split(" at ")[0].strip()
                            detail_title = part
                except Exception:
                    pass

                if not detail_title:
                    try:
                        detail_title = driver.execute_script(
                            """
                            var s = 'h1.jobs-unified-top-card__job-title, '
                              + 'h1[class*="job-title"], '
                              + '.job-details-jobs-unified-top-card__job-title, '
                              + 'h1.topcard__title, '
                              + '.jobs-details-top-card__title-text';
                            var el = document.querySelector(s);
                            return el && el.innerText ? el.innerText.trim() : '';
                            """
                        ) or ""
                    except Exception:
                        pass

                if not detail_title:
                    try:
                        detail_title_el = driver.find_elements(
                            By.XPATH,
                            "//h1[contains(@class,'topcard__title') or contains(@class,'jobs-unified-top-card__job-title') or contains(@class,'job-title')]",
                        )
                        if detail_title_el and detail_title_el[0].text.strip():
                            detail_title = detail_title_el[0].text.strip()
                    except Exception:
                        pass

                try:
                    detail_company_el = driver.find_elements(
                        By.XPATH,
                        "//a[contains(@href,'/company')]/span | //span[contains(@class,'topcard__flavor--company-name') or contains(@class,'jobs-unified-top-card__company-name')] | //div[contains(@class,'_66379f73') or contains(@class,'_2f31586a')]//span",
                    )
                    if detail_company_el and detail_company_el[0].text.strip():
                        detail_company = detail_company_el[0].text.strip()
                except Exception:
                    pass

                try:
                    detail_location_el = driver.find_elements(
                        By.XPATH,
                        "//span[contains(@class,'topcard__flavor--bullet') or contains(@class,'jobs-unified-top-card__bullet') or contains(@class,'job-result-card__location')]",
                    )
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

        # Job list DOM varies; collect cards when possible.
        job_cards = driver.find_elements(By.XPATH, "//ul[contains(@class,'jobs-search-results__list')]/li")
        if not job_cards:
            job_cards = driver.find_elements(
                By.XPATH,
                "//div[contains(@class,'job-card-container') or contains(@class,'jobs-search-results__list-item') or contains(@class,'jobs-search-results__list__item')]",
            )
        if not job_cards:
            job_cards = driver.find_elements(
                By.XPATH,
                "//li[contains(@class,'job-result-card') or contains(@class,'base-card')]",
            )
        if not job_cards:
            job_cards = driver.find_elements(
                By.CSS_SELECTOR,
                "div.job-card-container, li.jobs-search-results__list-item, li.scaffold-layout__list-item",
            )

        print(f"Found {len(job_cards)} job cards (XPath fallback applied)")
        for idx, card in enumerate(job_cards):
            try:
                card_snippet = card.text[:300].replace('\n', ' | ')
                print(f"Card {idx} text: {card_snippet}")
            except Exception as e:
                print(f"Could not read card {idx} text: {e}")
        jobs = []
        seen_job_ids = set()
        kw_lower = keywords.strip().lower()

        for i, card in enumerate(job_cards):
            try:
                link_el = None
                for xp in (
                    ".//a[contains(@href,'/jobs/view')]",
                    ".//a[contains(@href,'jobs/view')]",
                    ".//a[contains(@href,'/jobs/details')]",
                ):
                    try:
                        link_el = card.find_element(By.XPATH, xp)
                        break
                    except Exception:
                        continue
                if link_el is None:
                    continue
                job_url = _absolute_linkedin_href(link_el.get_attribute("href") or "")
                jid = _linkedin_job_id_from_url(job_url)
                if jid and jid in seen_job_ids:
                    continue

                # Primary: visible job title on the title link (per-card); avoid global search tab title.
                link_txt = (link_el.text or "").strip()
                aria = (link_el.get_attribute("aria-label") or "").strip()
                title_text = ""
                if link_txt and not _looks_like_search_summary_title(link_txt):
                    title_text = link_txt
                if not title_text and aria:
                    chunk = aria.split(" at ")[0].split(" | ")[0].strip()
                    for piece in re.split(r"\s*[—–\-]\s*", chunk):
                        p = piece.strip()
                        if p and not _looks_like_search_summary_title(p):
                            title_text = p
                            break
                    if not title_text and not _looks_like_search_summary_title(chunk):
                        title_text = chunk

                # Job title and company can appear in different tags/classes depending on LinkedIn template version
                title_elements = card.find_elements(By.XPATH, ".//h3[contains(@class,'job-card-list__title') or contains(@class,'job-card__title') or contains(@class,'artdeco-entity-lockup__title') or contains(@class,'base-search-card__title')] | .//a[contains(@class,'job-card-list__title') or contains(@class,'job-card-container__link')]")
                company_elements = card.find_elements(By.XPATH, ".//h4[contains(@class,'job-card-container__company-name') or contains(@class,'job-card-list__company-name') or contains(@class,'artdeco-entity-lockup__subtitle') or contains(@class,'base-search-card__subtitle')] | .//span[contains(@class,'job-card-container__company-name') or contains(@class,'company-name')]")
                location_elements = card.find_elements(By.XPATH, ".//span[contains(@class,'job-card-container__metadata-item') or contains(@class,'job-card-list__location') or contains(@class,'artdeco-entity-lockup__caption') or contains(@class,'job-search-card__location')]")

                if not title_text:
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

                # Split "Title | Company" when both appear in one field (do not use driver.title — it is the same for every card).
                parsed_company = ""
                parsed_title = ""
                if title_text and "|" in title_text:
                    parts = [p.strip() for p in title_text.split("|") if p.strip()]
                    if len(parts) >= 1:
                        parsed_title = parts[0]
                    if len(parts) >= 2:
                        parsed_company = parts[1]

                list_title = (parsed_title or title_text or "").strip()
                need_detail = (
                    not list_title
                    or _looks_like_search_summary_title(list_title)
                    or list_title.lower() == kw_lower
                    or (keywords.lower() in list_title.lower() and "jobs in" in list_title.lower())
                    or not company_text
                    or company_text.lower().startswith("software engineer")
                )
                if need_detail:
                    detail_title, detail_company, detail_location = extract_detail_info(job_url)
                    if detail_title and not _looks_like_search_summary_title(detail_title):
                        parsed_title = detail_title
                    if detail_company:
                        company_text = detail_company
                    if detail_location:
                        job_city = detail_location

                job_title = _primary_job_title_line(parsed_title or title_text or "") or "Unknown Job Title"
                employer_name = (company_text or parsed_company or "").strip() or "Unknown"

                jobs.append({
                    "job_title": job_title,
                    "employer_name": employer_name,
                    "job_city": "",  # city suppressed per UI requirement
                    "job_country": location,
                    "job_employment_type": "Full-time",
                    "job_posted_at_datetime_utc": datetime.utcnow().isoformat() + "Z",
                    "job_apply_link": job_url,
                })
                if jid:
                    seen_job_ids.add(jid)
                print(f"Parsed job {i}: title={job_title}, employer={employer_name}, city={job_city}, url={job_url}")
            except Exception as e:
                print(f"Job card parse failed: {e}")
                continue

        # If list selectors found no parseable cards (LinkedIn DOM / template drift), harvest job links from the page.
        if not jobs:
            print("No jobs from card walkthrough; falling back to global job view links")
            seen_fb = set()
            anchors = driver.find_elements(
                By.XPATH,
                "//a[contains(@href,'/jobs/view/') or contains(@href,'/jobs/view?')]",
            )
            for a in anchors:
                try:
                    raw_href = _absolute_linkedin_href(a.get_attribute("href") or "")
                    if "/jobs/view" not in raw_href:
                        continue
                    jid = _linkedin_job_id_from_url(raw_href)
                    if jid and jid in seen_fb:
                        continue

                    link_txt = (a.text or "").strip()
                    aria = (a.get_attribute("aria-label") or "").strip()
                    title_text = ""
                    if link_txt and not _looks_like_search_summary_title(link_txt):
                        title_text = link_txt
                    if not title_text and aria:
                        chunk = aria.split(" at ")[0].split(" | ")[0].strip()
                        for piece in re.split(r"\s*[—–\-]\s*", chunk):
                            p = piece.strip()
                            if p and not _looks_like_search_summary_title(p):
                                title_text = p
                                break
                        if not title_text and not _looks_like_search_summary_title(chunk):
                            title_text = chunk

                    company_text = ""
                    parsed_title = ""
                    list_title = title_text.strip()
                    kw_lower_fb = keywords.strip().lower()
                    need_detail = (
                        not list_title
                        or _looks_like_search_summary_title(list_title)
                        or list_title.lower() == kw_lower_fb
                        or not company_text
                    )
                    if need_detail:
                        dt, dc, dl = extract_detail_info(raw_href)
                        if dt and not _looks_like_search_summary_title(dt):
                            parsed_title = dt
                        if dc:
                            company_text = dc
                    job_title = _primary_job_title_line(parsed_title or title_text or "") or "Unknown Job Title"
                    employer_name = (company_text or "").strip() or "Unknown"
                    jobs.append(
                        {
                            "job_title": job_title,
                            "employer_name": employer_name,
                            "job_city": "",
                            "job_country": location,
                            "job_employment_type": "Full-time",
                            "job_posted_at_datetime_utc": datetime.utcnow().isoformat() + "Z",
                            "job_apply_link": raw_href,
                        }
                    )
                    if jid:
                        seen_fb.add(jid)
                    print(f"Fallback parsed job: title={job_title}, employer={employer_name}, url={raw_href}")
                except Exception as e:
                    print(f"Fallback anchor parse failed: {e}")
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


def _referral_message_fallback(
    recipient: str,
    job_link: str,
    resume_link: str,
    company: str,
    tone: str,
    from_name: str = "",
    job_id: str = "",
) -> str:
    co = company.strip() if company else "the team"
    tone_note = "Warm but professional." if tone == "warm" else "Concise and direct." if tone == "concise" else "Professional and respectful."
    signer = from_name.strip() if from_name and from_name.strip() else "[Your Name]"
    job_id_note = (
        f"\n\nIf helpful for internal tracking, the job requisition or posting ID I have is: {job_id.strip()}."
        if job_id and job_id.strip()
        else ""
    )
    return (
        f"Hi {recipient},\n\n"
        f"I hope you're well. I'm writing about a role I found ({job_link}) and believe my background could be a strong match.\n\n"
        f"Here is my resume / portfolio for context: {resume_link}\n\n"
        f"If you're open to it, I'd be grateful for a referral or any advice on applying at {co}. "
        f"{tone_note}{job_id_note}\n\n"
        f"Thank you for your time,\n{signer}"
    )


@app.post("/referral/generate-message")
async def referral_generate_message(request: Request):
    """Generate a referral / outreach message from job link, recipient name, and resume link."""
    try:
        data = await request.json()
    except Exception:
        return {"error": "Invalid JSON body"}

    job_link = (data.get("job_link") or "").strip()
    recipient_name = (data.get("recipient_name") or data.get("name") or "").strip()
    resume_link = (data.get("resume_link") or "").strip()
    company_name = (data.get("company_name") or "").strip()
    from_name = (data.get("from_name") or data.get("sender_name") or "").strip()
    job_id = (data.get("job_id") or data.get("job_requisition_id") or "").strip()
    tone = (data.get("tone") or "professional").strip().lower()
    if tone not in ("professional", "warm", "concise"):
        tone = "professional"

    if not job_link or not recipient_name or not resume_link:
        return {"error": "job_link, recipient_name, and resume_link are required"}

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key or api_key == "your_google_gemini_api_key_here":
        return {
            "message": _referral_message_fallback(
                recipient_name, job_link, resume_link, company_name, tone, from_name, job_id
            ),
            "source": "template",
        }

    try:
        model_name = get_available_model() or "gemini-1.5-flash"
        model = genai.GenerativeModel(model_name)
        company_ctx = f" The company or team context is: {company_name}." if company_name else ""
        sender_ctx = (
            f"Sign the message with this exact name on the last line (not [Your Name]): {from_name}."
            if from_name
            else "End with a polite sign-off and the placeholder [Your Name] on its own line."
        )
        job_id_ctx = (
            f"If a job requisition or posting ID was provided, mention it once briefly where natural: {job_id}."
            if job_id
            else "No job requisition ID was provided; do not invent one."
        )
        prompt = (
            "You are helping a job seeker write a short LinkedIn-style message asking for a referral or warm introduction.\n"
            "Requirements:\n"
            "- Address the recipient by first name if only one name was given, otherwise use the full name naturally.\n"
            "- Mention the job posting link naturally (do not invent details about the role).\n"
            "- Include the resume/portfolio link once.\n"
            "- Tone: "
            + tone
            + "."
            + company_ctx
            + "\n- "
            + job_id_ctx
            + "\n- Maximum ~180 words. No bullet points. Plain paragraphs.\n- "
            + sender_ctx
            + "\n\n"
            f"Recipient name: {recipient_name}\n"
            f"Sender sign-off name: {from_name or '[Your Name]'}\n"
            f"Job posting URL: {job_link}\n"
            f"Optional job / requisition ID: {job_id or '(none)'}\n"
            f"Resume or portfolio URL: {resume_link}\n"
        )
        llm_response = model.generate_content(prompt)
        text_output = ""
        if hasattr(llm_response, "text") and llm_response.text:
            text_output = llm_response.text
        if not text_output:
            text_output = _referral_message_fallback(
                recipient_name, job_link, resume_link, company_name, tone, from_name, job_id
            )
            return {"message": clean_gemini_output(text_output), "source": "template"}

        return {"message": clean_gemini_output(text_output), "source": "ai"}
    except Exception as e:
        print(f"Referral message generation failed: {e}")
        return {
            "message": _referral_message_fallback(
                recipient_name, job_link, resume_link, company_name, tone, from_name, job_id
            ),
            "source": "template",
            "notice": "AI unavailable; used a polished template instead.",
        }


def _load_linkedin_company_ids():
    path = os.path.join(os.path.dirname(__file__), "linkedin_company_ids.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _linkedin_has_session_cookie(driver) -> bool:
    """LinkedIn sets `li_at` when a logged-in session is active."""
    try:
        for c in driver.get_cookies():
            if c.get("name") == "li_at" and c.get("value"):
                return True
    except Exception:
        pass
    return False


def _linkedin_headless_enabled() -> bool:
    v = (os.getenv("LINKEDIN_HEADLESS") or "true").strip().lower()
    return v not in ("0", "false", "no", "off")


def _linkedin_login_driver(username: str, password: str):
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    import time

    headless = _linkedin_headless_enabled()
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});",
            },
        )
    except Exception:
        pass

    try:
        driver.get("https://www.linkedin.com/login")
        time.sleep(2)
        driver.find_element(By.ID, "username").send_keys(username)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.XPATH, "//button[@type='submit']").click()

        max_wait = 35 if headless else 150
        poll = 2.0
        deadline = time.time() + max_wait
        while time.time() < deadline:
            if _linkedin_has_session_cookie(driver):
                return driver, None
            cur = (driver.current_url or "").lower()
            if not headless and ("checkpoint" in cur or "challenge" in cur or "login" in cur):
                time.sleep(poll)
                continue
            time.sleep(poll)

        if _linkedin_has_session_cookie(driver):
            return driver, None

        cur = (driver.current_url or "").lower()
        driver.quit()
        hint = (
            "LinkedIn did not return a session after login. "
            "If you see a security checkpoint or 2FA, set LINKEDIN_HEADLESS=false in backend-Py/.env, "
            "restart the API, click Load connections again, and complete verification in the Chrome window within ~2 minutes. "
            "Otherwise confirm LINKEDIN_USERNAME and LINKEDIN_PASSWORD work in a normal browser."
        )
        if headless and ("checkpoint" in cur or "challenge" in cur):
            hint = (
                "LinkedIn blocked automated login (checkpoint/challenge). "
                "Set LINKEDIN_HEADLESS=false in backend-Py/.env, restart, then run Load connections and finish verification in the opened browser."
            )
        return None, hint
    except Exception as e:
        try:
            driver.quit()
        except Exception:
            pass
        return None, str(e)


def _parse_people_search_cards(driver):
    from selenium.webdriver.common.by import By
    import time

    results = []
    seen = set()
    for _ in range(6):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.0)
    cards = driver.find_elements(By.CSS_SELECTOR, "li.reusable-search__result-container")
    if not cards:
        cards = driver.find_elements(By.CSS_SELECTOR, "div[data-chameleon-result-urn]")
    if not cards:
        cards = driver.find_elements(By.CSS_SELECTOR, ".entity-result")
    for card in cards:
        try:
            name = ""
            headline = ""
            for sel in (
                ".entity-result__title-text a span[aria-hidden='true']",
                ".entity-result__title-text span",
            ):
                els = card.find_elements(By.CSS_SELECTOR, sel)
                if els:
                    t = els[0].text.strip()
                    if t:
                        name = t
                        break
            if not name:
                for a in card.find_elements(By.CSS_SELECTOR, "a[href*='/in/'] span[aria-hidden='true']"):
                    t = a.text.strip()
                    if t:
                        name = t
                        break
            for hsel in (
                ".entity-result__primary-subtitle",
                ".entity-result__secondary-subtitle",
            ):
                hel = card.find_elements(By.CSS_SELECTOR, hsel)
                if hel:
                    headline = hel[0].text.strip()
                    break
            if name and name.lower() not in seen:
                seen.add(name.lower())
                results.append({"name": name, "headline": headline or ""})
        except Exception:
            continue
    return results[:40]


@app.post("/referral/linkedin-mutuals")
async def referral_linkedin_mutuals(request: Request):
    try:
        data = await request.json()
    except Exception:
        return {"connections": [], "error": "Invalid JSON"}
    company_key = (data.get("company_key") or "").strip()
    if not company_key:
        return {"connections": [], "error": "company_key is required"}
    ids_map = _load_linkedin_company_ids()
    company_id = ids_map.get(company_key)
    if not company_id:
        return {
            "connections": [],
            "error": (
                f"No LinkedIn company ID for '{company_key}'. "
                "Add it to backend-Py/linkedin_company_ids.json."
            ),
        }
    username = LINKEDIN_USERNAME or os.getenv("LINKEDIN_USERNAME")
    password = LINKEDIN_PASSWORD or os.getenv("LINKEDIN_PASSWORD")
    if not username or not password:
        return {
            "connections": [],
            "error": "Set LINKEDIN_USERNAME and LINKEDIN_PASSWORD in backend-Py .env",
        }
    driver, err = _linkedin_login_driver(username, password)
    if err:
        return {"connections": [], "error": err}
    import time

    try:
        url = (
            "https://www.linkedin.com/search/results/people/"
            f"?currentCompany=%5B%22{company_id}%22%5D&network=%5B%22F%22%5D&origin=FACETED_SEARCH"
        )
        driver.get(url)
        time.sleep(6)
        connections = _parse_people_search_cards(driver)
        return {"connections": connections, "error": None, "company_id_used": company_id}
    except Exception as e:
        return {"connections": [], "error": str(e)}
    finally:
        try:
            driver.quit()
        except Exception:
            pass


# Optional: Run server directly
if __name__ == "__main__":
    app.run(debug=True)
        