import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
current_dir = os.path.dirname(__file__)
dotenv_path = os.path.join(current_dir, ".env")
if not os.path.exists(dotenv_path):
    dotenv_path = os.path.join(os.path.dirname(current_dir), ".env")

print(f"Loading .env from: {dotenv_path}")
load_dotenv(dotenv_path=dotenv_path)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

print(f"URL: {SUPABASE_URL[:10]}...")
print(f"KEY: {SUPABASE_ANON_KEY[:10]}...")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("ERROR: Supabase credentials missing!")
else:
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        # Try a simple select
        response = supabase.table("reminders").select("*", count="exact").limit(1).execute()
        print("Success! Data:", response.data)
    except Exception as e:
        print(f"Failed: {e}")
