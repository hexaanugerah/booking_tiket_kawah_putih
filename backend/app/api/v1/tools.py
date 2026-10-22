from fastapi import APIRouter

from app.services.capabilities import capabilities_snapshot
from app.services.registry import CATEGORIES, supported_formats, tools_public

router = APIRouter(tags=["formats"])


@router.get("/formats")
def list_formats():
    return {
        "tools": tools_public(),
        "categories": CATEGORIES,
        "formats": supported_formats(),
        "capabilities": capabilities_snapshot(),
    }
