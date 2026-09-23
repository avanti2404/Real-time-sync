import os
import json
import logging
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SheetsService")

# In-memory fallback mock storage if Service Account credentials aren't loaded yet
MOCK_DATA = [
    {"id": 1, "columnA": "Avanti", "columnB": "23", "columnC": "Mumbai"},
    {"id": 2, "columnA": "Tanvii", "columnB": "21", "columnC": "Pune"},
    {"id": 3, "columnA": "Nishta", "columnB": "10", "columnC": "Nashik"}
]

class SheetsService:
    def __init__(self):
        self.client = None
        self.sheet = None
        self.sheet_id = os.getenv("SPREADSHEET_ID")
        self.creds_path = os.getenv("SERVICE_ACCOUNT_FILE", "service_account.json")
        self._init_google_sheets()

    def _init_google_sheets(self):
        """Initializes gspread client if credentials exist."""
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            creds_json_env = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
            
            if creds_json_env:
                logger.info("Loading Google Service Account credentials from environment variable...")
                creds_dict = json.loads(creds_json_env)
                scopes = ["https://www.googleapis.com/auth/spreadsheets"]
                creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
                self.client = gspread.authorize(creds)
            elif os.path.exists(self.creds_path):
                logger.info(f"Loading Google Service Account credentials from file {self.creds_path}...")
                scopes = ["https://www.googleapis.com/auth/spreadsheets"]
                creds = Credentials.from_service_account_file(self.creds_path, scopes=scopes)
                self.client = gspread.authorize(creds)
            else:
                logger.warning(
                    f"No Service Account JSON found at '{self.creds_path}' or GOOGLE_SERVICE_ACCOUNT_JSON env. "
                    "Running in fallback in-memory mode until credentials are provided."
                )
                return

            if self.sheet_id and self.client:
                self.sheet = self.client.open_by_key(self.sheet_id).sheet1
                logger.info(f"Successfully connected to Google Sheet ID: {self.sheet_id}")
            else:
                logger.warning("SPREADSHEET_ID not set. Running in fallback mode.")
        except Exception as e:
            logger.error(f"Failed to initialize Google Sheets client: {e}")
            self.client = None
            self.sheet = None

    def get_all_rows(self) -> List[Dict[str, Any]]:
        """Fetches rows from Google Sheet A:C, or returns fallback mock data."""
        if self.sheet:
            try:
                # Fetch header & values from columns A, B, C (up to row 50)
                values = self.sheet.get("A1:C50")
                if not values or len(values) <= 1:
                    # If empty or headers only
                    return MOCK_DATA
                
                rows = []
                # First row is header (A, B, C)
                for index, row in enumerate(values[1:], start=1):
                    colA = str(row[0]).strip() if len(row) > 0 and row[0] is not None else ""
                    colB = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
                    colC = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
                    
                    # Ignore completely empty rows
                    if not colA and not colB and not colC:
                        continue
                        
                    rows.append({
                        "id": index,
                        "columnA": colA,
                        "columnB": colB,
                        "columnC": colC
                    })
                return rows
            except Exception as e:
                logger.error(f"Error fetching data from Google Sheet: {e}")
                return MOCK_DATA
        return MOCK_DATA

    def update_row(self, row_index: int, columnA: str, columnB: str, columnC: str) -> List[Dict[str, Any]]:
        """Updates a specific row in the Google Sheet (A, B, C)."""
        if self.sheet:
            try:
                # Sheet row 1 is header, so row_index 1 corresponds to Sheet row 2
                sheet_row = row_index + 1
                cell_range = f"A{sheet_row}:C{sheet_row}"
                self.sheet.update(cell_range, [[columnA, columnB, columnC]])
                logger.info(f"Updated Google Sheet row {sheet_row} with values: {[columnA, columnB, columnC]}")
                return self.get_all_rows()
            except Exception as e:
                logger.error(f"Error updating Google Sheet row {row_index}: {e}")
                raise e

        # Fallback in-memory update
        for item in MOCK_DATA:
            if item["id"] == row_index:
                item["columnA"] = columnA
                item["columnB"] = columnB
                item["columnC"] = columnC
                break
        return MOCK_DATA
