"""Tests para rate limiting."""

from modules.rate_limit import check_rate_limit


def test_rate_limit_initial_request():
    """Test que la primera solicitud pasa."""
    ok, msg, retry = check_rate_limit("192.168.1.1")
    assert ok is True
    assert msg == ""
    assert retry is None


def test_rate_limit_burst():
    """Test límite de ráfaga (burst limit)."""
    ip = "192.168.1.2"

    # Hacer múltiples solicitudes
    for i in range(9):  # Excede el límite de 8
        ok, msg, retry = check_rate_limit(ip)
        if i < 8:
            assert ok is True, f"Solicitud {i} debería pasar"
        else:
            assert ok is False, f"Solicitud {i} debería ser rechazada"
            assert "Too many requests" in msg
            assert retry is not None


def test_rate_limit_different_ips():
    """Test que diferentes IPs tienen límites separados."""
    ip1 = "192.168.1.100"
    ip2 = "192.168.1.101"

    # Ambas IPs deberían poder hacer solicitudes iniciales
    ok1, _, _ = check_rate_limit(ip1)
    ok2, _, _ = check_rate_limit(ip2)

    assert ok1 is True
    assert ok2 is True
