from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
import pandas as pd
import io
from fpdf import FPDF
from datetime import datetime
import logging

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger("service_renewal_hub")

def get_services_df(services_list: list) -> pd.DataFrame:
    """Convert list of service dicts to DataFrame and clean up data."""
    if not services_list:
        return pd.DataFrame(columns=["Name", "Provider", "Category", "Cost", "Expiry Date", "Days Left", "Status", "Owner"])
    
    data = []
    now = datetime.now() # Use naive or timezone aware consistently. Best to ensure expiry is offset-aware or naive.
    
    for s in services_list:
        expiry_str = s.get("expiry_date")
        days_left = "N/A"
        expiry_date_fmt = "N/A"
        calculated_status = s.get("status", "Active") # Default to stored
        
        if expiry_str:
            try:
                # Handle ISO format
                if "Z" in expiry_str:
                    expiry_dt = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                else:
                    expiry_dt = datetime.fromisoformat(expiry_str)
                
                # Make 'now' timezone-aware if expiry_dt is
                if expiry_dt.tzinfo:
                    current_time = datetime.now(expiry_dt.tzinfo)
                else:
                    current_time = datetime.now()

                delta = expiry_dt - current_time
                # Match frontend Math.ceil logic
                import math
                days_val = math.ceil(delta.total_seconds() / 86400)
                days_left = days_val
                expiry_date_fmt = expiry_dt.strftime("%Y-%m-%d")

                # Recalculate status
                if days_val < 0:
                    calculated_status = "Expired"
                elif days_val <= 7:
                    calculated_status = "Critical" # 'danger' in frontend
                elif days_val <= 30:
                    calculated_status = "Warning" 
                else:
                    calculated_status = "Safe"

            except Exception as e:
                logger.error(f"Date parse error for {s.get('name')}: {e}")
                pass

        data.append({
            "Name": s.get("name"),
            "Software": s.get("software", ""),
            "Environment": s.get("environment", ""),
            "Provider": s.get("provider"),
            "Category": s.get("category_name", "Uncategorized"),
            "Cost": s.get("cost", 0),
            "Expiry Date": expiry_date_fmt,
            "Days Left": days_left,
            "Status": calculated_status,
            "License Type": s.get("license_type", ""),
            "Unit": s.get("unit", ""),
            "Quantity": s.get("quantity", 0),
            "Utilized": s.get("utilized_quantity", 0),
            "Contact Name": s.get("contact_name", ""),
            "Contact Email": s.get("contact_email", ""),
            "Notes": s.get("notes", "") # Added Notes
        })
    
    return pd.DataFrame(data)

def generate_pdf(df: pd.DataFrame) -> io.BytesIO:
    class PDF(FPDF):
        def header(self):
            self.set_font('Arial', 'B', 15)
            self.cell(0, 10, 'Service License Report', 0, 1, 'C')
            self.ln(5)

        def footer(self):
            self.set_y(-15)
            self.set_font('Arial', 'I', 8)
            self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

    pdf = PDF()
    pdf.add_page(orientation='L') # Landscape for more columns
    pdf.set_font("Arial", size=10)

    # Column widths
    widths = [45, 35, 35, 20, 30, 20, 20, 40, 30]
    headers = ["Name", "Provider", "Category", "Cost", "Expiry", "Days", "Status", "Contact", "Notes"]
    keys = ["Name", "Provider", "Category", "Cost", "Expiry Date", "Days Left", "Status", "Contact Email", "Notes"]

    # Header
    pdf.set_fill_color(200, 220, 255)
    pdf.set_font("Arial", 'B', 10)
    for i, h in enumerate(headers):
        pdf.cell(widths[i], 10, h, 1, 0, 'C', 1)
    pdf.ln()

    # Rows
    pdf.set_font("Arial", size=9)
    total_cost = 0
    
    for _, row in df.iterrows():
        # Truncate text if too long
        name = str(row["Name"])[:25]
        provider = str(row["Provider"])[:20]
        category = str(row["Category"])[:20]
        cost = f"${row['Cost']:.2f}"
        expiry = str(row["Expiry Date"])
        days = str(row["Days Left"])
        status = str(row["Status"])
        contact = str(row["Contact Email"])[:25]
        notes = str(row.get("Notes", ""))[:20]
        
        try:
             total_cost += float(row['Cost'])
        except:
            pass

        pdf.cell(widths[0], 10, name, 1)
        pdf.cell(widths[1], 10, provider, 1)
        pdf.cell(widths[2], 10, category, 1)
        pdf.cell(widths[3], 10, cost, 1, 0, 'R')
        pdf.cell(widths[4], 10, expiry, 1, 0, 'C')
        pdf.cell(widths[5], 10, days, 1, 0, 'C')
        pdf.cell(widths[6], 10, status, 1, 0, 'C')
        pdf.cell(widths[7], 10, contact, 1)
        pdf.cell(widths[8], 10, notes, 1)
        pdf.ln()

    # Summary
    pdf.ln(5)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(0, 10, f"Total Monthly/Annual Cost: ${total_cost:.2f}", 0, 1)
    pdf.cell(0, 10, f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", 0, 1)

    output = io.BytesIO()
    # fpdf2 output() returns a string or writes to file. To write to bytes, use output(dest='S').encode('latin-1') 
    # OR better: output to a temp file or use the bytearray support in newer versions.
    # In fpdf2: pdf.output() without args returns bytes if we pass nothing? No.
    # Correct way for fpdf2 to bytes:
    output = pdf.output(dest='S')
    if isinstance(output, str):
        return io.BytesIO(output.encode('latin-1'))
    return io.BytesIO(output)

@router.get("/export")
async def export_services(
    request: Request,
    format: str = Query("csv", enum=["csv", "excel", "pdf"]),
    category_id: str = Query(None),
):
    try:
        print(f"DEBUG: Starting export request. Format: {format}, Category: {category_id}")
        db = request.app.state.db
        if db is None:
            print("CRITICAL: Database connection in app.state.db is None")
            raise Exception("Database connection uninitialized")

        
        query = {}
        if category_id:
            if category_id == "uncategorized":
                query["$or"] = [{"category_id": None}, {"category_id": ""}]
            else:
                query["category_id"] = category_id

        services_cursor = db["services"].find(query)
        services_list = await services_cursor.to_list(length=None)
        
        df = get_services_df(services_list)

        if format == "csv":
            stream = io.StringIO()
            df.to_csv(stream, index=False)
            response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
            response.headers["Content-Disposition"] = "attachment; filename=services_report.csv"
            return response

        elif format == "excel":
            stream = io.BytesIO()
            with pd.ExcelWriter(stream, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name="Services")
                # Auto-adjust columns width (basic)
                worksheet = writer.sheets['Services']
                for column_cells in worksheet.columns:
                    length = max(len(str(cell.value)) for cell in column_cells)
                    worksheet.column_dimensions[column_cells[0].column_letter].width = length + 2
            
            stream.seek(0)
            response = StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            response.headers["Content-Disposition"] = "attachment; filename=services_report.xlsx"
            return response

        elif format == "pdf":
            pdf_stream = generate_pdf(df)
            response = StreamingResponse(pdf_stream, media_type="application/pdf")
            response.headers["Content-Disposition"] = "attachment; filename=services_report.pdf"
            return response

    except Exception as e:
        print(f"CRITICAL ERROR in export_services: {str(e)}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")
