"""Consistent API error format: {"error": {"code", "message", "details"}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.security import AuthError


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, details=None):
        self.message = message
        self.code = code or self.code
        self.details = details
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ExpiredError(AppError):
    status_code = 410
    code = "expired"


class ValidationAppError(AppError):
    status_code = 422
    code = "validation_error"


class ConversionError(AppError):
    status_code = 422
    code = "conversion_failed"


class UnsupportedFormatError(AppError):
    status_code = 415
    code = "unsupported_format"


class FileTooLargeError(AppError):
    status_code = 413
    code = "file_too_large"


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"


def _error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body: dict = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError):
        return _error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(AuthError)
    async def _auth_error(_request: Request, exc: AuthError):
        return _error_response(401, "unauthorized", exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(part) for part in err.get("loc", [])), "message": err.get("msg", "")}
            for err in exc.errors()
        ]
        return _error_response(422, "validation_error", "The request data is invalid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "http_error"
        return _error_response(exc.status_code, code, str(exc.detail))
