# Generic router module for the Databricks app template
# Add your FastAPI routes here

from fastapi import APIRouter

from server.routers.databricks import router as databricks_router
from server.routers.discovery import router as discovery_router
from server.routers.eval_mode import router as eval_mode_router
from server.routers.users import router as users_router
from server.routers.workshops import router as workshops_router

router = APIRouter()
router.include_router(workshops_router, prefix="/workshops", tags=["workshops"])
router.include_router(discovery_router, prefix="/workshops", tags=["discovery"])
router.include_router(eval_mode_router, prefix="/workshops", tags=["eval-mode"])
router.include_router(users_router, prefix="/users", tags=["users"])
router.include_router(databricks_router, prefix="/databricks", tags=["databricks"])
