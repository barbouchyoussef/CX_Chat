from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.reference import router as reference_router
from app.api.routes.client import router as client_router
from app.api.routes.admin_reference import router as admin_reference_router
from app.api.routes.admin_capability import router as admin_capability_router
from app.api.routes.admin_analytics import router as admin_analytics_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(assessments_router, tags=["assessments"])
api_router.include_router(reference_router, tags=["reference"])
api_router.include_router(client_router, tags=["client"])
api_router.include_router(admin_reference_router, tags=["admin-reference"])
api_router.include_router(admin_capability_router, tags=["admin-capability"])
api_router.include_router(admin_analytics_router, tags=["admin-analytics"])
