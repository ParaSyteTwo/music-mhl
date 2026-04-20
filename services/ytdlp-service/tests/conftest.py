import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture
def client():
    """Fixture para cliente de prueba FastAPI."""
    return TestClient(app)


@pytest.fixture
def valid_service_key():
    """Fixture para clave de servicio válida."""
    return "test-key-12345"
