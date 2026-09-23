import os
import asyncio
import json
import hashlib
import logging
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from sheets_service import SheetsService

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PythonBackend")

NODE_SERVICE_URL = os.getenv("NODE_SERVICE_URL", "http://127.0.0.1:5000")
POLL_INTERVAL_SECONDS = float(os.getenv("POLL_INTERVAL_SECONDS", "2.5"))

sheets_service = SheetsService()
last_known_hash = ""

def compute_data_hash(data):
    """Computes an MD5 hash of the dataset to detect changes."""
    encoded = json.dumps(data, sort_keys=True).encode("utf-8")
    return hashlib.md5(encoded).hexdigest()

def notify_node_gateway(rows, source):
    """Sends notification payload to Node.js WebSocket Gateway."""
    try:
        res = requests.post(
            f"{NODE_SERVICE_URL}/api/python-notify",
            json={"rows": rows, "source": source},
            timeout=2.5
        )
        logger.info(f"Notified Node.js Gateway ({source}): status {res.status_code}")
    except Exception as notify_err:
        logger.warning(f"Could not notify Node.js Gateway: {notify_err}")

async def background_sheets_poller():
    """Real-time background task checking Google Sheets every 2.5s for live edits."""
    global last_known_hash
    logger.info(f"Started real-time poller (interval: {POLL_INTERVAL_SECONDS}s)")
    
    # Initialize initial state snapshot
    initial_rows = sheets_service.get_all_rows()
    last_known_hash = compute_data_hash(initial_rows)
    
    while True:
        try:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            # Run blocking Sheets API call in a thread pool
            current_rows = await asyncio.to_thread(sheets_service.get_all_rows)
            current_hash = compute_data_hash(current_rows)

            if current_hash != last_known_hash:
                logger.info("⚡ [Sheet Edit Detected] Broadcasting live update to Web UI...")
                last_known_hash = current_hash
                # Run notification in thread pool to prevent blocking loop
                await asyncio.to_thread(notify_node_gateway, current_rows, "google_sheet")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in background poller: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    poller_task = asyncio.create_task(background_sheets_poller())
    yield
    poller_task.cancel()

app = FastAPI(title="Google Sheets Sync API (Python)", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RowData(BaseModel):
    columnA: str
    columnB: str
    columnC: str

@app.get("/")
def root():
    return {"message": "🐍 Python Google Sheets Engine is Running!", "endpoints": ["/api/health", "/api/data"]}

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Python Sheets Engine"}

@app.get("/api/data")
def get_data():
    """Returns current rows from Google Sheet without resetting poller hash."""
    rows = sheets_service.get_all_rows()
    return {"rows": rows}

@app.put("/api/rows/{row_id}")
def update_row(row_id: int = Path(..., ge=1), data: RowData = None):
    """Updates a row in Google Sheet and notifies poller hash."""
    global last_known_hash
    if not data:
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    try:
        updated_rows = sheets_service.update_row(row_id, data.columnA, data.columnB, data.columnC)
        last_known_hash = compute_data_hash(updated_rows)
        return {"success": True, "rows": updated_rows}
    except Exception as e:
        logger.error(f"Error updating row {row_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
