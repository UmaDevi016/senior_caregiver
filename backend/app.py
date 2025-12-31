import os
import threading
import base64
import json
from datetime import datetime, date
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
current_dir = os.path.dirname(__file__)
dotenv_path = os.path.join(current_dir, ".env")
if not os.path.exists(dotenv_path):
    dotenv_path = os.path.join(os.path.dirname(current_dir), ".env")
load_dotenv(dotenv_path=dotenv_path)

LINGO_API_KEY = os.getenv("LINGO_API_KEY", "")
LINGO_PROJECT_ID = os.getenv("LINGO_PROJECT_ID", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

supabase: Client = None
if SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
else:
    print("CRITICAL: Supabase credentials missing!")
    print("CRITICAL: Supabase credentials missing!")

# In‑memory fallback when Supabase is not configured
if not supabase:
    # Simple singleton senior record
    _senior = {"id": 1, "name": "Demo Senior", "emergency_info": "Call 911 if unconscious."}
    # Medications list
    _medications: list[dict] = []
    # Reminder logs list (one per medication per day)
    _reminder_logs: list[dict] = []

    def _find_med(med_id: int):
        return next((m for m in _medications if m["id"] == med_id), None)

    def _today_str():
        from datetime import date
        return date.today().isoformat()


app = FastAPI(title="SeniorCare Health Assistant API", version="4.0")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class TranslateRequest(BaseModel):
    text: str
    target_lang: str

class SpeakRequest(BaseModel):
    text: str
    target_lang: str = "en"

class MedicationRequest(BaseModel):
    name: str
    dosage: str
    time: str
    frequency: str = "daily"
    pill_color: str = "white"
    senior_id: Optional[int] = 1

class AcknowledgeRequest(BaseModel):
    medication_id: int
    status: str = "taken"  # "taken" or "missed"

class SeniorUpdate(BaseModel):
    name: str
    emergency_info: str

# Helpers
async def call_lingo_translate(text: str, target: str) -> str | None:
    if not LINGO_API_KEY or not LINGO_PROJECT_ID:
        return None
    try:
        url = f"https://api.lingo.dev/v1/projects/{LINGO_PROJECT_ID}/translate"
        payload = {"text": text, "target": target, "source": "auto"}
        headers = {"Authorization": f"Bearer {LINGO_API_KEY}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code == 200:
                data = r.json()
                return data.get("translation") or data.get("translatedText") or data.get("result")
    except Exception as e:
        print(f"[Lingo.dev] Error: {e}")
    return None

def openai_simplify(text: str) -> str:
    if not OPENAI_API_KEY:
        return text
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    prompt = (
        "You are a warm, caring health assistant. Simplify this message for a senior. "
        "Use gentle, clear, 1-syllable words where possible. Under 10 words.\n\n"
        f"Message: {text}\n\nSimplified English:"
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except:
        return text

def openai_translate(text: str, target: str) -> str:
    if not OPENAI_API_KEY:
        return text
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    language_names = {"hi": "Hindi", "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "ml": "Malayalam", "mr": "Marathi", "or": "Odia", "es": "Spanish", "fr": "French", "ar": "Arabic", "en": "English"}
    target_name = language_names.get(target, target)
    prompt = f"Translate this health message into {target_name} for a senior. Be very respectful and clear.\n\nMessage: {text}\n\nTranslation:"
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        return response.choices[0].message.content.strip()
    except:
        return text

# Endpoints
@api_router.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}

@api_router.post("/translate")
async def translate(req: TranslateRequest):
    text = req.text.strip()
    target = req.target_lang.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    simplified = openai_simplify(text)
    translation = await call_lingo_translate(simplified, target)
    if translation:
        return {"translated_text": translation, "target_lang": target, "provider": "lingo.dev", "quality": "senior-simplified"}
    try:
        translation = openai_translate(simplified, target)
        return {"translated_text": translation, "target_lang": target, "provider": "openai", "quality": "senior-simplified"}
    except:
        return {"translated_text": text, "target_lang": target, "provider": "none"}

# Senior Profile
@api_router.get("/senior/{senior_id}")
def get_senior(senior_id: int):
    try:
        res = supabase.table("seniors").select("*").eq("id", senior_id).single().execute()
        return res.data
    except:
        # Fallback for demo if table doesn't exist yet
        return {"id": 1, "name": "Senior User", "emergency_info": "Call 911 in case of emergency."}

@api_router.post("/senior/{senior_id}")
def update_senior(senior_id: int, req: SeniorUpdate):
    try:
        res = supabase.table("seniors").upsert({"id": senior_id, "name": req.name, "emergency_info": req.emergency_info}).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Medication CRUD
@api_router.get("/medications")
def get_medications(senior_id: int = 1):
    try:
        res = supabase.table("medications").select("*").eq("senior_id", senior_id).eq("is_active", True).execute()
        return res.data
    except:
        return []

@api_router.post("/medications")
def add_medication(req: MedicationRequest):
    try:
        data = {
            "name": req.name,
            "dosage": req.dosage,
            "time": req.time,
            "frequency": req.frequency,
            "pill_color": req.pill_color,
            "senior_id": req.senior_id,
            "is_active": True
        }
        res = supabase.table("medications").insert(data).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/medications/{med_id}")
def delete_medication(med_id: int):
    try:
        res = supabase.table("medications").update({"is_active": False}).eq("id", med_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Adherence & Schedule
@api_router.get("/today-schedule")
def get_today_schedule(senior_id: int = 1):
    try:
        # Get active meds
        meds_res = supabase.table("medications").select("*").eq("senior_id", senior_id).eq("is_active", True).execute()
        meds = meds_res.data
        
        # Get today's logs
        today = date.today().isoformat()
        logs_res = supabase.table("reminder_logs").select("*").eq("taken_on", today).execute()
        logs = {log["medication_id"]: log for log in logs_res.data}
        
        result = []
        for med in meds:
            med["log"] = logs.get(med["id"])
            result.append(med)
            
        return result
    except:
        return []

@api_router.post("/acknowledge")
def acknowledge_med(req: AcknowledgeRequest):
    try:
        today = date.today().isoformat()
        data = {
            "medication_id": req.medication_id,
            "status": req.status,
            "taken_on": today,
            "taken_at": datetime.now().isoformat()
        }
        res = supabase.table("reminder_logs").upsert(data, on_conflict="medication_id,taken_on").execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/adherence-summary")
def get_adherence_summary(senior_id: int = 1):
    try:
        today = date.today().isoformat()
        meds_res = supabase.table("medications").select("id").eq("senior_id", senior_id).eq("is_active", True).execute()
        total_meds = len(meds_res.data)
        
        logs_res = supabase.table("reminder_logs").select("id").eq("taken_on", today).eq("status", "taken").execute()
        taken_meds = len(logs_res.data)
        
        percentage = (taken_meds / total_meds * 100) if total_meds > 0 else 100
        return {"total": total_meds, "taken": taken_meds, "percentage": round(percentage, 1)}
    except:
        return {"total": 0, "taken": 0, "percentage": 0}

@api_router.post("/scan-prescription")
async def scan_prescription(file: UploadFile = File(...)):
    if not OPENAI_API_KEY:
        return {"status": "success", "extracted_data": {"medicine": "Sample Med", "dosage": "1 pill", "time": "10:00", "pill_color": "blue"}}
    try:
        contents = await file.read()
        base64_image = base64.b64encode(contents).decode('utf-8')
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user", 
                "content": [
                    {"type": "text", "text": "Extract medication info from this prescription. Return ONLY valid JSON with fields: name, dosage, time (HH:mm), pill_color."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }],
            max_tokens=300,
        )
        text_resp = response.choices[0].message.content.strip()
        if "```" in text_resp:
            text_resp = text_resp.split("```")[1].replace("json", "").strip()
        data = json.loads(text_resp)
        return {"status": "success", "extracted_data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

app.include_router(api_router)
@app.get("/")
def read_root(): return {"message": "SeniorCare Pro API Running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
