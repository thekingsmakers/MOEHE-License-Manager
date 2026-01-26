from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import reports
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

import resend
import ssl
import certifi
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
import shutil

# ==================== CONFIGURATION ====================

ROOT_DIR = Path(__file__).resolve().parent
ENV_PATH = ROOT_DIR / '.env'
load_dotenv(ENV_PATH)

# Global variables for lazy connection
mongo_client: Optional[AsyncIOMotorClient] = None
db = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("service_renewal_hub")

def log_debug_email(message):
    with open("debug_email.log", "a") as f:
        f.write(f"[{datetime.now()}] {message}\n")

# JWT configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Service Renewal Hub")

origins = ["*"]

# Add dynamic CORS origins from environment
cors_env = os.environ.get("CORS_ORIGINS")
if cors_env:
    if cors_env == "*":
        origins = ["*"]
    else:
        origins.extend([origin.strip() for origin in cors_env.split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=static_dir), name="static")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
api_router.include_router(reports.router)

security = HTTPBearer()

# ==================== DATABASE HELPERS ====================

async def connect_db():
    global mongo_client, db
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    if not mongo_url or not db_name:
        logger.warning("Database configuration missing")
        return False

    try:
        mongo_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        # Verify connection
        await mongo_client.server_info()
        db = mongo_client[db_name]
        logger.info(f"Connected to MongoDB: {db_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        mongo_client = None
        db = None
        return False

@app.on_event("startup")
async def startup_db_client():
    load_dotenv(ENV_PATH, override=True)
    await connect_db()
    app.state.db = db

@app.on_event("shutdown")
async def shutdown_db_client():
    global mongo_client
    if mongo_client:
        mongo_client.close()

# ==================== MODELS ====================

# Maintain existing models
class ServiceOwner(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    role: str = "App Owner"

class ReminderThreshold(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    days_before: int
    label: str = ""

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str = "user"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    description: str = ""
    color: str = "#06b6d4"
    icon: str = "folder"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#06b6d4"
    icon: Optional[str] = "folder"

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None

class AppSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "app_settings"
    email_provider: str = "resend"
    resend_api_key: str = ""
    sender_email: str = "onboarding@resend.dev"
    sender_name: str = "Service Renewal Hub"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    company_name: str = "Your Organization"
    notification_thresholds: List[int] = [30, 7, 1]
    logo_url: str = ""
    company_tagline: str = "Service Management System"
    primary_color: str = "#06b6d4"
    theme_mode: str = "dark"
    accent_color: str = "#06b6d4"
    mongo_url: str = ""
    db_name: str = ""
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_by: str = ""

class ServiceCreate(BaseModel):
    name: str
    provider: str
    category_id: Optional[str] = None
    category_name: Optional[str] = "Uncategorized"
    expiry_date: Optional[str] = None
    expiry_duration_months: Optional[int] = None
    reminder_thresholds: Optional[List[dict]] = None
    owners: Optional[List[dict]] = None
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = ""
    notes: Optional[str] = ""
    cost: Optional[float] = 0.0

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    expiry_date: Optional[str] = None
    expiry_duration_months: Optional[int] = None
    reminder_thresholds: Optional[List[dict]] = None
    owners: Optional[List[dict]] = None
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = None
    notes: Optional[str] = None
    cost: Optional[float] = None

class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str
    provider: str
    category_id: Optional[str] = None
    category_name: str = "Uncategorized"
    expiry_date: str
    expiry_duration_months: Optional[int] = None
    reminder_thresholds: List[dict] = Field(default_factory=lambda: [
        {"id": str(uuid.uuid4()), "days_before": 30, "label": "First reminder"},
        {"id": str(uuid.uuid4()), "days_before": 7, "label": "Second reminder"},
        {"id": str(uuid.uuid4()), "days_before": 1, "label": "Final reminder"}
    ])
    owners: List[dict] = Field(default_factory=list)
    contact_email: Optional[str] = None
    contact_name: str = ""
    notes: str = ""
    cost: float = 0.0
    status: str = "active"
    notifications_sent: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class NotificationLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service_id: str
    service_name: str
    threshold_id: str
    threshold_label: str
    days_until_expiry: int
    recipients: List[dict] = []
    sent_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "sent"

class EmailLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service_id: str
    service_name: str
    recipient_email: str
    recipient_name: str = ""
    threshold_id: str = ""
    threshold_label: str = ""
    days_until_expiry: int
    sent_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "sent"

# ==================== SETUP ROUTES ====================

class SetupData(BaseModel):
    mongo_url: str
    db_name: str
    admin_name: str
    admin_email: EmailStr
    admin_password: str

@api_router.get("/status")
async def get_system_status():
    global db
    if db is None:
        if os.environ.get('MONGO_URL'):
            if await connect_db():
                return {"status": "ok", "message": "System operational"}
            else:
                return {"status": "db_error", "message": "Cannot connect to database"}
        return {"status": "setup_required", "message": "Setup required"}
    
    try:
        user_count = await db.users.count_documents({})
        if user_count == 0:
             return {"status": "setup_required", "message": "Create admin account"}
    except Exception:
        return {"status": "db_error", "message": "Database error"}

    return {"status": "ok", "message": "System operational"}

@api_router.post("/setup")
async def run_setup(data: SetupData):
    global mongo_client, db, JWT_SECRET
    
    # 1. Verify connection
    try:
        temp_client = AsyncIOMotorClient(data.mongo_url, serverSelectionTimeoutMS=5000)
        await temp_client.server_info()
        temp_client.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot connect to MongoDB: {str(e)}")

    # 2. Write .env file
    env_content = f"MONGO_URL={data.mongo_url}\nDB_NAME={data.db_name}\nJWT_SECRET={uuid.uuid4().hex}\nRESEND_API_KEY=\nSENDER_EMAIL=onboarding@resend.dev\n"
    try:
        with open(ENV_PATH, "w") as f:
            f.write(env_content)
        os.environ['MONGO_URL'] = data.mongo_url
        os.environ['DB_NAME'] = data.db_name
        load_dotenv(ENV_PATH, override=True)
        JWT_SECRET = os.environ.get('JWT_SECRET')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write configuration: {str(e)}")

    # 3. Connect global client
    if not await connect_db():
        raise HTTPException(status_code=500, detail="Failed to connect to database after configuration")

    # 4. Create Admin User
    try:
        pwd_hash = bcrypt.hashpw(data.admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = User(
            email=data.admin_email,
            name=data.admin_name,
            role="admin",
            id=str(uuid.uuid4()),
            created_at=datetime.now(timezone.utc).isoformat()
        )
        user_doc = user.model_dump()
        user_doc["password_hash"] = pwd_hash
        
        await db.users.update_one(
            {"email": data.admin_email}, 
            {"$set": user_doc}, 
            upsert=True
        )
        
        default_settings = AppSettings()
        await db.settings.update_one(
            {"id": "app_settings"},
            {"$setOnInsert": default_settings.model_dump()},
            upsert=True
        )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create admin user: {str(e)}")

    return {"message": "Setup completed successfully"}

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection not available")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_app_settings():
    if db is None:
        return AppSettings().model_dump()
    settings = await db.settings.find_one({"id": "app_settings"}, {"_id": 0})
    if not settings:
        default_settings = AppSettings()
        await db.settings.insert_one(default_settings.model_dump())
        return default_settings.model_dump()
    return settings

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_count = await db.users.count_documents({})
    role = "admin" if user_count == 0 else "user"
    
    user = User(email=user_data.email, name=user_data.name, role=role)
    user_doc = user.model_dump()
    user_doc["password_hash"] = hash_password(user_data.password)
    
    await db.users.insert_one(user_doc)
    token = create_token(user.id, user.email)
    
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"], user["email"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role", "user")}
    }

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    user = await db.users.find_one({"email": request.email})
    
    # Always return 200 for security, but only process if user exists
    if user:
        reset_code = f"{uuid.uuid4().int % 1000000:06d}"
        expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        
        await db.users.update_one(
            {"email": request.email},
            {"$set": {"reset_token": reset_code, "reset_token_expiry": expiry.isoformat()}}
        )
        
        settings = await get_app_settings()
        company = settings.get("company_name", "Service Renewal Hub")
        
        # Simple HTML content
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Code</h2>
            <p>You requested to reset your password for {company}.</p>
            <div style="background: #f4f4f5; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px;">{reset_code}</span>
            </div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
        </div>
        """
        
        # Use existing email sending function
        background_tasks.add_task(
            send_email,
            to_email=request.email,
            subject=f"Password Reset Code - {company}",
            html_content=html_content
        )

    return {"message": "If this email exists, a reset code has been sent."}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    user = await db.users.find_one({"email": request.email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request")
        
    token = user.get("reset_token")
    expiry_str = user.get("reset_token_expiry")
    
    if not token or not expiry_str:
        raise HTTPException(status_code=400, detail="No reset requested")
        
    if token != request.code:
        raise HTTPException(status_code=400, detail="Invalid code")
        
    expiry = datetime.fromisoformat(expiry_str)
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Code expired")
        
    # Update password
    password_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {
            "password_hash": password_hash,
            "reset_token": None,
            "reset_token_expiry": None
        }}
    )
    
    return {"message": "Password reset successfully"}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.get("/settings/public")
async def get_public_settings():
    settings = await get_app_settings()
    return {
        "company_name": settings.get("company_name", "Your Organization"),
        "company_tagline": settings.get("company_tagline", "Service Management System"),
        "logo_url": settings.get("logo_url", ""),
        "primary_color": settings.get("primary_color", "#06b6d4"),
        "theme_mode": settings.get("theme_mode", "dark"),
        "accent_color": settings.get("accent_color", "#06b6d4")
    }

# ==================== USER MANAGEMENT ====================

@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_admin_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(get_admin_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_data.role == "user" and existing.get("role") == "admin":
        admin_count = await db.users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")
    
    update_data = {k: v for k, v in user_data.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    if existing.get("role") == "admin":
        admin_count = await db.users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    
    await db.users.delete_one({"id": user_id})
    return {"message": "User deleted successfully"}

# ==================== CATEGORIES ====================

@api_router.get("/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    # Global categories for everyone
    user_categories = await db.categories.find(
        {}, 
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    for cat in user_categories:
        count = await db.services.count_documents({"category_id": cat["id"]})
        cat["service_count"] = count
    
    return {"categories": user_categories}

@api_router.get("/categories/with-services")
async def get_categories_with_services(current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    # Global categories for everyone
    user_categories = await db.categories.find(
        {}, 
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    uncategorized_services = await db.services.find(
        {"$or": [{"category_id": None}, {"category_id": ""}]},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "expiry_date": 1}
    ).to_list(1000)
    
    result = []
    
    for cat in user_categories:
        services = await db.services.find(
            {"category_id": cat["id"]},
            {"_id": 0, "id": 1, "name": 1, "status": 1, "expiry_date": 1}
        ).to_list(1000)
        result.append({
            **cat,
            "services": services,
            "service_count": len(services)
        })
    
    if uncategorized_services:
        result.append({
            "id": "uncategorized",
            "name": "Uncategorized",
            "description": "Services without a category",
            "color": "#71717a",
            "icon": "inbox",
            "services": uncategorized_services,
            "service_count": len(uncategorized_services)
        })
    
    return {"categories": result}

@api_router.post("/categories")
async def create_category(category_data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    # Check globally for duplicate name
    existing = await db.categories.find_one({
        "name": {"$regex": f"^{category_data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category = Category(
        user_id=current_user["id"],
        **category_data.model_dump()
    )
    await db.categories.insert_one(category.model_dump())
    return category

@api_router.put("/categories/{category_id}")
async def update_category(
    category_id: str, 
    category_data: CategoryUpdate, 
    current_user: dict = Depends(get_current_user)
):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    existing = await db.categories.find_one({
        "id": category_id,
        "user_id": current_user["id"]
    }, {"_id": 0})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {k: v for k, v in category_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    if update_data:
        await db.categories.update_one({"id": category_id}, {"$set": update_data})
    
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return updated

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    existing = await db.categories.find_one({
        "id": category_id
    }, {"_id": 0})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await db.services.update_many(
        {"category_id": category_id},
        {"$set": {"category_id": None, "category_name": "Uncategorized"}}
    )
    
    await db.categories.delete_one({"id": category_id})
    return {"message": "Category deleted successfully"}

# ==================== SERVICES ====================

@api_router.get("/services")
async def get_services(
    category_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    query = {}
    if category_id:
        if category_id == "uncategorized":
            query["$or"] = [{"category_id": None}, {"category_id": ""}]
        else:
            query["category_id"] = category_id
    
    services = await db.services.find(query, {"_id": 0}).to_list(1000)
    return services

@api_router.post("/services")
async def create_service(service_data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    data = service_data.model_dump()
    
    if data.get("expiry_duration_months") and not data.get("expiry_date"):
        from dateutil.relativedelta import relativedelta
        expiry = datetime.now(timezone.utc) + relativedelta(months=data["expiry_duration_months"])
        data["expiry_date"] = expiry.isoformat()
    
    if data.get("category_id"):
        category = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0})
        if category:
            data["category_name"] = category["name"]
    
    if not data.get("reminder_thresholds"):
        data["reminder_thresholds"] = [
            {"id": str(uuid.uuid4()), "days_before": 30, "label": "First reminder"},
            {"id": str(uuid.uuid4()), "days_before": 7, "label": "Second reminder"},
            {"id": str(uuid.uuid4()), "days_before": 1, "label": "Final reminder"}
        ]
    else:
        for threshold in data["reminder_thresholds"]:
            if "id" not in threshold:
                threshold["id"] = str(uuid.uuid4())
    
    if data.get("owners"):
        for owner in data["owners"]:
            if "id" not in owner:
                owner["id"] = str(uuid.uuid4())
    
    data["user_id"] = current_user["id"]
    
    service = Service(**data)
    await db.services.insert_one(service.model_dump())
    return service

@api_router.get("/services/{service_id}")
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service

@api_router.put("/services/{service_id}")
async def update_service(service_id: str, service_data: ServiceUpdate, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    existing = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Service not found")
    
    update_data = {k: v for k, v in service_data.model_dump().items() if v is not None}
    
    if update_data.get("expiry_duration_months"):
        from dateutil.relativedelta import relativedelta
        expiry = datetime.now(timezone.utc) + relativedelta(months=update_data["expiry_duration_months"])
        update_data["expiry_date"] = expiry.isoformat()
    
    if update_data.get("category_id"):
        category = await db.categories.find_one({"id": update_data["category_id"]}, {"_id": 0})
        if category:
            update_data["category_name"] = category["name"]
    
    if update_data.get("reminder_thresholds"):
        for threshold in update_data["reminder_thresholds"]:
            if "id" not in threshold:
                threshold["id"] = str(uuid.uuid4())
    
    if update_data.get("owners"):
        for owner in update_data["owners"]:
            if "id" not in owner:
                owner["id"] = str(uuid.uuid4())
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    if "reminder_thresholds" in update_data:
        update_data["notifications_sent"] = []
    
    await db.services.update_one({"id": service_id}, {"$set": update_data})
    updated = await db.services.find_one({"id": service_id}, {"_id": 0})
    return updated

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service deleted successfully"}

# ==================== EMAIL ROUTES ====================

@api_router.get("/email-logs")
async def get_email_logs(current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    logs = await db.email_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(200)
    return logs

@api_router.get("/notification-logs")
async def get_notification_logs(current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    # Fetch all logs, sorted by most recent
    logs = await db.notification_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(None)
    return logs

@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    # Only admin should see API keys/passwords? 
    # Frontend handles masking, but safe to omit or mask here
    settings_doc = await db.settings.find_one({"id": "app_settings"}, {"_id": 0})
    if not settings_doc:
        settings_doc = AppSettings().model_dump()
        settings_doc["mongo_url"] = os.environ.get("MONGO_URL", "")
        settings_doc["db_name"] = os.environ.get("DB_NAME", "")
        await db.settings.insert_one(settings_doc)
    else:
        # Fill in DB settings from env if missing in doc
        if not settings_doc.get("mongo_url"):
            settings_doc["mongo_url"] = os.environ.get("MONGO_URL", "")
        if not settings_doc.get("db_name"):
            settings_doc["db_name"] = os.environ.get("DB_NAME", "")
        
    return settings_doc

@api_router.put("/settings/update")
async def update_settings(update_data: dict, current_user: dict = Depends(get_admin_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    
    # Filter out empty passwords to avoid overwriting with empty
    clean_data = {k: v for k, v in update_data.items() if v is not None}
    
    await db.settings.update_one(
        {"id": "app_settings"},
        {"$set": {**clean_data, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": current_user["email"]}},
        upsert=True
    )
    return {"message": "Settings updated"}

@api_router.post("/upload/logo")
async def upload_logo(file: UploadFile = File(...), current_user: dict = Depends(get_admin_user)):
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = Path(__file__).parent / "static" / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize filename
        file_extension = Path(file.filename).suffix
        new_filename = f"company_logo_{int(datetime.now().timestamp())}{file_extension}"
        file_location = upload_dir / new_filename
        
        with open(file_location, "wb+") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return the URL - Assuming backend is engaged via /api, 
        # but static mount is at root /static. 
        # We need to construct absolute or relative URL.
        # Since Nginx proxies /api, we should probably access this via /api/static if we proxied it.
        # But we mounted it at app root /static.
        # Let's return a relative URL that frontend can prepend backend URL to, or an absolute one.
        
        # Nginx Config issues: Nginx proxies /api to backend. It doesn't proxy /static.
        # We should rely on Nginx serving /static? 
        # Simpler: Return full URL if we knew the host.
        # Safer: Return relative path "/static/uploads/..." and let Frontend handle it.
        # Wait, if Nginx only exposes / and /api, accessing /static directly won't work unless we add Nginx rule.
        
        return {"url": f"/api/static/uploads/{new_filename}"} 
    except Exception as e:
        logger.error(f"Logo upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

def generate_email_html(settings: dict, title: str, content: str) -> str:
    """
    Generates a professional, branded HTML email template.
    """
    company_name = settings.get("company_name", "Service Renewal Hub")
    primary_color = settings.get("primary_color", "#06b6d4")
    accent_color = settings.get("accent_color", "#06b6d4")
    
    # Ensure colors are valid hex strings for email clients
    if not primary_color.startswith("#"): primary_color = "#06b6d4"
    
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5; color: #18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5; min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                
                <!-- Main Container -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                    
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: {primary_color}; padding: 30px 40px;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;">{company_name}</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #27272a;">{title}</h2>
                            <div style="font-size: 16px; line-height: 1.6; color: #52525b;">
                                {content}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- View Button (Optional, maybe for dashboard link in future) -->
                    <!-- 
                    <tr>
                        <td align="center" style="padding-bottom: 40px;">
                            <a href="#" style="display: inline-block; background-color: {primary_color}; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Dashboard</a>
                        </td>
                    </tr>
                    -->

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                                © {datetime.now().year} {company_name}. All rights reserved.
                            </p>
                            <p style="margin: 8px 0 0 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                                This is an automated notification from your Service Renewal Hub.
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- Sub-footer -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td align="center" style="padding-top: 20px;">
                            <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                                Powered by <a href="#" style="color: #a1a1aa; text-decoration: underline;">Service Renewal Hub</a>
                            </p>
                        </td>
                    </tr>
                </table>
                
            </td>
        </tr>
    </table>
</body>
</html>
    """

async def send_email(to_email: str, subject: str, html_content: str) -> tuple[bool, str]:
    global db
    log_debug_email(f"Attempting to send email to {to_email} with subject: {subject}")
    if db is None: 
        log_debug_email("DEBUG: db is None in send_email")
        return False, "Database connection not available"
    settings = await db.settings.find_one({"id": "app_settings"})
    if not settings: 
        log_debug_email("DEBUG: app_settings not found")
        return False, "App settings not found in database"
    
    sender_email = settings.get("sender_email", "onboarding@resend.dev")
    sender_name = settings.get("sender_name", "Service Renewal Hub")
    provider = settings.get("email_provider", "resend")
    
    log_debug_email(f"DEBUG: Provider={provider}, Sender={sender_email}")
    
    # Generate branded HTML
    full_html = generate_email_html(settings, subject, html_content)
    
    try:
        if provider == "resend":
            api_key = settings.get("resend_api_key")
            if not api_key: 
                log_debug_email("DEBUG: Resend API key missing")
                return False, "Resend API key missing"
            resend.api_key = api_key
            log_debug_email(f"Calling resend.Emails.send with From: {sender_name} <{sender_email}>, To: {to_email}")
            r = resend.Emails.send({
                "from": f"{sender_name} <{sender_email}>",
                "to": to_email,
                "subject": subject,
                "html": full_html
            })
            log_debug_email(f"Resend response: {r}")
            if not r:
                log_debug_email("Resend returned empty response")
                return False, "Resend API returned empty response"
            return True, "Email sent successfully via Resend"
        else:
            # SMTP
            host = settings.get("smtp_host")
            port = settings.get("smtp_port", 587)
            username = settings.get("smtp_username")
            password = settings.get("smtp_password")
            use_tls = settings.get("smtp_use_tls", True)
            
            log_debug_email(f"DEBUG: Using SMTP: {host}:{port} (User: {username}, TLS: {use_tls})")
            
            message = MIMEMultipart()
            message["From"] = f"{sender_name} <{sender_email}>"
            message["To"] = to_email
            message["Subject"] = subject
            message.attach(MIMEText(full_html, "html"))
            
            # Create SSL context with certifi, fallback to system default
            try:
                context = ssl.create_default_context(cafile=certifi.where())
            except Exception as e:
                log_debug_email(f"Warning: certifi failed ({e}), using system default SSL context")
                context = ssl.create_default_context()
            
            # Helper to determine mode
            # If port is 465, we usually want implicit TLS (use_tls=True in aiosmtplib)
            # If port is 587, we usually want STARTTLS (start_tls=True in aiosmtplib)
            
            # The setting 'smtp_use_tls' usually means "Secure connection".
            # Let's infer based on port if not explicit.
            
            is_implicit_tls = (port == 465)
            use_start_tls = use_tls and (port != 465)
            
            log_debug_email(f"SMTP Config: Implicit TLS={is_implicit_tls}, STARTTLS={use_start_tls}")

            await aiosmtplib.send(
                message,
                hostname=host,
                port=port,
                username=username,
                password=password,
                use_tls=is_implicit_tls,
                start_tls=use_start_tls,
                tls_context=context
            )
            log_debug_email(f"SMTP email sent successfully to {to_email}")
            return True, "Email sent successfully via SMTP"
    except Exception as e:
        log_debug_email(f"CRITICAL: Email send failed for {to_email}: {str(e)}")
        logger.error(f"Email send failed for {to_email}: {str(e)}", exc_info=True)
        return False, f"Email send failed: {str(e)}"

@api_router.post("/settings/test-email")
async def send_test_email(current_user: dict = Depends(get_admin_user)):
    success, error_msg = await send_email(
        current_user["email"],
        "Test Email from Service Renewal Hub",
        "<p>This is a test email to verify your email configuration.</p>"
    )
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {error_msg}")
    return {"message": "Test email sent"}

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    global db
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
        
    try:
        # Determine query based on user role
        query = {}
        if current_user["role"] != "admin":
             # For non-admin, only show services they own or where they are listed as an owner
            query = {
                "$or": [
                     {"user_id": current_user["id"]},
                     {"owners.email": current_user["email"]}
                ]
            }

        services = await db.services.find(query).to_list(length=None)
        
        total = len(services)
        expiring_soon = 0
        expired = 0
        safe = 0
        total_cost = 0.0
        
        now = datetime.now(timezone.utc)
        
        for service in services:
            total_cost += service.get("cost", 0.0)
            if service.get("expiry_date"):
                try:
                    expiry_date = datetime.fromisoformat(service["expiry_date"].replace('Z', '+00:00'))
                    days_until = (expiry_date - now).days
                    
                    if days_until < 0:
                        expired += 1
                    elif days_until <= 30:
                        expiring_soon += 1
                    else:
                        safe += 1
                except ValueError:
                    # distinct 'safe' if invalid date? or just ignore
                    pass
            else:
                 # No expiry date is technically 'safe' from expiry
                 safe += 1

        return {
            "total": total,
            "expiring_soon": expiring_soon,
            "expired": expired,
            "safe": safe,
            "total_cost": total_cost
        }
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@api_router.post("/services/{service_id}/send-reminder")
async def send_manual_reminder(service_id: str, current_user: dict = Depends(get_current_user)):
    if db is None: raise HTTPException(status_code=503, detail="Database not ready")
    service = await db.services.find_one({"id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    owners = service.get("owners", [])
    log_debug_email(f"Manual reminder requested for service: {service['name']} (ID: {service_id}). Owners count: {len(owners)}")
    logger.info(f"Manual reminder requested for service: {service['name']} (ID: {service_id}). Owners count: {len(owners)}")
    
    if not owners:
        logger.warning(f"No owners found for service {service_id}")
        return {"message": "No owners to notify"}
        
    sent_count = 0
    for owner in owners:
        email = owner.get("email")
        if email:
            logger.info(f"Sending manual reminder to {email} for service {service['name']}")
            success, _ = await send_email(
                email,
                f"Reminder: {service['name']} Expiry",
                f"<p>The service <strong>{service['name']}</strong> is expiring on {service.get('expiry_date')}.</p>"
            )
            if success: 
                sent_count += 1
                logger.info(f"Manual reminder sent to {email}")
            else:
                logger.error(f"Failed to send manual reminder to {email}")
            
            # Log notification
            await db.notification_logs.insert_one({
                "id": str(uuid.uuid4()),
                "service_id": service_id,
                "service_name": service["name"],
                "recipient_email": email,
                "recipient_name": owner.get("name", ""),
                "type": "manual_reminder",
                "status": "sent" if success else "failed",
                "sent_at": datetime.now(timezone.utc).isoformat()
            })
        else:
            logger.warning(f"Owner {owner.get('name')} in service {service_id} has no email address")

    logger.info(f"Manual reminder process complete. Sent {sent_count} emails.")
    return {"message": f"Reminders sent to {sent_count} recipients"}


async def check_expiring_services():
    if db is None: return
    
    settings = await db.settings.find_one({"id": "app_settings"}) or {}
    thresholds = settings.get("notification_thresholds", [30, 7, 1])
    
    now = datetime.now(timezone.utc)
    services = await db.services.find({}).to_list(None)
    
    for service in services:
        if not service.get("expiry_date"): continue
        
        try:
            expiry = datetime.fromisoformat(service["expiry_date"].replace('Z', '+00:00'))
        except ValueError:
            continue
            
        days_until = (expiry - now).days
        
        # Check thresholds
        for days in thresholds:
            if days_until == days:
                # Send notification
                owners = service.get("owners", [])
                for owner in owners:
                    if owner.get("email"):
                        await send_email(
                            owner["email"],
                            f"Action Required: {service['name']} Expiring Soon",
                            f"<p>Service <strong>{service['name']}</strong> expires in {days} days on {service['expiry_date']}.</p>"
                        )
                        # Log it
                        await db.notification_logs.insert_one({
                            "id": str(uuid.uuid4()),
                            "service_id": service["id"],
                            "service_name": service["name"],
                            "recipient_email": owner["email"],
                            "recipient_name": owner.get("name", ""),
                            "days_until_expiry": days,
                            "sent_at": datetime.now(timezone.utc).isoformat(),
                            "type": "auto_reminder"
                        })

@api_router.post("/check-expiring")
async def trigger_expiry_check(current_user: dict = Depends(get_current_user)):
    """Manually trigger expiry check"""
    # Run in background to avoid blocking
    asyncio.create_task(check_expiring_services())
    return {"message": "Expiry check triggered"}

app.include_router(api_router)

# ==================== LIFECYCLE EVENTS ====================

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup_event():
    logger.info("Application starting up...")
    await connect_db()
    
    # Schedule automated expiry check
    scheduler.add_job(check_expiring_services, CronTrigger(hour=9, minute=0)) # Run daily at 9 AM
    scheduler.start()
    logger.info("Scheduler started. Expiry checks scheduled for 9:00 AM UTC.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Application shutting down...")
    scheduler.shutdown()
    if mongo_client:
        mongo_client.close()


